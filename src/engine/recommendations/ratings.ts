import { calcBattleStats, maxLevelForTrainer, type IvCandidate } from '../combat/cp';
import type { Knowledge } from '../combat/knowledge';
import { assessLeague, type LeagueAssessment } from '../pvp/pvp';
import { getRaidIndex, BENCHMARK_LEVEL, gymDefenseScore } from '../raids/raidIndex';
import {
  evaluateRaidAttacker,
  genericBoss,
  NO_MODIFIERS,
  SHADOW_DEFENSE,
  type Combatant,
  type RaidEvaluation,
} from '../raids/raidModel';
import type { ReferenceData } from '../reference/referenceData';
import type { GoalWeight, GoSpecies, IVs, OwnedPokemon } from '../types';
import type { AnalysisContext, RoleId, RoleRating, Tier } from './types';

/** Tier cut-offs on the species-percentile scale (see GAME_MECHANICS.md §Ratings). */
export const TIER_CUTS: Record<Exclude<Tier, 'D'>, number> = { S: 98, A: 94, B: 80, C: 55 };

export function tierOf(score: number): Tier {
  if (score >= TIER_CUTS.S) return 'S';
  if (score >= TIER_CUTS.A) return 'A';
  if (score >= TIER_CUTS.B) return 'B';
  if (score >= TIER_CUTS.C) return 'C';
  return 'D';
}

/** PvP suitability is already a 0–100 composite, so it uses a different cut table. */
export function pvpTierOf(score: number): Tier {
  if (score >= 88) return 'S';
  if (score >= 78) return 'A';
  if (score >= 62) return 'B';
  if (score >= 45) return 'C';
  return 'D';
}

const MAX_SAMPLES = 24;

function sampleCandidates(cands: IvCandidate[], n = MAX_SAMPLES): IvCandidate[] {
  if (cands.length <= n) return cands;
  const sorted = [...cands].sort((a, b) => a.ivs.atk - b.ivs.atk || a.ivs.def - b.ivs.def || a.ivs.sta - b.ivs.sta || a.level - b.level);
  const out: IvCandidate[] = [];
  for (let i = 0; i < n; i += 1) out.push(sorted[Math.floor((i * (sorted.length - 1)) / (n - 1))]);
  return out;
}

function uniqueIvs(cands: IvCandidate[]): IVs[] {
  const seen = new Set<number>();
  const out: IVs[] = [];
  for (const c of cands) {
    const k = c.ivs.atk * 256 + c.ivs.def * 16 + c.ivs.sta;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c.ivs);
    }
  }
  return out;
}

export function roleWeights(goals: GoalWeight[]): Record<RoleId, number> {
  const w: Record<RoleId, number> = { raid: 0.55, gymAttack: 0.4, gymDefense: 0.4, great: 0.55, ultra: 0.55, master: 0.55 };
  if (goals.length === 0) return { raid: 0.8, gymAttack: 0.6, gymDefense: 0.6, great: 0.8, ultra: 0.8, master: 0.8 };
  const bump = (role: RoleId, amount: number) => {
    w[role] = Math.min(1, w[role] + amount);
  };
  for (const g of goals) {
    const a = 0.45 * g.weight;
    switch (g.goal) {
      case 'raids':
        bump('raid', a);
        bump('gymAttack', a * 0.6);
        break;
      case 'great_league':
        bump('great', a);
        break;
      case 'ultra_league':
        bump('ultra', a);
        break;
      case 'master_league':
        bump('master', a);
        break;
      case 'account_strength':
        for (const r of Object.keys(w) as RoleId[]) bump(r, a * 0.6);
        break;
      default:
        break;
    }
  }
  return w;
}

export interface RoleInputs {
  ref: ReferenceData;
  species: GoSpecies;
  shadow: boolean;
  knowledge: Knowledge;
  moves: { fast: string | null; charged: string | null };
  trainerLevel: number;
}

interface MovesetPick {
  fast: string;
  charged: string;
  elite: boolean;
}

/** Choose the best (fast, charged) pair for a representative state by `metric`. */
function pickMoveset(
  ref: ReferenceData,
  species: GoSpecies,
  rep: Combatant,
  metric: 'score' | 'dps',
  includeElite: boolean,
): (MovesetPick & { ev: RaidEvaluation }) | null {
  const pool = ref.movePool(species.speciesId, species.form);
  if (!pool) return null;
  const boss = genericBoss(ref);
  let best: (MovesetPick & { ev: RaidEvaluation }) | null = null;
  const fasts = [...pool.fast, ...(includeElite ? pool.eliteFast : [])];
  const chargeds = [...pool.charged, ...(includeElite ? pool.eliteCharged : [])];
  for (const fn of fasts) {
    const f = ref.fastMove(fn);
    if (!f) continue;
    for (const cn of chargeds) {
      const c = ref.chargedMove(cn);
      if (!c) continue;
      const ev = evaluateRaidAttacker(ref, rep, f, c, boss, NO_MODIFIERS);
      const v = metric === 'score' ? ev.score : ev.dps;
      const bv = best ? (metric === 'score' ? best.ev.score : best.ev.dps) : -1;
      if (v > bv) {
        best = { fast: fn, charged: cn, elite: pool.eliteFast.includes(fn) || pool.eliteCharged.includes(cn), ev };
      }
    }
  }
  return best;
}

function combatant(species: GoSpecies, ivs: IVs, level: number, shadow: boolean): Combatant {
  return { speciesKey: species.key, stats: species.stats, types: species.types, ivs, level, shadow };
}

export interface RaidDetail {
  bestMoveset: MovesetPick | null;
  bestNonElite: MovesetPick | null;
  currentMoveset: MovesetPick | null;
  movesAssumed: boolean;
  /** Percentile with the best non-elite moveset at the target level. */
  potentialNonElite: number | null;
  /** Percentile with the best moveset including elite moves. */
  potentialWithElite: number | null;
  rawPotentialNonElite: number | null;
  typeRank: { rank: number; total: number; type: string } | null;
}

const EMPTY_RATING = (role: RoleId, detail: string, basis: RoleRating['basis'] = 'simulation'): RoleRating => ({
  role,
  now: null,
  potential: null,
  potentialRange: null,
  tier: null,
  basis,
  detail,
  targetLevel: null,
  uncertain: true,
});

function mid(a: number, b: number) {
  return Math.round((a + b) / 2);
}

/** Raid + gym ratings for a species at the IV/level states described by `knowledge`. */
export function computeMeleeRatings(inp: RoleInputs): { raid: RoleRating; gymAttack: RoleRating; gymDefense: RoleRating; raidDetail: RaidDetail } {
  const { ref, species, shadow, knowledge: k } = inp;
  const index = getRaidIndex(ref);
  const noData = 'Add CP, level or IVs to rate this Pokémon.';
  const emptyDetail: RaidDetail = {
    bestMoveset: null,
    bestNonElite: null,
    currentMoveset: null,
    movesAssumed: false,
    potentialNonElite: null,
    potentialWithElite: null,
    rawPotentialNonElite: null,
    typeRank: null,
  };
  if (k.candidates.length === 0) {
    return {
      raid: EMPTY_RATING('raid', noData),
      gymAttack: EMPTY_RATING('gymAttack', noData),
      gymDefense: EMPTY_RATING('gymDefense', noData),
      raidDetail: emptyDetail,
    };
  }
  const sampled = sampleCandidates(k.candidates);
  const rep = sampled[Math.floor(sampled.length / 2)];
  const ivSet = uniqueIvs(sampled);
  const targetLevel = Math.min(BENCHMARK_LEVEL, maxLevelForTrainer(inp.trainerLevel));
  const uncertain = !k.ivsKnown || k.status !== 'exact';
  const boss = genericBoss(ref);

  // --- raid ---
  const repTarget = combatant(species, rep.ivs, targetLevel, shadow);
  const bestAny = pickMoveset(ref, species, repTarget, 'score', true);
  const bestNonElite = pickMoveset(ref, species, repTarget, 'score', false);
  if (!bestAny) {
    const msg = 'No moveset data available for this species.';
    return {
      raid: EMPTY_RATING('raid', msg),
      gymAttack: EMPTY_RATING('gymAttack', msg),
      gymDefense: EMPTY_RATING('gymDefense', msg),
      raidDetail: emptyDetail,
    };
  }
  const evalSet = (pick: MovesetPick | null, states: { ivs: IVs; level: number }[], metric: 'score' | 'dps') => {
    if (!pick) return [] as number[];
    const f = ref.fastMove(pick.fast);
    const c = ref.chargedMove(pick.charged);
    if (!f || !c) return [] as number[];
    return states.map((s) => {
      const ev = evaluateRaidAttacker(ref, combatant(species, s.ivs, s.level, shadow), f, c, boss, NO_MODIFIERS);
      return metric === 'score' ? ev.score : ev.dps;
    });
  };
  const targetStates = ivSet.map((ivs) => ({ ivs, level: targetLevel }));
  const pot = (pick: MovesetPick | null) => {
    const raws = evalSet(pick, targetStates, 'score');
    const vals = raws.map((v) => index.percentile('score', v));
    return vals.length
      ? { low: Math.min(...vals), high: Math.max(...vals), raw: raws.reduce((a, b) => a + b, 0) / raws.length }
      : null;
  };
  const potAny = pot(bestAny);
  const potNonElite = pot(bestNonElite);

  // moves the Pokémon currently has (PvE uses fast + first charged move)
  let current: MovesetPick | null = null;
  let assumed = false;
  const pool = ref.movePool(species.speciesId, species.form);
  if (inp.moves.fast && inp.moves.charged && ref.fastMove(inp.moves.fast) && ref.chargedMove(inp.moves.charged)) {
    current = {
      fast: inp.moves.fast,
      charged: inp.moves.charged,
      elite: !!pool && (pool.eliteFast.includes(inp.moves.fast) || pool.eliteCharged.includes(inp.moves.charged)),
    };
  } else {
    assumed = true;
    current = bestNonElite ?? bestAny;
  }
  // when moves are known, the potential should use the Pokémon's own moves unless it can freely swap (non-elite)
  const potChosen = current && !assumed && current.elite ? pot(current) : potNonElite ?? potAny;

  const nowStates = sampled.map((c) => ({ ivs: c.ivs, level: c.level }));
  const nowRaws = evalSet(current, nowStates, 'score');
  const nowVals = nowRaws.map((v) => index.percentile('score', v));
  const nowRange = nowVals.length
    ? { low: Math.min(...nowVals), high: Math.max(...nowVals), raw: nowRaws.reduce((a, b) => a + b, 0) / nowRaws.length }
    : null;

  const typeRankOf = (pick: MovesetPick | null) => {
    if (!pick) return null;
    const t = ref.chargedMove(pick.charged)?.type;
    if (!t) return null;
    const list = index.topByType(t, 9999);
    const myScore = evalSet(pick, [{ ivs: rep.ivs, level: targetLevel }], 'score')[0] ?? 0;
    const rank = list.filter((e) => e.score > myScore).length + 1;
    return { rank, total: list.length, type: t };
  };
  const typeRank = typeRankOf(current && !assumed && current.elite ? current : (bestNonElite ?? bestAny));

  const raidPot = potChosen ?? potAny;
  const raid: RoleRating = {
    role: 'raid',
    now: nowRange ? mid(nowRange.low, nowRange.high) : null,
    potential: raidPot ? mid(raidPot.low, raidPot.high) : null,
    potentialRange: raidPot && raidPot.low !== raidPot.high ? { low: Math.round(raidPot.low), high: Math.round(raidPot.high) } : null,
    tier: raidPot ? tierOf(mid(raidPot.low, raidPot.high)) : null,
    basis: 'simulation',
    detail: typeRank
      ? `~#${typeRank.rank} of ${typeRank.total} ${typeRank.type}-move attackers (estimate, L${targetLevel})`
      : `Raid-model estimate at L${targetLevel}`,
    targetLevel,
    uncertain,
    rawNow: nowRange ? nowRange.raw : null,
    rawPotential: raidPot ? raidPot.raw : null,
  };

  // --- gym attack (DPS-based) ---
  const dpsPick = pickMoveset(ref, species, repTarget, 'dps', false) ?? pickMoveset(ref, species, repTarget, 'dps', true);
  const dpsPotVals = evalSet(dpsPick, targetStates, 'dps').map((v) => index.percentile('dps', v));
  const gymAttack: RoleRating = dpsPotVals.length
    ? {
        role: 'gymAttack',
        now: (() => {
          const vals = evalSet(dpsPick, nowStates, 'dps').map((v) => index.percentile('dps', v));
          return vals.length ? mid(Math.min(...vals), Math.max(...vals)) : null;
        })(),
        potential: mid(Math.min(...dpsPotVals), Math.max(...dpsPotVals)),
        potentialRange: null,
        tier: tierOf(mid(Math.min(...dpsPotVals), Math.max(...dpsPotVals))),
        basis: 'simulation',
        detail: `DPS-ranked among species (estimate, L${targetLevel})`,
        targetLevel,
        uncertain,
      }
    : EMPTY_RATING('gymAttack', 'No moveset data.');

  // --- gym defender (bulk × DPS heuristic) ---
  const defVals = (states: { ivs: IVs; level: number }[]) =>
    states.map((s) => {
      const st = calcBattleStats(species.stats, s.ivs, ref.cpm.get(s.level));
      const def = st.def * (shadow ? SHADOW_DEFENSE : 1);
      const dps = dpsPick
        ? evalSet(dpsPick, [s], 'dps')[0] ?? 0
        : 0;
      return index.percentile('gymDefense', gymDefenseScore(def * st.hp, dps));
    });
  const gdPot = defVals(targetStates);
  const gymDefense: RoleRating = gdPot.length
    ? {
        role: 'gymDefense',
        now: (() => {
          const v = defVals(nowStates);
          return v.length ? mid(Math.min(...v), Math.max(...v)) : null;
        })(),
        potential: mid(Math.min(...gdPot), Math.max(...gdPot)),
        potentialRange: null,
        tier: tierOf(mid(Math.min(...gdPot), Math.max(...gdPot))),
        basis: 'estimate',
        detail: 'Bulk × DPS heuristic (estimate)',
        targetLevel,
        uncertain,
      }
    : EMPTY_RATING('gymDefense', 'No moveset data.', 'estimate');

  return {
    raid,
    gymAttack,
    gymDefense,
    raidDetail: {
      bestMoveset: bestAny,
      bestNonElite,
      currentMoveset: current,
      movesAssumed: assumed,
      potentialNonElite: potNonElite ? mid(potNonElite.low, potNonElite.high) : null,
      rawPotentialNonElite: potNonElite ? potNonElite.raw : null,
      potentialWithElite: potAny ? mid(potAny.low, potAny.high) : null,
      typeRank,
    },
  };
}

export interface PvpRatings {
  great: RoleRating;
  ultra: RoleRating;
  master: RoleRating;
  assessments: Record<'great' | 'ultra' | 'master', LeagueAssessment>;
}

function leagueRating(role: RoleId, a: LeagueAssessment, k: Knowledge, ref: ReferenceData, species: GoSpecies): RoleRating {
  if (!a.eligible) return { ...EMPTY_RATING(role, a.eligibilityNote ?? 'Not eligible'), basis: 'provider', uncertain: false };
  if (!a.reachable) return { ...EMPTY_RATING(role, 'Cannot get under this CP cap.'), uncertain: false };
  if (a.suitability === null) {
    return {
      ...EMPTY_RATING(role, `Needs IVs to rank for ${role === 'master' ? 'Master' : 'this'} League.`, a.metaSource === 'pvpoke' ? 'provider' : 'estimate'),
    };
  }
  const targetLevel = a.entry?.level ?? a.best?.level ?? null;
  // "now": only meaningful when the level is known
  let now: number | null = null;
  if (k.level != null && a.entry && targetLevel != null && a.best) {
    if (k.level > targetLevel + 1e-9 && Number.isFinite(a.cap)) now = 0;
    else {
      const cur = calcBattleStats(species.stats, a.entry.ivs, ref.cpm.get(k.level));
      const tgt = calcBattleStats(species.stats, a.entry.ivs, ref.cpm.get(targetLevel));
      const ratio = (cur.atk * cur.def * cur.hp) / (tgt.atk * tgt.def * tgt.hp);
      now = Math.round(a.suitability * ratio);
    }
  }
  const rankTxt = a.entry
    ? `IV rank #${a.entry.rank} of 4096 · ${a.percentOfBestProduct?.toFixed(1)}% of best stat product · L${a.entry.level} CP ${a.entry.cp}`
    : a.rankRange
      ? `IV rank between #${a.rankRange.min} and #${a.rankRange.max} (IVs unknown)`
      : '';
  const metaTxt = a.meta
    ? `PvPoke meta score ${a.meta.score.toFixed(1)}`
    : `Estimated meta score ${a.metaScore} (not ranked by PvPoke)`;
  return {
    role,
    now,
    potential: a.suitability,
    potentialRange: null,
    tier: pvpTierOf(a.suitability),
    basis: a.metaSource === 'pvpoke' ? 'provider' : 'estimate',
    detail: `${rankTxt}${rankTxt ? ' · ' : ''}${metaTxt}`,
    targetLevel,
    uncertain: a.uncertain,
  };
}

export function computePvpRatings(inp: RoleInputs & { maxLevel?: number }): PvpRatings {
  const { ref, species, knowledge: k, shadow } = inp;
  const opts = { shadow, maxLevel: inp.maxLevel };
  const g = assessLeague(ref, species, k, 'great', opts);
  const u = assessLeague(ref, species, k, 'ultra', opts);
  const m = assessLeague(ref, species, k, 'master', opts);
  return {
    great: leagueRating('great', g, k, ref, species),
    ultra: leagueRating('ultra', u, k, ref, species),
    master: leagueRating('master', m, k, ref, species),
    assessments: { great: g, ultra: u, master: m },
  };
}

export function ratingsFor(ctx: AnalysisContext, species: GoSpecies, k: Knowledge, p: Pick<OwnedPokemon, 'shadow' | 'fastMove' | 'chargedMove1'>) {
  const inp: RoleInputs = {
    ref: ctx.ref,
    species,
    shadow: p.shadow,
    knowledge: k,
    moves: { fast: p.fastMove, charged: p.chargedMove1 },
    trainerLevel: ctx.trainerLevel,
  };
  const melee = computeMeleeRatings(inp);
  const pvp = computePvpRatings({ ...inp, maxLevel: ctx.maxPvpLevel });
  const ratings: Record<RoleId, RoleRating> = {
    raid: melee.raid,
    gymAttack: melee.gymAttack,
    gymDefense: melee.gymDefense,
    great: pvp.great,
    ultra: pvp.ultra,
    master: pvp.master,
  };
  return { ratings, raidDetail: melee.raidDetail, assessments: pvp.assessments };
}

/** Headline value of a ratings set: the best goal-weighted potential among the main roles. */
export function headlineValue(
  ratings: Record<RoleId, RoleRating>,
  weights: Record<RoleId, number>,
): { value: number | null; raw: number | null; role: RoleId | null } {
  const roles: RoleId[] = ['raid', 'great', 'ultra', 'master'];
  let bestW = -1;
  let bestRaw = -1;
  let role: RoleId | null = null;
  for (const r of roles) {
    const p = ratings[r].potential;
    if (p === null) continue;
    const w = p * weights[r];
    if (w > bestW) {
      bestW = w;
      role = r;
    }
    bestRaw = Math.max(bestRaw, p);
  }
  if (role === null) return { value: null, raw: null, role: null };
  return { value: Math.round(bestW), raw: bestRaw, role };
}

export function leagueOf(role: RoleId): 'great' | 'ultra' | 'master' | null {
  return role === 'great' ? 'great' : role === 'ultra' ? 'ultra' : role === 'master' ? 'master' : null;
}

