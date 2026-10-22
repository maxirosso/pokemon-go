import { calcBattleStats } from '../combat/cp';
import type { ReferenceData } from '../reference/referenceData';
import type { GoSpecies, PokemonType } from '../types';
import { evaluateRaidAttacker, genericBoss, NO_MODIFIERS, type Combatant } from './raidModel';

/**
 * Species-level raid benchmark: every released species evaluated at 15/15/15, level 40, with its best
 * available moveset against a neutral reference boss. Used to rank species and to tell the user how
 * developed a specific Pokémon is relative to its ceiling. Cached per ReferenceData instance.
 */

export const BENCHMARK_LEVEL = 40;
export const BENCHMARK_IVS = { atk: 15, def: 15, sta: 15 } as const;

export interface RaidSpeciesScore {
  key: string;
  speciesId: number;
  name: string;
  score: number;
  dps: number;
  tdo: number;
  fast: string;
  charged: string;
  attackType: PokemonType;
  elite: boolean;
  /** Highest DPS over all movesets (gym attacker metric). */
  bestDps: number;
  /** Gym-defender metric: bulk^0.6 × DPS^0.4. */
  gymDefense: number;
}

export interface RaidIndex {
  entries: RaidSpeciesScore[];
  byKey: Map<string, RaidSpeciesScore>;
  /** Ranks (1-based): overall and within attack type. */
  rankOf(key: string): { overall: number; overallTotal: number; type: number; typeTotal: number; attackType: PokemonType } | null;
  topByType(type: PokemonType, n: number): RaidSpeciesScore[];
  maxScore: number;
  /** Percentile (0–100) of a value among the benchmark species for each metric. */
  percentile(metric: "score" | "dps" | "gymDefense", value: number): number;
}

const cache = new WeakMap<ReferenceData, RaidIndex>();

/** Gym defender heuristic: bulk^0.6 × DPS^0.4 (analytical estimate, labelled as such in the UI). */
export function gymDefenseScore(bulk: number, dps: number): number {
  return Math.pow(bulk, 0.6) * Math.pow(Math.max(dps, 0.01), 0.4);
}

function pct(sortedAsc: number[], v: number): number {
  if (sortedAsc.length === 0) return 0;
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return (lo / sortedAsc.length) * 100;
}

export function getRaidIndex(ref: ReferenceData): RaidIndex {
  const hit = cache.get(ref);
  if (hit) return hit;
  const boss = genericBoss(ref);
  const entries: RaidSpeciesScore[] = [];
  for (const species of ref.listSpecies()) {
    const pool = ref.movePool(species.speciesId, species.form);
    if (!pool) continue;
    const me: Combatant = {
      speciesKey: species.key,
      stats: species.stats,
      types: species.types,
      ivs: { ...BENCHMARK_IVS },
      level: BENCHMARK_LEVEL,
      shadow: false,
    };
    let best: RaidSpeciesScore | null = null;
    let bestDps = 0;
    for (const fn of [...pool.fast, ...pool.eliteFast]) {
      const f = ref.fastMove(fn);
      if (!f) continue;
      for (const cn of [...pool.charged, ...pool.eliteCharged]) {
        const c = ref.chargedMove(cn);
        if (!c) continue;
        const ev = evaluateRaidAttacker(ref, me, f, c, boss, NO_MODIFIERS);
        bestDps = Math.max(bestDps, ev.dps);
        if (!best || ev.score > best.score) {
          best = {
            key: species.key,
            speciesId: species.speciesId,
            name: species.name,
            score: ev.score,
            dps: ev.dps,
            tdo: ev.tdo,
            fast: fn,
            charged: cn,
            attackType: c.type,
            elite: pool.eliteFast.includes(fn) || pool.eliteCharged.includes(cn),
            bestDps: 0,
            gymDefense: 0,
          };
        }
      }
    }
    if (best) {
      const st = calcBattleStats(species.stats, BENCHMARK_IVS, ref.cpm.get(BENCHMARK_LEVEL));
      best.bestDps = bestDps;
      best.gymDefense = gymDefenseScore(st.def * st.hp, bestDps);
      entries.push(best);
    }
  }
  entries.sort((a, b) => b.score - a.score);
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const typeLists = new Map<PokemonType, RaidSpeciesScore[]>();
  for (const e of entries) {
    const list = typeLists.get(e.attackType) ?? [];
    list.push(e);
    typeLists.set(e.attackType, list);
  }
  const sorted = {
    score: entries.map((e) => e.score).sort((a, b) => a - b),
    dps: entries.map((e) => e.bestDps).sort((a, b) => a - b),
    gymDefense: entries.map((e) => e.gymDefense).sort((a, b) => a - b),
  };
  const index: RaidIndex = {
    entries,
    byKey,
    maxScore: entries[0]?.score ?? 0,
    percentile(metric, value) {
      return pct(sorted[metric], value);
    },
    rankOf(key) {
      const e = byKey.get(key);
      if (!e) return null;
      const list = typeLists.get(e.attackType) ?? [];
      return {
        overall: entries.indexOf(e) + 1,
        overallTotal: entries.length,
        type: list.indexOf(e) + 1,
        typeTotal: list.length,
        attackType: e.attackType,
      };
    },
    topByType(type, n) {
      return (typeLists.get(type) ?? []).slice(0, n);
    },
  };
  cache.set(ref, index);
  return index;
}

/** Species with the best benchmark score inside an evolution line (used for "ceiling" analysis). */
export function bestOfLine(ref: ReferenceData, species: GoSpecies): RaidSpeciesScore | null {
  const index = getRaidIndex(ref);
  let best = index.byKey.get(species.key) ?? null;
  for (const d of ref.descendantsOf(species.key)) {
    const e = index.byKey.get(d.key);
    if (e && (!best || e.score > best.score)) best = e;
  }
  return best;
}
