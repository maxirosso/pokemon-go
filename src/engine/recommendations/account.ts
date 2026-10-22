import { ivPercent } from '../combat/cp';
import { speciesDisplayName } from '../reference/referenceData';
import { POKEMON_TYPES, type GoalId, type PokemonType } from '../types';
import { analyzePokemon, buildPeerIndex, buildPeerIndexAsync, type PeerIndex } from './analysis';
import {
  ROLE_LABEL,
  type AnalysisContext,
  type PokemonAnalysis,
  type RoleId,
  type TypeCoverageEntry,
  type Verdict,
} from './types';

export interface AccountAction {
  id: string;
  analysis: PokemonAnalysis;
  verdict: Verdict;
}

export type InsightKind = 'coverage' | 'evolution' | 'moves' | 'redundant' | 'underdeveloped' | 'unused-iv' | 'pvp' | 'data' | 'resources' | 'raid';

export interface Insight {
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  severity: 'info' | 'opportunity' | 'warning';
  /** In-app deep link (Expo Router path). */
  href: string;
}

export interface Priority {
  rank: number;
  action: AccountAction;
  title: string;
  why: string;
  resources: string;
}

export interface Readiness {
  /** 0–100 average of the best attackers' current scores. */
  score: number;
  basedOn: number;
  needed: number;
}

export interface GoalProgress {
  goal: GoalId;
  label: string;
  /** 0–100 or null when there is not enough data (never fabricated). */
  progress: number | null;
  detail: string;
}

export interface AccountAnalysis {
  analyses: PokemonAnalysis[];
  actions: AccountAction[];
  coverage: TypeCoverageEntry[];
  missingTypes: PokemonType[];
  weakTypes: PokemonType[];
  raidReadiness: Readiness | null;
  pvpReadiness: Record<'great' | 'ultra' | 'master', Readiness | null>;
  redundant: PokemonAnalysis[];
  underdeveloped: PokemonAnalysis[];
  unusedHighIv: PokemonAnalysis[];
  insights: Insight[];
  priorities: Priority[];
  roadmap: { today: AccountAction[]; thisWeek: AccountAction[]; longTerm: AccountAction[] };
  goalProgress: GoalProgress[];
  dataQuality: { total: number; withIvs: number; withCp: number; withMoves: number; rated: number };
  investable: number;
  battleReady: number;
  datasetVersion: string;
}

const ACTIONABLE = new Set(['POWER_UP', 'EVOLVE', 'CHANGE_MOVES', 'SAVE_FOR_PVP', 'WAIT_FOR_EVENT']);

const fmt = (n: number) => n.toLocaleString('en-US');

function costString(v: Verdict): string {
  const parts: string[] = [];
  if (v.cost.stardust) parts.push(`${fmt(v.cost.stardust)} Stardust`);
  if (v.cost.candy) parts.push(`${fmt(v.cost.candy)} Candy`);
  if (v.cost.xlCandy) parts.push(`${fmt(v.cost.xlCandy)} Candy XL`);
  parts.push(...v.cost.extras);
  return parts.length ? parts.join(' + ') : 'No resources needed';
}

export interface AnalyzeOptions {
  onProgress?: (done: number, total: number) => void;
  peers?: PeerIndex;
}

export async function analyzeCollection(ctx: AnalysisContext, opts: AnalyzeOptions = {}): Promise<AccountAnalysis> {
  const total = ctx.collection.length;
  // phase 1 (first half of the progress bar): rate every Pokémon; phase 2: verdicts
  const ownPeers = !opts.peers;
  const peers = opts.peers ?? (await buildPeerIndexAsync(ctx, (d) => opts.onProgress?.(d / 2, total)));
  const analyses: PokemonAnalysis[] = [];
  let last = Date.now();
  let i = 0;
  for (const p of ctx.collection) {
    const a = analyzePokemon(ctx, p, peers);
    if (a) analyses.push(a);
    i += 1;
    if (Date.now() - last > 12) {
      opts.onProgress?.(ownPeers ? total / 2 + i / 2 : i, total);
      await new Promise<void>((r) => setTimeout(r, 0));
      last = Date.now();
    }
  }
  opts.onProgress?.(total, total);
  return summarizeAccount(ctx, analyses, peers);
}

/** Synchronous variant (tests, small collections). */
export function analyzeCollectionSync(ctx: AnalysisContext): AccountAnalysis {
  const peers = buildPeerIndex(ctx);
  const analyses = ctx.collection.flatMap((p) => {
    const a = analyzePokemon(ctx, p, peers);
    return a ? [a] : [];
  });
  return summarizeAccount(ctx, analyses, peers);
}

export function summarizeAccount(ctx: AnalysisContext, analyses: PokemonAnalysis[], peers: PeerIndex): AccountAnalysis {
  const { ref } = ctx;
  const actions: AccountAction[] = analyses
    .filter((a) => ACTIONABLE.has(a.verdict.action) && a.verdict.impact > 0)
    .map((a) => ({ id: a.pokemon.id, analysis: a, verdict: a.verdict }))
    .sort((x, y) => y.verdict.impact - x.verdict.impact);

  // ---- data quality ----
  const withIvs = analyses.filter((a) => a.knowledge.ivsKnown).length;
  const withCp = analyses.filter((a) => a.pokemon.cp != null).length;
  const withMoves = analyses.filter((a) => a.pokemon.fastMove && a.pokemon.chargedMove1).length;
  const rated = analyses.filter((a) => a.knowledge.candidates.length > 0).length;

  // ---- raid type coverage (from current-species ratings) ----
  const coverage: TypeCoverageEntry[] = POKEMON_TYPES.map((t) => ({ type: t, best: null, count: 0 }));
  for (const peer of peers.values()) {
    if (!peer.raidType) continue;
    const r = peer.ratings.raid;
    if (r.potential === null) continue;
    const entry = coverage.find((c) => c.type === peer.raidType);
    if (!entry) continue;
    entry.count += 1;
    const score = r.now ?? r.potential * 0.5;
    const bestScore = entry.best ? (entry.best.now ?? entry.best.potential * 0.5) : -1;
    if (score > bestScore) entry.best = { pokemon: peer.pokemon, species: peer.species, potential: r.potential, now: r.now };
  }
  const enough = rated >= 8;
  const missingTypes = enough ? coverage.filter((c) => c.count === 0).map((c) => c.type) : [];
  const weakTypes = enough
    ? coverage.filter((c) => c.best && (c.best.now ?? 0) < 70 && (c.best.potential ?? 0) < 85).map((c) => c.type)
    : [];

  // ---- readiness (only with enough data) ----
  const readiness = (vals: number[], need: number): Readiness | null => {
    if (vals.length < need) return null;
    const top = [...vals].sort((a, b) => b - a).slice(0, need);
    return { score: Math.round(top.reduce((s, v) => s + v, 0) / need), basedOn: vals.length, needed: need };
  };
  const nowVals = (role: RoleId) =>
    [...peers.values()].flatMap((p) => {
      const r = p.ratings[role];
      return r.now !== null ? [r.now] : [];
    });
  const raidReadiness = readiness(nowVals('raid'), 6);
  const pvpReadiness = {
    great: readiness(nowVals('great'), 3),
    ultra: readiness(nowVals('ultra'), 3),
    master: readiness(nowVals('master'), 3),
  };

  // ---- diagnoses ----
  const redundant = analyses.filter((a) => a.verdict.action === 'KEEP' && a.betterOwned.length >= 2 && a.verdict.headline.includes('BETTER OPTIONS'));
  const underdeveloped = analyses.filter((a) => {
    const role = a.verdict.role;
    if (!role) return false;
    const r = a.ratings[role];
    return r.potential !== null && r.potential >= 85 && r.now !== null && r.potential - r.now >= 20;
  });
  const unusedHighIv = analyses.filter(
    (a) => a.knowledge.ivs && ivPercent(a.knowledge.ivs) >= 93 && a.verdict.action === 'DONT_INVEST',
  );

  // ---- insights (every one links to an actionable screen) ----
  const insights: Insight[] = [];
  if (!enough && analyses.length > 0) {
    insights.push({
      id: 'data-quality',
      kind: 'data',
      title: 'Add more details for sharper advice',
      body: `${rated} of ${analyses.length} Pokémon have enough data to be rated. Add CP and IVs (or import screenshots) — coverage and readiness stats appear once at least 8 are rated.`,
      severity: 'info',
      href: '/import',
    });
  }
  if (enough && missingTypes.length) {
    insights.push({
      id: 'missing-types',
      kind: 'coverage',
      title: `No ${missingTypes.slice(0, 3).join(' / ')}-type raid attackers`,
      body: `You have no attacker using ${missingTypes.join(', ')} moves. Bosses weak to those types would be hard to counter.`,
      severity: 'warning',
      href: '/pokedex?filter=missing',
    });
  }
  if (enough && weakTypes.length) {
    const t = weakTypes[0];
    const c = coverage.find((x) => x.type === t);
    insights.push({
      id: `weak-${t}`,
      kind: 'coverage',
      title: `Your collection lacks strong ${t}-type raid attackers`,
      body: c?.best
        ? `Your best is ${speciesDisplayName(c.best.species)} (${c.best.now ?? '?'}/100 now, ${c.best.potential}/100 potential).`
        : `No ${t} attacker with enough data.`,
      severity: 'opportunity',
      href: '/(tabs)/battle',
    });
  }
  for (const a of actions.filter((x) => x.verdict.action === 'EVOLVE').slice(0, 2)) {
    insights.push({
      id: `evolve-${a.id}`,
      kind: 'evolution',
      title: `Evolve your ${speciesDisplayName(a.analysis.species)}`,
      body: a.verdict.expectedBenefit,
      severity: 'opportunity',
      href: `/pokemon/${a.id}`,
    });
  }
  for (const a of actions.filter((x) => x.verdict.action === 'CHANGE_MOVES').slice(0, 2)) {
    insights.push({
      id: `moves-${a.id}`,
      kind: 'moves',
      title: `${speciesDisplayName(a.analysis.species)} needs better moves`,
      body: a.verdict.expectedBenefit,
      severity: 'opportunity',
      href: `/pokemon/${a.id}`,
    });
  }
  for (const a of underdeveloped.slice(0, 2)) {
    insights.push({
      id: `underdeveloped-${a.pokemon.id}`,
      kind: 'underdeveloped',
      title: `Power up your ${speciesDisplayName(a.species)}`,
      body: a.verdict.expectedBenefit,
      severity: 'opportunity',
      href: `/pokemon/${a.pokemon.id}`,
    });
  }
  for (const a of unusedHighIv.slice(0, 1)) {
    insights.push({
      id: `unused-${a.pokemon.id}`,
      kind: 'unused-iv',
      title: `Don't spend Stardust on this ${speciesDisplayName(a.species)} yet`,
      body: 'Excellent IVs, but the species does not rate well for raids or PvP.',
      severity: 'info',
      href: `/pokemon/${a.pokemon.id}`,
    });
  }
  if (ctx.resources.stardust === null && analyses.length > 0) {
    insights.push({
      id: 'enter-resources',
      kind: 'resources',
      title: 'Enter your Stardust and Candy',
      body: 'Recommendations can only check affordability once your resources are entered.',
      severity: 'info',
      href: '/resources',
    });
  }

  // ---- priorities & roadmap ----
  const priorities: Priority[] = actions.slice(0, 4).map((action, i) => ({
    rank: i + 1,
    action,
    title: `${action.verdict.headline[0]}${action.verdict.headline.slice(1).toLowerCase()} — ${speciesDisplayName(action.analysis.species)}`,
    why: action.verdict.expectedBenefit || action.verdict.explanation,
    resources: costString(action.verdict),
  }));

  const balance = ctx.resources.stardust;
  let spent = 0;
  const today: AccountAction[] = [];
  const week: AccountAction[] = [];
  const longTerm: AccountAction[] = [];
  for (const a of actions) {
    const v = a.verdict;
    const dust = v.cost.stardust;
    const canNow = v.when === 'now' && v.affordable !== false && (balance === null || spent + dust <= balance);
    if (canNow && today.length < 3) {
      today.push(a);
      spent += dust;
    } else if ((v.when === 'now' || (v.affordable !== false && v.when === 'later' && dust <= 60000)) && week.length < 5) week.push(a);
    else longTerm.push(a);
  }

  // ---- goal progress (never fabricated) ----
  const uniqueSpecies = new Set(analyses.map((a) => a.species.speciesId)).size;
  const releasedTotal = new Set(ref.listSpecies().map((s) => s.speciesId)).size;
  const goalProgress: GoalProgress[] = [
    {
      goal: 'raids',
      label: 'Raid team',
      progress: raidReadiness ? raidReadiness.score : null,
      detail: raidReadiness ? `Average of your best ${raidReadiness.needed} attackers` : 'Needs 6 rated Pokémon',
    },
    {
      goal: 'great_league',
      label: 'Great League',
      progress: pvpReadiness.great ? pvpReadiness.great.score : null,
      detail: pvpReadiness.great ? 'Best 3 league-ready Pokémon' : 'Needs 3 Pokémon with IVs',
    },
    {
      goal: 'ultra_league',
      label: 'Ultra League',
      progress: pvpReadiness.ultra ? pvpReadiness.ultra.score : null,
      detail: pvpReadiness.ultra ? 'Best 3 league-ready Pokémon' : 'Needs 3 Pokémon with IVs',
    },
    {
      goal: 'master_league',
      label: 'Master League',
      progress: pvpReadiness.master ? pvpReadiness.master.score : null,
      detail: pvpReadiness.master ? 'Best 3 league-ready Pokémon' : 'Needs 3 Pokémon with IVs',
    },
    {
      goal: 'pokedex',
      label: 'Pokédex coverage',
      progress: releasedTotal ? Math.round((uniqueSpecies / releasedTotal) * 100) : null,
      detail: `${uniqueSpecies} of ${releasedTotal} species in your collection`,
    },
  ];

  const battleReady = analyses.filter((a) =>
    (['raid', 'great', 'ultra', 'master'] as const).some((r) => (a.ratings[r].now ?? 0) >= 62),
  ).length;
  const investable = actions.filter((a) => (a.verdict.role ? (a.analysis.ratings[a.verdict.role].potential ?? 0) >= 70 : false)).length;

  return {
    analyses,
    actions,
    coverage,
    missingTypes,
    weakTypes,
    raidReadiness,
    pvpReadiness,
    redundant,
    underdeveloped,
    unusedHighIv,
    insights,
    priorities,
    roadmap: { today, thisWeek: week, longTerm },
    goalProgress,
    dataQuality: { total: analyses.length, withIvs, withCp, withMoves, rated },
    investable,
    battleReady,
    datasetVersion: ctx.datasetVersion,
  };
}

export { ROLE_LABEL };
