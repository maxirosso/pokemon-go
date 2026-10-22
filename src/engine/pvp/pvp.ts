import { calcBattleStats, calcCp, MAX_POWER_UP_LEVEL, type CpmTable } from '../combat/cp';
import type { Knowledge } from '../combat/knowledge';
import type { PvpMetaEntry, ReferenceData } from '../reference/referenceData';
import { LEAGUES, type BaseStats, type GoSpecies, type IVs, type LeagueId } from '../types';

/**
 * PvP (Go Battle League) maths: league CP caps, stat-product IV ranking and a transparent
 * suitability score.
 *
 *   stat product = Atk × Def × floor(HP)   at the highest level whose CP ≤ cap
 *
 * Ranking all 4,096 IV combinations by stat product is the standard way to find the best IVs
 * for a CP-capped league. It does not account for the move-set, so it is combined with
 * provider meta rankings (PvPoke) when available.
 */

export interface IvRankEntry {
  ivs: IVs;
  level: number;
  cp: number;
  atk: number;
  def: number;
  hp: number;
  product: number;
  /** 1-based, ties share a rank. */
  rank: number;
}

export interface IvRanking {
  cap: number;
  maxLevel: number;
  /** Number of IV combinations that can legally play this league. 0 → species cannot get under the cap. */
  count: number;
  best: IvRankEntry | null;
  lookup(ivs: IVs): IvRankEntry | null;
  /** All entries sorted by stat product (built lazily — only the IV-table UI needs it). */
  readonly entries: IvRankEntry[];
}

const ivIndex = (i: IVs) => i.atk * 256 + i.def * 16 + i.sta;
const cache = new WeakMap<ReferenceData, Map<string, IvRanking>>();

export function rankIvs(ref: ReferenceData, species: GoSpecies, cap: number, maxLevel: number = MAX_POWER_UP_LEVEL): IvRanking {
  let perRef = cache.get(ref);
  if (!perRef) {
    perRef = new Map();
    cache.set(ref, perRef);
  }
  const ck = `${species.key}|${cap}|${maxLevel}`;
  const hit = perRef.get(ck);
  if (hit) return hit;
  const ranking = computeIvRanking(ref.cpm, species.stats, cap, maxLevel);
  if (perRef.size > 600) perRef.clear();
  perRef.set(ck, ranking);
  return ranking;
}

/** Index into `cpms` of the highest level whose CP ≤ cap, or -1. Closed-form guess + exact verification. */
function levelIndexUnderCap(base: BaseStats, ivs: IVs, cap: number, cpms: number[]): number {
  const x = (base.atk + ivs.atk) * Math.sqrt(base.def + ivs.def) * Math.sqrt(base.sta + ivs.sta);
  const t = Math.sqrt((10 * (cap + 1)) / x);
  let lo = 0;
  let hi = cpms.length - 1;
  let li = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cpms[mid] < t) {
      li = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  while (li + 1 < cpms.length && calcCp(base, ivs, cpms[li + 1]) <= cap) li += 1;
  while (li >= 0 && calcCp(base, ivs, cpms[li]) > cap) li -= 1;
  return li;
}

/** Fast approximation of the best stat product (def/sta 12–15, any atk) — used only for the heuristic distribution. */
function approxBestProduct(table: CpmTable, base: BaseStats, cap: number, maxLevel: number): number {
  const levels = table.levels.filter((l) => l <= maxLevel);
  const cpms = levels.map((l) => table.get(l));
  let best = 0;
  for (let atk = 0; atk <= 15; atk += 1)
    for (let def = 12; def <= 15; def += 1)
      for (let sta = 12; sta <= 15; sta += 1) {
        const ivs = { atk, def, sta };
        const li = Number.isFinite(cap) ? levelIndexUnderCap(base, ivs, cap, cpms) : cpms.length - 1;
        if (li < 0) continue;
        const s = calcBattleStats(base, ivs, cpms[li]);
        best = Math.max(best, s.atk * s.def * s.hp);
      }
  return best;
}

/**
 * Stat-product ranking of all 4,096 IV combinations under a CP cap.
 * Level search uses the closed form  CP < cap+1  ⇔  CPM < sqrt(10·(cap+1)/X)  (X = atk·√def·√sta)
 * followed by an exact verification with calcCp, so floor/rounding edge cases stay correct.
 */
export function computeIvRanking(table: CpmTable, base: BaseStats, cap: number, maxLevel: number): IvRanking {
  const levels = table.levels.filter((l) => l <= maxLevel);
  const cpms = levels.map((l) => table.get(l));
  const cpm2 = cpms.map((m) => m * m);
  const n = 4096;
  const levelAt = new Float32Array(n);
  const productAt = new Float64Array(n);
  const finite = Number.isFinite(cap);
  const limit = cap + 1;
  // Tight numeric loop (no allocations): CP ≤ cap  ⇔  atk·√def·√sta·cpm²/10 < cap + 1  (same expression as calcCp).
  const sqrtDef = new Float64Array(16);
  const sqrtSta = new Float64Array(16);
  for (let i = 0; i < 16; i += 1) {
    sqrtDef[i] = Math.sqrt(base.def + i);
    sqrtSta[i] = Math.sqrt(base.sta + i);
  }
  const top = levels.length - 1;
  let count = 0;
  let bestIdx = -1;
  let bestProduct = -1;
  for (let atk = 0; atk <= 15; atk += 1) {
    const a = base.atk + atk;
    for (let def = 0; def <= 15; def += 1) {
      const d = base.def + def;
      // As Stamina IV rises CP rises, so the allowed level index can only fall: walk it down instead of re-searching.
      let li = top;
      for (let sta = 0; sta <= 15; sta += 1) {
        const x = (a * sqrtDef[def] * sqrtSta[sta]) / 10;
        if (finite) {
          if (sta === 0) {
            let lo = 0;
            let hi = top;
            li = -1;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              if (x * cpm2[mid] < limit) {
                li = mid;
                lo = mid + 1;
              } else hi = mid - 1;
            }
          } else {
            while (li >= 0 && x * cpm2[li] >= limit) li -= 1;
          }
          if (li < 0) continue;
        }
        const idx = atk * 256 + def * 16 + sta;
        const cpm = cpms[li];
        const hp = Math.max(10, Math.floor((base.sta + sta) * cpm));
        const product = a * cpm * d * cpm * hp;
        levelAt[idx] = levels[li];
        productAt[idx] = product;
        count += 1;
        if (product > bestProduct) {
          bestProduct = product;
          bestIdx = idx;
        }
      }
    }
  }

  const build = (idx: number, rank: number): IvRankEntry => {
    const ivs = { atk: idx >> 8, def: (idx >> 4) & 15, sta: idx & 15 };
    const level = levelAt[idx];
    const cpm = table.get(level);
    const s = calcBattleStats(base, ivs, cpm);
    return { ivs, level, cp: calcCp(base, ivs, cpm), atk: s.atk, def: s.def, hp: s.hp, product: productAt[idx], rank };
  };
  const rankOfIdx = (idx: number) => {
    const p = productAt[idx];
    let greater = 0;
    for (let j = 0; j < n; j += 1) if (levelAt[j] > 0 && productAt[j] > p + 1e-6) greater += 1;
    return greater + 1;
  };
  let sortedCache: IvRankEntry[] | null = null;
  return {
    cap,
    maxLevel,
    count,
    best: bestIdx >= 0 ? build(bestIdx, 1) : null,
    lookup(ivs) {
      const idx = ivIndex(ivs);
      return levelAt[idx] > 0 ? build(idx, rankOfIdx(idx)) : null;
    },
    get entries() {
      if (!sortedCache) {
        const idxs: number[] = [];
        for (let j = 0; j < n; j += 1) if (levelAt[j] > 0) idxs.push(j);
        idxs.sort((a, b) => productAt[b] - productAt[a]);
        let lastP = -1;
        let lastRank = 0;
        sortedCache = idxs.map((j, i) => {
          if (Math.abs(productAt[j] - lastP) < 1e-6) return build(j, lastRank);
          lastRank = i + 1;
          lastP = productAt[j];
          return build(j, lastRank);
        });
      }
      return sortedCache;
    },
  };
}

export function leagueEligibility(species: GoSpecies, league: LeagueId): { eligible: boolean; reason: string | null } {
  if (league === 'little') {
    if (species.isFinalStage) return { eligible: false, reason: 'Little Cup only allows Pokémon that can still evolve.' };
    if (species.stage > 0 && !species.isBaby) return { eligible: false, reason: 'Little Cup only allows first-stage Pokémon.' };
  }
  return { eligible: true, reason: null };
}

export interface LeagueAssessment {
  league: LeagueId;
  cap: number;
  eligible: boolean;
  eligibilityNote: string | null;
  /** False when the species cannot get under the cap even at level 1 (so cannot play the league). */
  reachable: boolean;
  /** True when even at max level the Pokémon is below the cap (cannot use the whole CP budget). */
  underCap: boolean;
  entry: IvRankEntry | null;
  best: IvRankEntry | null;
  percentOfBestProduct: number | null;
  /** Rank band when IVs are only partially known. */
  rankRange: { min: number; max: number } | null;
  meta: PvpMetaEntry | null;
  /** 0–100 provider meta score, or a clearly-labelled heuristic when unranked. */
  metaScore: number;
  metaSource: 'pvpoke' | 'estimate';
  /** 0–100 composite usefulness for this league (see formula in docs). null when IVs unknown & no range. */
  suitability: number | null;
  /** True when IVs/level are unknown so `suitability` is a range midpoint or missing. */
  uncertain: boolean;
}

export interface AssessOptions {
  /** Highest level the user can reach (50 default; 40 when they have no Candy XL). */
  maxLevel?: number;
  shadow?: boolean;
}

/** Heuristic used only when the provider does not rank the species. Capped at 65 so it never looks elite. */
export function estimateMetaScore(ref: ReferenceData, species: GoSpecies, cap: number, maxLevel: number): number {
  const rank = rankIvs(ref, species, cap, maxLevel);
  if (!rank.best) return 0;
  const dist = productDistribution(ref, cap, maxLevel);
  const pct = dist.percentile(rank.best.product);
  return Math.round(Math.min(65, pct * 65));
}

interface ProductDistribution {
  percentile(product: number): number;
}
const distCache = new WeakMap<ReferenceData, Map<string, ProductDistribution>>();

function productDistribution(ref: ReferenceData, cap: number, maxLevel: number): ProductDistribution {
  let m = distCache.get(ref);
  if (!m) {
    m = new Map();
    distCache.set(ref, m);
  }
  const k = `${cap}|${maxLevel}`;
  const hit = m.get(k);
  if (hit) return hit;
  // Use the 15/15/15-neutral best-product over species in a coarse way: sample the rank-1 product of every
  // released fully-evolved species that can reach at least 85 % of the cap (so we compare real contenders).
  const products: number[] = [];
  const floor = Number.isFinite(cap) ? cap * 0.85 : 0;
  for (const s of ref.listSpecies()) {
    if (!s.isFinalStage && Number.isFinite(cap)) continue;
    const base = s.stats;
    const top = calcCp(base, { atk: 15, def: 15, sta: 15 }, ref.cpm.get(Math.min(maxLevel, 50)));
    if (top < floor) continue;
    const p = approxBestProduct(ref.cpm, s.stats, cap, maxLevel);
    if (p > 0) products.push(p);
  }
  products.sort((a, b) => a - b);
  const dist: ProductDistribution = {
    percentile(p) {
      if (products.length === 0) return 0;
      let lo = 0;
      while (lo < products.length && products[lo] < p) lo += 1;
      return lo / products.length;
    },
  };
  m.set(k, dist);
  return dist;
}

/** suitability = metaScore × (1 − 1.5 × (1 − productRatio)) → 10 % worse stat product costs ~15 % suitability. */
export function suitabilityFormula(metaScore: number, productRatio: number): number {
  return Math.max(0, Math.round(metaScore * (1 - 1.5 * (1 - productRatio))));
}

export function assessLeague(
  ref: ReferenceData,
  species: GoSpecies,
  knowledge: Knowledge,
  league: LeagueId,
  opts: AssessOptions = {},
): LeagueAssessment {
  const cap = LEAGUES[league].cpCap;
  const maxLevel = opts.maxLevel ?? MAX_POWER_UP_LEVEL;
  const elig = leagueEligibility(species, league);
  const meta = ref.getPvpMeta(league, species.speciesId, species.form, !!opts.shadow);

  // Cheap exit for species that can never use more than half of the CP budget and that the provider does not
  // rank (e.g. Caterpie in Master League): their suitability is 0 without enumerating 4,096 IV spreads.
  if (elig.eligible && Number.isFinite(cap) && !meta) {
    const ceiling = calcCp(species.stats, { atk: 15, def: 15, sta: 15 }, ref.cpm.get(Math.min(maxLevel, 50)));
    if (ceiling < cap * 0.5) {
      return {
        league,
        cap,
        eligible: true,
        eligibilityNote: null,
        reachable: true,
        underCap: true,
        entry: null,
        best: null,
        percentOfBestProduct: null,
        rankRange: null,
        meta: null,
        metaScore: 0,
        metaSource: 'estimate',
        suitability: knowledge.candidates.length > 0 ? 0 : null,
        uncertain: knowledge.candidates.length > 1,
      };
    }
  }
  const ranking = rankIvs(ref, species, cap, maxLevel);
  const reachable = ranking.count > 0;
  const metaScore = meta ? meta.score : estimateMetaScore(ref, species, cap, maxLevel);
  const base: LeagueAssessment = {
    league,
    cap,
    eligible: elig.eligible,
    eligibilityNote: elig.reason,
    reachable,
    underCap: !!ranking.best && Number.isFinite(cap) && ranking.best.cp < cap * 0.97 && ranking.best.level >= maxLevel,
    entry: null,
    best: ranking.best,
    percentOfBestProduct: null,
    rankRange: null,
    meta,
    metaScore,
    metaSource: meta ? 'pvpoke' : 'estimate',
    suitability: null,
    uncertain: false,
  };
  if (!reachable || !elig.eligible) return base;

  if (knowledge.ivs) {
    const entry = ranking.lookup(knowledge.ivs);
    if (entry && ranking.best) {
      const ratio = entry.product / ranking.best.product;
      base.entry = entry;
      base.percentOfBestProduct = ratio * 100;
      base.suitability = suitabilityFormula(metaScore, ratio);
    }
    return base;
  }
  if (knowledge.candidates.length > 0) {
    const sample = knowledge.candidates.length > 200 ? knowledge.candidates.filter((_, i) => i % Math.ceil(knowledge.candidates.length / 200) === 0) : knowledge.candidates;
    const entries = sample.map((c) => ranking.lookup(c.ivs)).filter((e): e is IvRankEntry => !!e);
    if (entries.length > 0 && ranking.best) {
      const ranks = entries.map((e) => e.rank);
      const ratios = entries.map((e) => e.product / (ranking.best as IvRankEntry).product);
      base.rankRange = { min: Math.min(...ranks), max: Math.max(...ranks) };
      const mid = (Math.min(...ratios) + Math.max(...ratios)) / 2;
      base.percentOfBestProduct = mid * 100;
      base.suitability = suitabilityFormula(metaScore, mid);
      base.uncertain = true;
    }
  }
  return base;
}
