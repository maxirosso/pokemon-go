import type { BaseStats, IVs } from '../types';

/**
 * Pokémon GO combat-power maths.
 *
 *   CP = floor( max(10, (baseAtk+ivAtk) × sqrt(baseDef+ivDef) × sqrt(baseSta+ivSta) × CPM² / 10) )
 *   HP = floor( max(10, (baseSta+ivSta) × CPM) )
 *
 * CPM values come from the versioned `cp_multiplier` dataset (see CpmTable); nothing is guessed.
 */

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 51; // 50 + 1 for Best Buddy
export const MAX_POWER_UP_LEVEL = 50;

/** Maximum level a Pokémon can currently be powered up to. */
export function maxLevelForTrainer(trainerLevel: number, bestBuddy = false): number {
  const cap = Math.min(MAX_POWER_UP_LEVEL, trainerLevel + 2);
  return bestBuddy ? Math.min(MAX_LEVEL, cap + 1) : cap;
}

export class CpmTable {
  private readonly map = new Map<number, number>();
  readonly levels: number[];
  /** Highest level for which the provider supplied a value (levels above are extrapolated). */
  readonly providerMaxLevel: number;

  constructor(rows: readonly { level: number; multiplier: number }[]) {
    const sorted = [...rows].sort((a, b) => a.level - b.level);
    for (const r of sorted) this.map.set(r.level, r.multiplier);
    this.providerMaxLevel = sorted.length ? sorted[sorted.length - 1].level : 0;
    // Providers currently list CPM up to level 45. In-game CPM grows 0.0025 per half level beyond
    // that (level 50 = 0.8403). Extrapolate to level 51 so Best Buddy levels can be handled, and
    // keep `providerMaxLevel` so the UI can flag extrapolated values.
    const last = sorted[sorted.length - 1];
    if (last) {
      let level = last.level;
      let mult = last.multiplier;
      while (level < MAX_LEVEL) {
        level += 0.5;
        mult = Math.round((mult + 0.0025) * 1e8) / 1e8;
        if (!this.map.has(level)) this.map.set(level, mult);
      }
    }
    this.levels = [...this.map.keys()].sort((a, b) => a - b);
  }

  get(level: number): number {
    const v = this.map.get(level);
    if (v === undefined) throw new RangeError(`No CP multiplier for level ${level}`);
    return v;
  }

  has(level: number): boolean {
    return this.map.has(level);
  }

  isExtrapolated(level: number): boolean {
    return level > this.providerMaxLevel;
  }
}

export function calcCp(base: BaseStats, ivs: IVs, cpm: number): number {
  const atk = base.atk + ivs.atk;
  const def = base.def + ivs.def;
  const sta = base.sta + ivs.sta;
  return Math.max(10, Math.floor((atk * Math.sqrt(def) * Math.sqrt(sta) * cpm * cpm) / 10));
}

export function calcHp(baseSta: number, ivSta: number, cpm: number): number {
  return Math.max(10, Math.floor((baseSta + ivSta) * cpm));
}

export interface BattleStats {
  atk: number;
  def: number;
  hp: number;
}

/** Effective (non-floored) attack/defense and floored HP at a given level. */
export function calcBattleStats(base: BaseStats, ivs: IVs, cpm: number): BattleStats {
  return {
    atk: (base.atk + ivs.atk) * cpm,
    def: (base.def + ivs.def) * cpm,
    hp: Math.max(10, Math.floor((base.sta + ivs.sta) * cpm)),
  };
}

export function ivTotal(ivs: IVs): number {
  return ivs.atk + ivs.def + ivs.sta;
}

/** IV percentage = (atk + def + sta) / 45 × 100. NOT a measure of how useful a Pokémon is. */
export function ivPercent(ivs: IVs): number {
  return (ivTotal(ivs) / 45) * 100;
}

export function isValidIvs(ivs: IVs): boolean {
  return [ivs.atk, ivs.def, ivs.sta].every((v) => Number.isInteger(v) && v >= 0 && v <= 15);
}

/** In-game appraisal star rating (0–4). 4 = 100% (15/15/15). */
export function ivStars(ivs: IVs): 0 | 1 | 2 | 3 | 4 {
  const total = ivTotal(ivs);
  if (total === 45) return 4;
  if (total >= 37) return 3;
  if (total >= 30) return 2;
  if (total >= 23) return 1;
  return 0;
}

export type OverallAppraisal = 'exceptional' | 'impressive' | 'above-average' | 'weak';
export function overallAppraisal(ivs: IVs): OverallAppraisal {
  const total = ivTotal(ivs);
  if (total >= 37) return 'exceptional';
  if (total >= 30) return 'impressive';
  if (total >= 23) return 'above-average';
  return 'weak';
}

export function maxCpAtLevel(table: CpmTable, base: BaseStats, ivs: IVs, level: number): number {
  return calcCp(base, ivs, table.get(level));
}

/** All levels (half-level steps) at which these IVs produce exactly `cp` (and `hp` when given). */
export function findLevelsForCp(
  table: CpmTable,
  base: BaseStats,
  ivs: IVs,
  cp: number,
  hp?: number | null,
  maxLevel: number = MAX_LEVEL,
): number[] {
  const out: number[] = [];
  for (const level of table.levels) {
    if (level > maxLevel) break;
    const cpm = table.get(level);
    if (calcCp(base, ivs, cpm) !== cp) continue;
    if (hp != null && calcHp(base.sta, ivs.sta, cpm) !== hp) continue;
    out.push(level);
  }
  return out;
}

export interface IvCandidate {
  ivs: IVs;
  level: number;
}

/**
 * Every (IV, level) combination consistent with the observed CP/HP. With only CP+HP there are
 * usually several candidates — callers must present the range rather than inventing one answer.
 * `constraints` narrows the search (e.g. from appraisal info).
 */
export function solveIvCandidates(
  table: CpmTable,
  base: BaseStats,
  cp: number,
  hp: number | null,
  opts: {
    levels?: number[];
    minTotal?: number;
    maxTotal?: number;
    maxLevel?: number;
    fixed?: Partial<IVs>;
  } = {},
): IvCandidate[] {
  const levels = opts.levels ?? table.levels.filter((l) => l <= (opts.maxLevel ?? MAX_LEVEL));
  const out: IvCandidate[] = [];
  const range = (fixed: number | undefined) =>
    fixed === undefined ? Array.from({ length: 16 }, (_, i) => i) : [fixed];
  for (const level of levels) {
    const cpm = table.get(level);
    for (const sta of range(opts.fixed?.sta)) {
      if (hp != null && calcHp(base.sta, sta, cpm) !== hp) continue;
      for (const atk of range(opts.fixed?.atk)) {
        for (const def of range(opts.fixed?.def)) {
          const total = atk + def + sta;
          if (opts.minTotal !== undefined && total < opts.minTotal) continue;
          if (opts.maxTotal !== undefined && total > opts.maxTotal) continue;
          if (calcCp(base, { atk, def, sta }, cpm) === cp) out.push({ ivs: { atk, def, sta }, level });
        }
      }
    }
  }
  return out;
}

export interface IvEstimateSummary {
  count: number;
  minPercent: number;
  maxPercent: number;
  uniqueLevels: number[];
}

export function summarizeCandidates(cands: IvCandidate[]): IvEstimateSummary | null {
  if (cands.length === 0) return null;
  const pcts = cands.map((c) => ivPercent(c.ivs));
  return {
    count: cands.length,
    minPercent: Math.min(...pcts),
    maxPercent: Math.max(...pcts),
    uniqueLevels: [...new Set(cands.map((c) => c.level))].sort((a, b) => a - b),
  };
}

export type LevelEstimate =
  | { status: 'known'; level: number }
  | { status: 'unique'; level: number }
  | { status: 'ambiguous'; levels: number[] }
  | { status: 'impossible' }
  | { status: 'insufficient' };

/**
 * Level resolution that never invents precision:
 *  - known level supplied by the user → 'known'
 *  - CP + IVs (+HP) pin down a single level → 'unique'
 *  - several levels fit → 'ambiguous' (UI must ask for HP / appraisal)
 *  - nothing fits → 'impossible' (probably a typo)
 *  - not enough inputs → 'insufficient'
 */
export function estimateLevel(
  table: CpmTable,
  base: BaseStats,
  input: { level: number | null; cp: number | null; hp: number | null; ivs: IVs | null },
): LevelEstimate {
  if (input.level != null) return { status: 'known', level: input.level };
  if (input.cp == null || input.ivs == null) return { status: 'insufficient' };
  const levels = findLevelsForCp(table, base, input.ivs, input.cp, input.hp);
  if (levels.length === 0) return { status: 'impossible' };
  if (levels.length === 1) return { status: 'unique', level: levels[0] };
  return { status: 'ambiguous', levels };
}

/** Highest level (≤ maxLevel) whose CP does not exceed the cap. null if even level 1 exceeds it. */
export function bestLevelUnderCap(
  table: CpmTable,
  base: BaseStats,
  ivs: IVs,
  cpCap: number,
  maxLevel: number = MAX_POWER_UP_LEVEL,
): number | null {
  let best: number | null = null;
  for (const level of table.levels) {
    if (level > maxLevel) break;
    if (calcCp(base, ivs, table.get(level)) <= cpCap) best = level;
    else break;
  }
  return best;
}
