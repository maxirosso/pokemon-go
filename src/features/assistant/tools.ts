import { ivPercent } from '@/engine/combat/cp';
import { rankIvs } from '@/engine/pvp/pvp';
import { getRaidIndex } from '@/engine/raids/raidIndex';
import { NO_MODIFIERS, TIER_LABELS, type RaidModifiers } from '@/engine/raids/raidModel';
import { buildRaidTeam, raidVerdict } from '@/engine/raids/teamBuilder';
import { analyzeCollectionSync, type AccountAnalysis } from '@/engine/recommendations/account';
import { analyzePokemon, buildPeerIndex, type PeerIndex } from '@/engine/recommendations/analysis';
import { buildBudgetPlans } from '@/engine/recommendations/budget';
import { ROLE_LABEL, type AnalysisContext, type PokemonAnalysis, type RoleId } from '@/engine/recommendations/types';
import { normalizeName, speciesDisplayName } from '@/engine/reference/referenceData';
import { compileSearch } from '@/engine/search/query';
import { LEAGUES, type LeagueId, type OwnedPokemon } from '@/engine/types';
import { leagueRows } from '@/features/pvp/leagueCandidates';

/**
 * Controlled application tools the AI coach may call. Every tool is deterministic TypeScript over the
 * player's local data and the validated reference datasets — the language model only *reads* these
 * results and explains them; it never computes game statistics itself.
 */

export interface ToolEnv {
  ctx: AnalysisContext;
  account: AccountAnalysis;
  peers: PeerIndex;
}

export function makeToolEnv(ctx: AnalysisContext, account?: AccountAnalysis | null, peers?: PeerIndex | null): ToolEnv {
  const p = peers ?? buildPeerIndex(ctx);
  return { ctx, account: account ?? analyzeCollectionSync(ctx), peers: p };
}

const r1 = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
const ivStr = (p: OwnedPokemon) => (p.ivs ? `${p.ivs.atk}/${p.ivs.def}/${p.ivs.sta}` : null);

function row(p: OwnedPokemon, a: PokemonAnalysis | undefined, env: ToolEnv) {
  const s = env.ctx.ref.getSpecies(p.speciesId, p.form);
  return {
    id: p.id,
    species: s ? speciesDisplayName(s) : `#${p.speciesId}`,
    nickname: p.nickname,
    cp: p.cp,
    ivs: ivStr(p),
    ivPercent: p.ivs ? Math.round(ivPercent(p.ivs)) : null,
    level: a?.knowledge.level ?? p.level,
    flags: [p.shiny && 'shiny', p.shadow && 'shadow', p.purified && 'purified', p.lucky && 'lucky', p.favorite && 'favorite'].filter(Boolean),
    action: a?.verdict.action ?? null,
    headline: a?.verdict.headline ?? null,
    impact: r1(a?.verdict.impact),
    potential: a
      ? { raid: a.ratings.raid.potential, great: a.ratings.great.potential, ultra: a.ratings.ultra.potential, master: a.ratings.master.potential }
      : null,
  };
}

function analysisById(env: ToolEnv, id: string): PokemonAnalysis | null {
  const hit = env.account.analyses.find((a) => a.pokemon.id === id);
  if (hit) return hit;
  const p = env.ctx.collection.find((x) => x.id === id);
  return p ? analyzePokemon(env.ctx, p, env.peers) : null;
}

function verdictJson(a: PokemonAnalysis) {
  const v = a.verdict;
  return {
    action: v.action,
    headline: v.headline,
    priority: v.priority,
    when: v.when,
    confidence: v.confidence,
    explanation: v.explanation,
    expectedBenefit: v.expectedBenefit,
    cost: { stardust: v.cost.stardust, candy: v.cost.candy, candyXl: v.cost.xlCandy, requires: v.cost.extras },
    affordable: v.affordable,
    alternative: v.alternative,
    role: v.role,
    targetLevel: v.targetLevel,
  };
}

function ratingsJson(a: PokemonAnalysis) {
  const out: Record<string, unknown> = {};
  for (const [k, r] of Object.entries(a.ratings)) {
    out[ROLE_LABEL[k as RoleId]] = { now: r.now, potential: r.potential, tier: r.tier, basis: r.basis, note: r.detail };
  }
  return out;
}

function findSpecies(env: ToolEnv, name: string) {
  const id = env.ctx.ref.findSpeciesIdByName(name);
  if (id === undefined) {
    const norm = normalizeName(name);
    const partial = env.ctx.ref.listSpecies().find((s) => normalizeName(s.name).startsWith(norm));
    return partial;
  }
  return env.ctx.ref.getSpecies(id);
}

export type ToolName =
  | 'get_account_summary'
  | 'list_pokemon'
  | 'get_pokemon_analysis'
  | 'get_top_priorities'
  | 'plan_budget'
  | 'build_raid_team'
  | 'get_pvp_candidates'
  | 'compare_pokemon'
  | 'get_species_info'
  | 'find_pvp_only_pokemon';

type Args = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : undefined);

export const TOOLS: Record<ToolName, (env: ToolEnv, args: Args) => unknown> = {
  get_account_summary(env) {
    const { ctx, account } = env;
    const res = ctx.resources;
    return {
      trainerLevel: ctx.trainerLevel,
      goals: ctx.goals,
      collection: { ...account.dataQuality, total: ctx.collection.length },
      readiness: {
        raid: account.raidReadiness?.score ?? null,
        great: account.pvpReadiness.great?.score ?? null,
        ultra: account.pvpReadiness.ultra?.score ?? null,
        master: account.pvpReadiness.master?.score ?? null,
      },
      resources: { stardust: res.stardust, rareCandy: res.rareCandy, rareCandyXl: res.rareCandyXl, note: 'null = the player has not entered it (unknown, not zero)' },
      topPriority: account.priorities[0] ? { title: account.priorities[0].title, resources: account.priorities[0].resources } : null,
      missingRaidTypes: account.missingTypes,
      weakRaidTypes: account.weakTypes,
      datasetVersion: ctx.datasetVersion,
    };
  },

  list_pokemon(env, args) {
    const limit = Math.min(25, Math.max(1, Math.round(num(args.limit) ?? 10)));
    const search = compileSearch(str(args.query) ?? '');
    const list = env.ctx.collection.filter((p) => {
      const s = env.ctx.ref.getSpecies(p.speciesId, p.form);
      return !!s && (search.empty || search.test({ pokemon: p, species: s }));
    });
    const byId = new Map(env.account.analyses.map((a) => [a.pokemon.id, a]));
    const sort = str(args.sort) ?? 'investment';
    const key = (p: OwnedPokemon): number => {
      const a = byId.get(p.id);
      switch (sort) {
        case 'cp':
          return p.cp ?? -1;
        case 'iv':
          return p.ivs ? ivPercent(p.ivs) : -1;
        case 'raid':
          return a?.ratings.raid.potential ?? -1;
        case 'pvp':
          return Math.max(a?.ratings.great.potential ?? -1, a?.ratings.ultra.potential ?? -1, a?.ratings.master.potential ?? -1);
        case 'recent':
          return new Date(p.createdAt).getTime();
        default:
          return a?.verdict.impact ?? -1;
      }
    };
    const sorted = [...list].sort((x, y) => key(y) - key(x)).slice(0, limit);
    return { total: list.length, syntaxErrors: search.errors, rows: sorted.map((p) => row(p, byId.get(p.id), env)) };
  },

  get_pokemon_analysis(env, args) {
    const id = str(args.pokemon_id);
    const a = id ? analysisById(env, id) : null;
    if (!a) return { error: 'Unknown pokemon_id. Call list_pokemon first.' };
    return {
      pokemon: row(a.pokemon, a, env),
      verdict: verdictJson(a),
      ratings: ratingsJson(a),
      evidence: a.evidence.slice(0, 8),
      betterOwned: a.betterOwned.map((b) => ({ id: b.pokemon.id, species: speciesDisplayName(b.species), score: b.score })),
      evolutionLine: a.line.map((l) => ({ species: speciesDisplayName(l.species), value: l.value, bestRole: l.bestRole })),
      knowledge: { status: a.knowledge.status, note: a.knowledge.note },
    };
  },

  get_top_priorities(env, args) {
    const limit = Math.min(10, Math.max(1, Math.round(num(args.limit) ?? 5)));
    const { account } = env;
    const fmt = (a: AccountAnalysis['actions'][number]) => ({
      pokemonId: a.id,
      species: speciesDisplayName(a.analysis.species),
      action: a.verdict.action,
      headline: a.verdict.headline,
      priority: a.verdict.priority,
      when: a.verdict.when,
      benefit: a.verdict.expectedBenefit,
      cost: { stardust: a.verdict.cost.stardust, candy: a.verdict.cost.candy, candyXl: a.verdict.cost.xlCandy, requires: a.verdict.cost.extras },
      affordable: a.verdict.affordable,
      why: a.verdict.explanation.slice(0, 280),
    });
    return {
      priorities: account.actions.slice(0, limit).map(fmt),
      roadmap: {
        today: account.roadmap.today.map(fmt),
        thisWeek: account.roadmap.thisWeek.slice(0, 4).map(fmt),
        longTerm: account.roadmap.longTerm.slice(0, 3).map(fmt),
      },
      insights: account.insights.slice(0, 5).map((i) => ({ title: i.title, body: i.body })),
    };
  },

  plan_budget(env, args) {
    const stardust = Math.max(0, Math.round(num(args.stardust) ?? 0));
    const plans = buildBudgetPlans(env.ctx, env.account, { stardust, enforceCandy: true });
    return {
      budget: stardust,
      plans: plans.map((p) => ({
        id: p.id,
        title: p.title,
        summary: p.summary,
        totalStardust: p.totalStardust,
        items: p.items.map((i) => ({ pokemonId: i.group, label: i.label, stardust: i.stardust, candy: i.candy, candyXl: i.xlCandy, gain: r1(i.gain), staged: i.partial, stopLevel: i.stopLevel })),
        blockedByCandy: p.blockedByCandy.map((b) => b.label),
      })),
    };
  },

  build_raid_team(env, args) {
    const name = str(args.boss);
    const species = name ? findSpecies(env, name) : undefined;
    if (!species) return { error: `Unknown boss "${name ?? ''}".` };
    const listed = env.ctx.ref.raidBosses.find((b) => b.speciesId === species.speciesId);
    const tier = str(args.tier) ?? listed?.tier ?? (species.rarity === 'legendary' || species.rarity === 'mythical' ? '5' : '3');
    const weather = str(args.weather) ?? null;
    const mods: RaidModifiers = { ...NO_MODIFIERS, weather };
    const result = buildRaidTeam(env.ctx.ref, env.ctx.collection, species, tier, { mods });
    const verdict = raidVerdict(result);
    return {
      boss: speciesDisplayName(species),
      tier: TIER_LABELS[tier] ?? tier,
      bossTypes: species.types,
      verdict: { level: verdict.level, headline: verdict.headline, details: verdict.details },
      team: result.members.map((m) => ({
        pokemonId: m.pokemon.id,
        species: speciesDisplayName(m.species),
        cp: m.cp,
        score: r1(m.score),
        currentMoves: m.current ? `${m.current.fast} + ${m.current.charged}${m.currentMovesAssumed ? ' (assumed)' : ''}` : null,
        bestMoves: m.best ? `${m.best.fast} + ${m.best.charged}${m.best.elite ? ' (elite)' : ''}` : null,
        changeMoves: m.moveChangeRecommended,
        effectiveness: r1(m.effectiveness),
      })),
      estimate: { bossHpFraction: r1(result.estimate.bossHpFraction), trainersNeeded: result.estimate.trainersNeeded, caveats: result.estimate.caveats },
      coverageGaps: result.coverageGaps,
      pokemonNeedingData: result.needsData.length,
    };
  },

  get_pvp_candidates(env, args) {
    const league = (str(args.league) ?? 'great') as LeagueId;
    if (!(league in LEAGUES)) return { error: 'league must be great, ultra, master or little' };
    const limit = Math.min(15, Math.max(1, Math.round(num(args.limit) ?? 8)));
    const rows = leagueRows(env.ctx.ref, env.ctx.collection, league, env.ctx.maxPvpLevel ?? 50).slice(0, limit);
    return {
      league,
      cpCap: Number.isFinite(LEAGUES[league].cpCap) ? LEAGUES[league].cpCap : null,
      rows: rows.map((r) => ({
        pokemonId: r.pokemon.id,
        species: speciesDisplayName(r.species),
        suitability: r.suitability,
        metaSource: r.assessment.metaSource,
        ivRank: r.assessment.entry?.rank ?? null,
        productPercent: r1(r.assessment.percentOfBestProduct),
        targetLevel: r.assessment.entry?.level ?? null,
        cpAtTarget: r.assessment.entry?.cp ?? null,
        powerUpCost: r.powerUp ? { stardust: r.powerUp.stardust, candy: r.powerUp.candy, candyXl: r.powerUp.xlCandy } : null,
      })),
    };
  },

  compare_pokemon(env, args) {
    const a = analysisById(env, str(args.pokemon_id_a) ?? '');
    const b = analysisById(env, str(args.pokemon_id_b) ?? '');
    if (!a || !b) return { error: 'Unknown pokemon id(s). Call list_pokemon first.' };
    return {
      a: { pokemon: row(a.pokemon, a, env), ratings: ratingsJson(a), verdict: verdictJson(a) },
      b: { pokemon: row(b.pokemon, b, env), ratings: ratingsJson(b), verdict: verdictJson(b) },
    };
  },

  get_species_info(env, args) {
    const name = str(args.name);
    const s = name ? findSpecies(env, name) : undefined;
    if (!s) return { error: `Unknown species "${name ?? ''}".` };
    const { ref } = env.ctx;
    const idx = getRaidIndex(ref);
    const raid = idx.byKey.get(s.key);
    const rank = idx.rankOf(s.key);
    const pool = ref.movePool(s.speciesId, s.form);
    const evolutions = ref.evolutionsFrom(s.key).map((e) => ({ to: ref.getByKey(e.toKey)?.name, candy: e.candy, item: e.item ?? null, lure: e.lure ?? null }));
    return {
      species: speciesDisplayName(s),
      types: s.types,
      baseStats: s.stats,
      rarity: s.rarity,
      generation: s.generation,
      evolutions,
      movePool: pool ? { fast: pool.fast, charged: pool.charged, eliteFast: pool.eliteFast, eliteCharged: pool.eliteCharged } : null,
      raid: raid ? { bestMoveset: `${raid.fast} + ${raid.charged}`, elite: raid.elite, overallRank: rank?.overall, ofTotal: rank?.overallTotal, typeRank: rank?.type, ofType: rank?.typeTotal, note: 'estimate at 15/15/15 level 40 vs a neutral boss' } : null,
      pvp: (['great', 'ultra', 'master'] as const).map((l) => {
        const best = rankIvs(ref, s, LEAGUES[l].cpCap, 50).best;
        const meta = ref.getPvpMeta(l, s.speciesId, s.form, false);
        return { league: l, bestIvs: best ? `${best.ivs.atk}/${best.ivs.def}/${best.ivs.sta}` : null, level: best?.level ?? null, cp: best?.cp ?? null, pvpokeScore: meta?.score ?? null };
      }),
      owned: env.ctx.collection.filter((p) => p.speciesId === s.speciesId).length,
    };
  },

  find_pvp_only_pokemon(env) {
    const out = env.account.analyses
      .filter((a) => {
        const raid = a.ratings.raid.potential;
        const pvp = Math.max(a.ratings.great.potential ?? 0, a.ratings.ultra.potential ?? 0, a.ratings.master.potential ?? 0);
        return raid !== null && raid < 60 && pvp >= 70;
      })
      .map((a) => ({ ...row(a.pokemon, a, env), bestLeague: (['great', 'ultra', 'master'] as const).reduce((b, l) => ((a.ratings[l].potential ?? 0) > (a.ratings[b].potential ?? 0) ? l : b), 'great' as 'great' | 'ultra' | 'master') }))
      .slice(0, 15);
    return { count: out.length, rows: out, rule: 'raid potential < 60 and best league suitability ≥ 70' };
  },
};

export function executeTool(env: ToolEnv, name: string, args: Args): { ok: true; result: unknown } | { ok: false; error: string } {
  const fn = (TOOLS as Record<string, (e: ToolEnv, a: Args) => unknown>)[name];
  if (!fn) return { ok: false, error: `Unknown tool ${name}` };
  try {
    return { ok: true, result: fn(env, args) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Tool failed' };
  }
}

