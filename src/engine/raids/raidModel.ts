import { calcBattleStats } from '../combat/cp';
import { typeMultiplier } from '../combat/typeChart';
import type { ReferenceData } from '../reference/referenceData';
import type { BaseStats, ChargedMove, FastMove, GoSpecies, IVs, PokemonType } from '../types';

/**
 * Quick PvE (raid / gym) damage model.
 *
 *   damage = floor(0.5 × power × (Atk / Def) × STAB × effectiveness × weather × friendship × mega) + 1
 *
 * The raid *score* is an analytical estimate (no dodging, no lobby effects, no random boss move order);
 * it ranks counters relative to each other. It is NOT a full battle simulation and the UI labels it as such.
 */

export const STAB_MULTIPLIER = 1.2;
export const WEATHER_MULTIPLIER = 1.2;
export const SHADOW_ATTACK = 1.2;
export const SHADOW_DEFENSE = 5 / 6;
/** Delay (ms) between a raid boss's consecutive moves — model constant, see GAME_MECHANICS.md. */
export const BOSS_MOVE_DELAY_MS = 2000;

export interface BossTierConfig {
  tier: string;
  hp: number;
  level: number;
  /** Seconds players have to defeat the boss. */
  timeLimitSec: number;
}

/** Model constants — raid boss HP/level per tier. These are NOT provider data; see GAME_MECHANICS.md. */
export const BOSS_TIERS: Record<string, BossTierConfig> = {
  '1': { tier: '1', hp: 600, level: 20, timeLimitSec: 180 },
  '2': { tier: '2', hp: 1800, level: 25, timeLimitSec: 180 },
  '3': { tier: '3', hp: 3600, level: 30, timeLimitSec: 180 },
  '4': { tier: '4', hp: 9000, level: 40, timeLimitSec: 180 },
  '5': { tier: '5', hp: 15000, level: 40, timeLimitSec: 300 },
  '6': { tier: '6', hp: 15000, level: 40, timeLimitSec: 300 },
  mega: { tier: 'mega', hp: 9000, level: 40, timeLimitSec: 300 },
  mega_legendary: { tier: 'mega_legendary', hp: 22500, level: 40, timeLimitSec: 300 },
  ex: { tier: 'ex', hp: 15000, level: 40, timeLimitSec: 300 },
};

export const TIER_LABELS: Record<string, string> = {
  '1': 'Tier 1',
  '2': 'Tier 2',
  '3': 'Tier 3',
  '4': 'Tier 4',
  '5': 'Tier 5',
  '6': 'Tier 6',
  mega: 'Mega',
  mega_legendary: 'Mega Legendary',
  ex: 'EX',
};

export function bossTierConfig(tier: string): BossTierConfig {
  return BOSS_TIERS[tier] ?? BOSS_TIERS['5'];
}

export type MegaBoost = 'none' | 'general' | 'type';

export interface RaidModifiers {
  /** Weather name (e.g. "Rainy") or null for no boost. */
  weather: string | null;
  /** Friendship attack bonus label, e.g. "Best Friend". */
  friendship: string | null;
  /** Mega boost applying to the attacker (+10 % general, +30 % when the types match). */
  mega: MegaBoost;
}

export const NO_MODIFIERS: RaidModifiers = { weather: null, friendship: null, mega: 'none' };

export interface Combatant {
  speciesKey: string;
  stats: BaseStats;
  types: PokemonType[];
  ivs: IVs;
  level: number;
  shadow: boolean;
}

export interface BossProfile {
  name: string;
  stats: BaseStats;
  types: PokemonType[];
  tier: BossTierConfig;
  /** Boss attack moves used for the DPS-against-attacker estimate. */
  fastMoves: FastMove[];
  chargedMoves: ChargedMove[];
}

export function pveDamage(power: number, atk: number, def: number, multiplier: number): number {
  return Math.floor(0.5 * power * (atk / def) * multiplier) + 1;
}

function attackerAtk(ref: ReferenceData, a: Combatant) {
  const s = calcBattleStats(a.stats, a.ivs, ref.cpm.get(a.level));
  return { atk: s.atk * (a.shadow ? SHADOW_ATTACK : 1), def: s.def * (a.shadow ? SHADOW_DEFENSE : 1), hp: s.hp };
}

function bossStats(ref: ReferenceData, boss: BossProfile) {
  const cpm = ref.cpm.get(boss.tier.level);
  return { atk: (boss.stats.atk + 15) * cpm, def: (boss.stats.def + 15) * cpm };
}

function moveMultiplier(
  ref: ReferenceData,
  moveType: PokemonType,
  attackerTypes: readonly PokemonType[],
  defenderTypes: readonly PokemonType[],
  mods: RaidModifiers,
  isAttackerPlayer: boolean,
): number {
  let m = typeMultiplier(ref.typeChart, moveType, defenderTypes);
  if (attackerTypes.includes(moveType)) m *= STAB_MULTIPLIER;
  if (isAttackerPlayer) {
    if (mods.weather && (ref.weatherBoosts[mods.weather] ?? []).includes(moveType)) m *= WEATHER_MULTIPLIER;
    if (mods.friendship) m *= ref.friendshipAttackBonus[mods.friendship] ?? 1;
    if (mods.mega === 'general') m *= 1.1;
    if (mods.mega === 'type') m *= 1.3;
  }
  return m;
}

export interface RaidEvaluation {
  fast: string;
  charged: string;
  dps: number;
  /** Total damage output over the Pokémon's estimated lifetime. */
  tdo: number;
  /** Seconds the Pokémon is estimated to survive. */
  survivalSec: number;
  hp: number;
  bossDpsAgainst: number;
  /** (DPS³ × TDO)^¼ — analytical ranking score. */
  score: number;
}

/**
 * Fractional-cycle DPS: a charged move is thrown whenever enough energy has accumulated
 * (cycle = costEnergy/fastEnergy fast moves + one charged move). Energy gained from taking damage and
 * dodging are ignored.
 */
export function cycleDps(
  fastDamage: number,
  fastEnergy: number,
  fastMs: number,
  chargedDamage: number,
  chargedCost: number,
  chargedMs: number,
): number {
  if (fastEnergy <= 0) return fastDamage / (fastMs / 1000);
  const fastsPerCharged = chargedCost / fastEnergy;
  const time = fastsPerCharged * (fastMs / 1000) + chargedMs / 1000;
  const damage = fastsPerCharged * fastDamage + chargedDamage;
  return damage / time;
}

/** Average damage/second the boss deals to this attacker over its (equally likely) move pairs. */
export function bossDpsAgainst(ref: ReferenceData, boss: BossProfile, defender: Combatant): number {
  const def = attackerAtk(ref, defender).def;
  const b = bossStats(ref, boss);
  const fasts = boss.fastMoves.length ? boss.fastMoves : [];
  const chargeds = boss.chargedMoves.length ? boss.chargedMoves : [];
  if (fasts.length === 0) return 0;
  let total = 0;
  let n = 0;
  const pairs = chargeds.length ? chargeds : [null];
  for (const f of fasts) {
    for (const c of pairs) {
      const fm = moveMultiplier(ref, f.type, boss.types, defender.types, NO_MODIFIERS, false);
      const fd = pveDamage(f.power, b.atk, def, fm);
      const fMs = f.durationMs + BOSS_MOVE_DELAY_MS;
      if (!c) {
        total += fd / (fMs / 1000);
      } else {
        const cm = moveMultiplier(ref, c.type, boss.types, defender.types, NO_MODIFIERS, false);
        const cd = pveDamage(c.power, b.atk, def, cm);
        total += cycleDps(fd, f.energy, fMs, cd, c.energy, c.durationMs + BOSS_MOVE_DELAY_MS);
      }
      n += 1;
    }
  }
  return total / n;
}

export function evaluateRaidAttacker(
  ref: ReferenceData,
  attacker: Combatant,
  fast: FastMove,
  charged: ChargedMove,
  boss: BossProfile,
  mods: RaidModifiers = NO_MODIFIERS,
): RaidEvaluation {
  const me = attackerAtk(ref, attacker);
  const b = bossStats(ref, boss);
  const fastMult = moveMultiplier(ref, fast.type, attacker.types, boss.types, mods, true);
  const chargedMult = moveMultiplier(ref, charged.type, attacker.types, boss.types, mods, true);
  const fd = pveDamage(fast.power, me.atk, b.def, fastMult);
  const cd = pveDamage(charged.power, me.atk, b.def, chargedMult);
  const dps = cycleDps(fd, fast.energy, fast.durationMs, cd, charged.energy, charged.durationMs);
  const bossDps = bossDpsAgainst(ref, boss, attacker);
  const survivalSec = bossDps > 0 ? me.hp / bossDps : 999;
  const tdo = dps * survivalSec;
  return {
    fast: fast.name,
    charged: charged.name,
    dps,
    tdo,
    survivalSec,
    hp: me.hp,
    bossDpsAgainst: bossDps,
    score: Math.pow(Math.pow(dps, 3) * tdo, 0.25),
  };
}

export interface MovesetOption extends RaidEvaluation {
  elite: boolean;
}

/** Every available (fast, charged) pair for a species, scored against a boss. Elite moves are flagged. */
export function rankMovesets(
  ref: ReferenceData,
  attacker: Combatant,
  species: GoSpecies,
  boss: BossProfile,
  mods: RaidModifiers = NO_MODIFIERS,
  opts: { includeElite?: boolean } = {},
): MovesetOption[] {
  const pool = ref.movePool(species.speciesId, species.form);
  if (!pool) return [];
  const includeElite = opts.includeElite ?? true;
  const fasts = [...pool.fast, ...(includeElite ? pool.eliteFast : [])];
  const chargeds = [...pool.charged, ...(includeElite ? pool.eliteCharged : [])];
  const out: MovesetOption[] = [];
  for (const fn of fasts) {
    const f = ref.fastMove(fn);
    if (!f) continue;
    for (const cn of chargeds) {
      const c = ref.chargedMove(cn);
      if (!c) continue;
      const ev = evaluateRaidAttacker(ref, attacker, f, c, boss, mods);
      out.push({ ...ev, elite: pool.eliteFast.includes(fn) || pool.eliteCharged.includes(cn) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Build the boss profile (stats, types, expected move pool) for a raid boss species. */
export function buildBossProfile(ref: ReferenceData, species: GoSpecies, tier: string): BossProfile {
  const pool = ref.movePool(species.speciesId, species.form);
  const fastMoves = (pool?.fast ?? []).flatMap((n) => {
    const m = ref.fastMove(n);
    return m ? [m] : [];
  });
  const chargedMoves = (pool?.charged ?? []).flatMap((n) => {
    const m = ref.chargedMove(n);
    return m ? [m] : [];
  });
  return {
    name: species.name,
    stats: species.stats,
    types: species.types,
    tier: bossTierConfig(tier),
    fastMoves,
    chargedMoves,
  };
}

/** Neutral reference boss used to compare species independent of any specific raid. */
export function genericBoss(ref: ReferenceData): BossProfile {
  const fast = ref.allFastMoves().find((m) => m.name === 'Counter');
  const charged = ref.allChargedMoves().find((m) => m.name === 'Body Slam') ?? ref.allChargedMoves()[0];
  return {
    name: 'Generic Tier 5 boss (neutral typing)',
    stats: { atk: 230, def: 200, sta: 225 },
    // 'Normal' defends neutrally against every type except Fighting; use an empty list for strictly neutral.
    types: [],
    tier: BOSS_TIERS['5'],
    fastMoves: fast ? [{ ...fast, type: 'Normal' as PokemonType, power: 12, energy: 9, durationMs: 1500 }] : [],
    chargedMoves: charged ? [{ ...charged, type: 'Normal' as PokemonType, power: 90, energy: 50, durationMs: 2500 }] : [],
  };
}
