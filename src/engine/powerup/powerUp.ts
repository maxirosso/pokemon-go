import { calcBattleStats, calcCp, MAX_POWER_UP_LEVEL, type CpmTable } from '../combat/cp';
import type { ReferenceData } from '../reference/referenceData';
import type { BaseStats, IVs } from '../types';

export interface CostModifiers {
  shadow?: boolean;
  purified?: boolean;
  lucky?: boolean;
}

export interface PowerUpCost {
  fromLevel: number;
  toLevel: number;
  steps: number;
  stardust: number;
  candy: number;
  xlCandy: number;
  /** True when a level in the range has no cost entry in the dataset (cost is then incomplete). */
  incomplete: boolean;
}

/**
 * Stardust/Candy multipliers.
 *  - Shadow: +20 % Stardust and Candy
 *  - Purified: −10 % Stardust and Candy
 *  - Lucky: −50 % Stardust (Candy unchanged)
 * Applied per step (then rounded) because that is how the game charges each power-up.
 */
export function stepModifiers(mods: CostModifiers): { dust: number; candy: number } {
  let dust = 1;
  let candy = 1;
  if (mods.shadow) {
    dust *= 1.2;
    candy *= 1.2;
  }
  if (mods.purified) {
    dust *= 0.9;
    candy *= 0.9;
  }
  if (mods.lucky) dust *= 0.5;
  return { dust, candy };
}

export function powerUpCost(ref: ReferenceData, fromLevel: number, toLevel: number, mods: CostModifiers = {}): PowerUpCost {
  const m = stepModifiers(mods);
  let stardust = 0;
  let candy = 0;
  let xlCandy = 0;
  let steps = 0;
  let incomplete = false;
  for (let level = fromLevel; level < toLevel - 1e-9; level += 0.5) {
    const step = ref.powerUpStep(level);
    if (!step) {
      incomplete = true;
      continue;
    }
    stardust += Math.round(step.stardust * m.dust);
    candy += Math.round(step.candy * m.candy);
    xlCandy += Math.round(step.xlCandy * m.candy);
    steps += 1;
  }
  return { fromLevel, toLevel, steps, stardust, candy, xlCandy, incomplete };
}

export interface PowerUpOutcome {
  cost: PowerUpCost;
  cpBefore: number;
  cpAfter: number;
  hpBefore: number;
  hpAfter: number;
  atkBefore: number;
  atkAfter: number;
  defBefore: number;
  defAfter: number;
  cpGained: number;
  /** CP gained per 10,000 Stardust (null when the upgrade costs no Stardust). */
  cpPer10kStardust: number | null;
}

export function powerUpOutcome(
  ref: ReferenceData,
  base: BaseStats,
  ivs: IVs,
  fromLevel: number,
  toLevel: number,
  mods: CostModifiers = {},
): PowerUpOutcome {
  const cost = powerUpCost(ref, fromLevel, toLevel, mods);
  const a = calcBattleStats(base, ivs, ref.cpm.get(fromLevel));
  const b = calcBattleStats(base, ivs, ref.cpm.get(toLevel));
  const cpBefore = calcCp(base, ivs, ref.cpm.get(fromLevel));
  const cpAfter = calcCp(base, ivs, ref.cpm.get(toLevel));
  return {
    cost,
    cpBefore,
    cpAfter,
    hpBefore: a.hp,
    hpAfter: b.hp,
    atkBefore: a.atk,
    atkAfter: b.atk,
    defBefore: a.def,
    defAfter: b.def,
    cpGained: cpAfter - cpBefore,
    cpPer10kStardust: cost.stardust > 0 ? ((cpAfter - cpBefore) / cost.stardust) * 10000 : null,
  };
}

export interface Budget {
  stardust: number;
  candy: number;
  xlCandy: number;
}

/** Highest level reachable from `fromLevel` within the budget (and level cap). */
export function maxAffordableLevel(
  ref: ReferenceData,
  fromLevel: number,
  budget: Budget,
  maxLevel: number,
  mods: CostModifiers = {},
): number {
  const m = stepModifiers(mods);
  let dust = budget.stardust;
  let candy = budget.candy;
  let xl = budget.xlCandy;
  let level = fromLevel;
  while (level < maxLevel - 1e-9) {
    const step = ref.powerUpStep(level);
    if (!step) break;
    const d = Math.round(step.stardust * m.dust);
    const c = Math.round(step.candy * m.candy);
    const x = Math.round(step.xlCandy * m.candy);
    if (d > dust || c > candy || x > xl) break;
    dust -= d;
    candy -= c;
    xl -= x;
    level = step.nextLevel;
  }
  return level;
}

/** Highest level whose CP does not exceed `targetCp`, capped at maxLevel (default 50). */
export function levelForTargetCp(
  table: CpmTable,
  base: BaseStats,
  ivs: IVs,
  targetCp: number,
  maxLevel: number = MAX_POWER_UP_LEVEL,
): number | null {
  let best: number | null = null;
  for (const level of table.levels) {
    if (level > maxLevel) break;
    if (calcCp(base, ivs, table.get(level)) <= targetCp) best = level;
    else break;
  }
  return best;
}

export type PowerUpTarget =
  | { kind: 'level'; level: number }
  | { kind: 'cp'; cp: number }
  | { kind: 'league'; cpCap: number }
  | { kind: 'max' }
  | { kind: 'budget'; budget: Budget };

/** Resolve a UI-level target into a concrete level (null if unreachable / already beyond). */
export function resolveTargetLevel(
  ref: ReferenceData,
  base: BaseStats,
  ivs: IVs,
  fromLevel: number,
  target: PowerUpTarget,
  maxLevel: number,
  mods: CostModifiers = {},
): number | null {
  switch (target.kind) {
    case 'level':
      return Math.min(target.level, maxLevel);
    case 'cp':
      return levelForTargetCp(ref.cpm, base, ivs, target.cp, maxLevel);
    case 'league':
      return levelForTargetCp(ref.cpm, base, ivs, target.cpCap, maxLevel);
    case 'max':
      return maxLevel;
    case 'budget':
      return maxAffordableLevel(ref, fromLevel, target.budget, maxLevel, mods);
  }
}
