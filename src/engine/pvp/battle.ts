import { calcBattleStats, calcCp, type CpmTable } from '../combat/cp';
import { typeMultiplier } from '../combat/typeChart';
import type { ReferenceData } from '../reference/referenceData';
import { normalizeName } from '../reference/referenceData';
import type { ChargedMove, FastMove, GoSpecies, IVs, PokemonType } from '../types';
import { SHADOW_ATTACK, SHADOW_DEFENSE } from '../raids/raidModel';

/**
 * Deterministic 1v1 Go Battle League simulator (turn based, 0.5 s turns).
 *
 * What is modelled: fast-move turn timing, energy, charged moves, shields, move buffs with 100 %
 * activation chance, stat stages, charged-move priority (higher Attack), STAB, type effectiveness,
 * shadow modifiers, simple bait/shield heuristics.
 * What is NOT modelled: probabilistic buffs (<100 % chance), switching, optimal bait play, fast-move
 * timing tricks. Results are good for relative comparisons — they are not a tournament-grade simulator.
 */

export interface PvpFighter {
  name: string;
  types: PokemonType[];
  atk: number;
  def: number;
  hp: number;
  fast: FastMove;
  charged: ChargedMove[];
  shadow: boolean;
  /** Descriptive tag, e.g. "your Lucario" / "meta: Altaria". */
  label: string;
}

export interface BattleResult {
  winner: 'a' | 'b' | 'tie';
  aHpPct: number;
  bHpPct: number;
  /** 0–1000: >500 is a win. Combines remaining HP and damage dealt. */
  rating: number;
  turns: number;
}

const stageMult = (s: number) => (s >= 0 ? (4 + s) / 4 : 4 / (4 - s));
const clampStage = (s: number) => Math.max(-4, Math.min(4, s));

interface State {
  f: PvpFighter;
  hp: number;
  energy: number;
  cd: number;
  shields: number;
  atkStage: number;
  defStage: number;
  atk: number;
  def: number;
}

function mk(f: PvpFighter, shields: number): State {
  return {
    f,
    hp: f.hp,
    energy: 0,
    cd: 0,
    shields,
    atkStage: 0,
    defStage: 0,
    atk: f.atk * (f.shadow ? SHADOW_ATTACK : 1),
    def: f.def * (f.shadow ? SHADOW_DEFENSE : 1),
  };
}

function pvpDamage(
  ref: ReferenceData,
  power: number,
  type: PokemonType,
  from: State,
  to: State,
): number {
  const a = from.atk * stageMult(from.atkStage);
  const d = to.def * stageMult(to.defStage);
  let mult = typeMultiplier(ref.typeChart, type, to.f.types);
  if (from.f.types.includes(type)) mult *= 1.2;
  return Math.floor(0.5 * power * (a / d) * mult) + 1;
}

function chooseCharged(ref: ReferenceData, me: State, opp: State): ChargedMove | null {
  const afford = me.f.charged.filter((c) => c.pvpEnergy > 0 && c.pvpEnergy <= me.energy);
  if (afford.length === 0) return null;
  if (opp.shields > 0) {
    // bait: cheapest affordable move
    return afford.reduce((a, b) => (a.pvpEnergy <= b.pvpEnergy ? a : b));
  }
  // no shields: best damage-per-energy among affordable, but throw lethal moves first
  const dmg = (c: ChargedMove) => pvpDamage(ref, c.pvpPower, c.type, me, opp);
  const lethal = afford.filter((c) => dmg(c) >= opp.hp);
  if (lethal.length) return lethal.reduce((a, b) => (a.pvpEnergy <= b.pvpEnergy ? a : b));
  return afford.reduce((a, b) => (dmg(a) / a.pvpEnergy >= dmg(b) / b.pvpEnergy ? a : b));
}

function throwCharged(ref: ReferenceData, me: State, opp: State, move: ChargedMove) {
  me.energy -= move.pvpEnergy;
  const dmg = pvpDamage(ref, move.pvpPower, move.type, me, opp);
  const shield = opp.shields > 0 && (dmg >= opp.hp || dmg >= opp.hp * 0.3 || dmg >= 0.2 * opp.f.hp);
  if (shield) {
    opp.shields -= 1;
    opp.hp -= 1;
  } else {
    opp.hp -= dmg;
  }
  const b = move.buffs;
  if (b && b.activationChance >= 1) {
    if (b.selfAtk) me.atkStage = clampStage(me.atkStage + b.selfAtk);
    if (b.selfDef) me.defStage = clampStage(me.defStage + b.selfDef);
    if (b.targetAtk) opp.atkStage = clampStage(opp.atkStage + b.targetAtk);
    if (b.targetDef) opp.defStage = clampStage(opp.defStage + b.targetDef);
  }
}

export function simulateBattle(ref: ReferenceData, a: PvpFighter, b: PvpFighter, shieldsA = 1, shieldsB = 1): BattleResult {
  const A = mk(a, shieldsA);
  const B = mk(b, shieldsB);
  let turn = 0;
  const MAX_TURNS = 1200;
  while (A.hp > 0 && B.hp > 0 && turn < MAX_TURNS) {
    turn += 1;
    A.cd -= 1;
    B.cd -= 1;
    const aReady = A.cd <= 0;
    const bReady = B.cd <= 0;
    // resolve fast moves that complete this turn (simultaneous)
    if (aReady && A.f.fast.pvpTurns > 0 && turn > 1) {
      B.hp -= pvpDamage(ref, A.f.fast.pvpPower, A.f.fast.type, A, B);
      A.energy = Math.min(100, A.energy + A.f.fast.pvpEnergy);
    }
    if (bReady && B.f.fast.pvpTurns > 0 && turn > 1) {
      A.hp -= pvpDamage(ref, B.f.fast.pvpPower, B.f.fast.type, B, A);
      B.energy = Math.min(100, B.energy + B.f.fast.pvpEnergy);
    }
    if (A.hp <= 0 || B.hp <= 0) break;
    // charged moves (higher attack stat goes first on ties of timing)
    const order: [State, State, boolean][] =
      A.atk >= B.atk
        ? [
            [A, B, aReady],
            [B, A, bReady],
          ]
        : [
            [B, A, bReady],
            [A, B, aReady],
          ];
    for (const [me, opp, ready] of order) {
      if (!ready || me.hp <= 0 || opp.hp <= 0) continue;
      const move = chooseCharged(ref, me, opp);
      if (move) throwCharged(ref, me, opp, move);
    }
    if (A.hp <= 0 || B.hp <= 0) break;
    if (aReady) A.cd = A.f.fast.pvpTurns;
    if (bReady) B.cd = B.f.fast.pvpTurns;
  }
  const aPct = Math.max(0, A.hp) / a.hp;
  const bPct = Math.max(0, B.hp) / b.hp;
  const rating = Math.round((aPct + (1 - bPct)) * 500);
  const winner = A.hp > 0 && B.hp <= 0 ? 'a' : B.hp > 0 && A.hp <= 0 ? 'b' : aPct > bPct ? 'a' : bPct > aPct ? 'b' : 'tie';
  return { winner, aHpPct: aPct, bHpPct: bPct, rating, turns: turn };
}

/** Mean rating over 0v0, 1v1 and 2v2 shield scenarios. */
export function averagedRating(ref: ReferenceData, a: PvpFighter, b: PvpFighter): { rating: number; byShield: [number, number, number] } {
  const r0 = simulateBattle(ref, a, b, 0, 0).rating;
  const r1 = simulateBattle(ref, a, b, 1, 1).rating;
  const r2 = simulateBattle(ref, a, b, 2, 2).rating;
  return { rating: Math.round((r0 + r1 + r2) / 3), byShield: [r0, r1, r2] };
}

// ---- fighter construction -----------------------------------------------------------------------

const moveNameIndex = new WeakMap<ReferenceData, { fast: Map<string, FastMove>; charged: Map<string, ChargedMove> }>();

function indexMoves(ref: ReferenceData) {
  let idx = moveNameIndex.get(ref);
  if (!idx) {
    idx = {
      fast: new Map(ref.allFastMoves().map((m) => [normalizeName(m.name), m])),
      charged: new Map(ref.allChargedMoves().map((m) => [normalizeName(m.name), m])),
    };
    moveNameIndex.set(ref, idx);
  }
  return idx;
}

/** PvPoke move ids ("WEATHER_BALL_FIRE") → provider move objects. null when our dataset lacks the move. */
export function resolveMove(ref: ReferenceData, id: string): { fast?: FastMove; charged?: ChargedMove } {
  const key = normalizeName(id);
  const idx = indexMoves(ref);
  const f = idx.fast.get(key);
  const c = idx.charged.get(key);
  return { fast: f, charged: c };
}

export function fighterFromStats(
  ref: ReferenceData,
  species: GoSpecies,
  ivs: IVs,
  level: number,
  fast: FastMove,
  charged: ChargedMove[],
  shadow: boolean,
  label: string,
): PvpFighter {
  const s = calcBattleStats(species.stats, ivs, ref.cpm.get(level));
  return { name: species.name, types: species.types, atk: s.atk, def: s.def, hp: s.hp, fast, charged, shadow, label };
}

/** Fighter built from a PvPoke-style move id list [fast, charged1, charged2?]. Returns null if any move is unknown. */
export function fighterFromMoveIds(
  ref: ReferenceData,
  species: GoSpecies,
  ivs: IVs,
  level: number,
  moveIds: string[],
  shadow: boolean,
  label: string,
): PvpFighter | null {
  const [fastId, ...chargedIds] = moveIds;
  const fast = fastId ? resolveMove(ref, fastId).fast : undefined;
  if (!fast || fast.pvpTurns <= 0) return null;
  const charged = chargedIds.flatMap((id) => {
    const c = resolveMove(ref, id).charged;
    return c && c.pvpEnergy > 0 ? [c] : [];
  });
  if (charged.length === 0) return null;
  return fighterFromStats(ref, species, ivs, level, fast, charged, shadow, label);
}

export function cpOfFighterLevel(table: CpmTable, species: GoSpecies, ivs: IVs, level: number): number {
  return calcCp(species.stats, ivs, table.get(level));
}
