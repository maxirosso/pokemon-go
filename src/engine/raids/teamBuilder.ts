import { calcCp } from '../combat/cp';
import { resolveKnowledge } from '../combat/knowledge';
import { bestOffensiveMultiplier, superEffectiveAgainst } from '../combat/typeChart';
import type { ReferenceData } from '../reference/referenceData';
import type { GoSpecies, IVs, OwnedPokemon, PokemonType } from '../types';
import {
  bossTierConfig,
  buildBossProfile,
  evaluateRaidAttacker,
  rankMovesets,
  type BossProfile,
  type Combatant,
  type MovesetOption,
  type RaidModifiers,
} from './raidModel';

export interface RaidCounter {
  pokemon: OwnedPokemon;
  species: GoSpecies;
  cp: number | null;
  /** Evaluation with the moves the Pokémon currently has (or assumed best non-elite moves if unknown). */
  current: MovesetOption | null;
  currentMovesAssumed: boolean;
  /** Best moveset the species can have against this boss (elite flagged). */
  best: MovesetOption | null;
  /** Score used for ranking (current moveset). */
  score: number;
  /** Uncertainty band when IVs/level are not fully known. */
  scoreRange: { low: number; high: number } | null;
  /** True when a different moveset would improve damage by ≥ 8 %. */
  moveChangeRecommended: boolean;
  moveChangeGain: number;
  /** attack-effectiveness of the best move type vs the boss (1.6 = super-effective). */
  effectiveness: number;
  notes: string[];
}

export interface RaidTeamEstimate {
  /** Estimated fraction of boss HP one trainer's six counters deal (can exceed 1). */
  bossHpFraction: number;
  /** Rough number of trainers the model estimates are needed (ceil, ≥ 1). */
  trainersNeeded: number;
  totalDps: number;
  timeLimitSec: number;
  caveats: string[];
}

export interface RaidTeamResult {
  boss: BossProfile;
  members: RaidCounter[];
  estimate: RaidTeamEstimate;
  /** Boss weakness types the team has no strong damage in. */
  coverageGaps: PokemonType[];
  needsData: OwnedPokemon[];
}

export interface TeamBuildOptions {
  size?: number;
  maxPerSpecies?: number;
  mods: RaidModifiers;
  /** Highest level the user could power things to — used only to flag headroom. */
  includeShadow?: boolean;
}

function combatantFor(species: GoSpecies, ivs: IVs, level: number, shadow: boolean): Combatant {
  return { speciesKey: species.key, stats: species.stats, types: species.types, ivs, level, shadow };
}

function evenlySample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  for (let i = 0; i < n; i += 1) out.push(arr[Math.floor((i * (arr.length - 1)) / (n - 1))]);
  return out;
}

/** Evaluate one owned Pokémon as a counter. Returns null when level/IV data are insufficient. */
export function evaluateCounter(
  ref: ReferenceData,
  p: OwnedPokemon,
  boss: BossProfile,
  mods: RaidModifiers,
): RaidCounter | null {
  const species = ref.getSpecies(p.speciesId, p.form);
  if (!species) return null;
  const k = resolveKnowledge(ref, species, p);
  if (k.candidates.length === 0) return null;

  // Pick representative candidate (median by atk IV) for moveset selection.
  const sorted = [...k.candidates].sort((a, b) => a.ivs.atk - b.ivs.atk || a.level - b.level);
  const rep = sorted[Math.floor(sorted.length / 2)];
  const me = combatantFor(species, rep.ivs, rep.level, p.shadow);
  const options = rankMovesets(ref, me, species, boss, mods);
  if (options.length === 0) return null;
  const best = options[0];

  const pool = ref.movePool(species.speciesId, species.form);
  let current: MovesetOption | null = null;
  let assumed = false;
  if (p.fastMove && p.chargedMove1) {
    const f = ref.fastMove(p.fastMove);
    const c = ref.chargedMove(p.chargedMove1);
    if (f && c) {
      const ev = evaluateRaidAttacker(ref, me, f, c, boss, mods);
      current = {
        ...ev,
        elite: !!pool && (pool.eliteFast.includes(f.name) || pool.eliteCharged.includes(c.name)),
      };
    }
  }
  if (!current) {
    assumed = true;
    current = options.find((o) => !o.elite) ?? options[0];
  }

  // Score range across IV/level candidates for the chosen current moveset.
  let scoreRange: RaidCounter['scoreRange'] = null;
  let score = current.score;
  if (k.candidates.length > 1) {
    const f = ref.fastMove(current.fast);
    const c = ref.chargedMove(current.charged);
    if (f && c) {
      const scores = evenlySample(sorted, 40).map((cand) =>
        evaluateRaidAttacker(ref, combatantFor(species, cand.ivs, cand.level, p.shadow), f, c, boss, mods).score,
      );
      const low = Math.min(...scores);
      const high = Math.max(...scores);
      scoreRange = { low, high };
      score = (low + high) / 2;
    }
  }

  const chargedType = ref.chargedMove(current.charged)?.type;
  const effectiveness = chargedType ? bestOffensiveMultiplier(ref.typeChart, [chargedType], boss.types) : 1;
  const gain = best.score > 0 ? best.score / Math.max(current.score, 1e-9) - 1 : 0;
  const notes: string[] = [];
  if (assumed) notes.push('Moveset not entered — assuming its best non-elite moves.');
  if (scoreRange) notes.push('IVs/level not fully known — score shown as an estimate.');

  const cp = p.cp ?? calcCp(species.stats, rep.ivs, ref.cpm.get(rep.level));
  return {
    pokemon: p,
    species,
    cp: p.cp ?? (k.candidates.length === 1 ? cp : null),
    current,
    currentMovesAssumed: assumed,
    best,
    score,
    scoreRange,
    moveChangeRecommended: !assumed && gain >= 0.08 && (best.fast !== current.fast || best.charged !== current.charged),
    moveChangeGain: gain,
    effectiveness,
    notes,
  };
}

export function estimateTeam(boss: BossProfile, members: RaidCounter[]): RaidTeamEstimate {
  const limit = boss.tier.timeLimitSec;
  let remaining = limit;
  let damage = 0;
  let totalDps = 0;
  const ordered = [...members].sort((a, b) => (b.current?.score ?? 0) - (a.current?.score ?? 0));
  for (const m of ordered) {
    if (!m.current || remaining <= 0) continue;
    const t = Math.min(m.current.survivalSec, remaining);
    damage += m.current.dps * t;
    remaining -= t;
    totalDps += m.current.dps;
  }
  const frac = boss.tier.hp > 0 ? damage / boss.tier.hp : 0;
  return {
    bossHpFraction: frac,
    trainersNeeded: Math.max(1, Math.ceil(1 / Math.max(frac, 0.01))),
    totalDps,
    timeLimitSec: limit,
    caveats: [
      'Analytical estimate: no dodging, no lobby-wide effects, boss moves averaged.',
      'Not a full battle simulation — treat as a relative guide, not a guarantee.',
    ],
  };
}

export function buildRaidTeam(
  ref: ReferenceData,
  collection: OwnedPokemon[],
  bossSpecies: GoSpecies,
  tier: string,
  opts: TeamBuildOptions,
): RaidTeamResult {
  const boss = buildBossProfile(ref, bossSpecies, tier);
  const size = opts.size ?? 6;
  const maxPer = opts.maxPerSpecies ?? 2;
  const counters: RaidCounter[] = [];
  const needsData: OwnedPokemon[] = [];
  for (const p of collection) {
    if (p.deletedAt) continue;
    const c = evaluateCounter(ref, p, boss, opts.mods);
    if (c) counters.push(c);
    else needsData.push(p);
  }
  counters.sort((a, b) => b.score - a.score);
  const perSpecies = new Map<number, number>();
  const picked: RaidCounter[] = [];
  for (const c of counters) {
    const n = perSpecies.get(c.species.speciesId) ?? 0;
    if (n >= maxPer) continue;
    perSpecies.set(c.species.speciesId, n + 1);
    picked.push(c);
    if (picked.length >= size) break;
  }
  const estimate = estimateTeam(boss, picked);

  // Coverage gaps: boss weaknesses with no member whose primary move hits them super-effectively.
  const weak = superEffectiveAgainst(ref.typeChart, boss.types);
  const covered = new Set<PokemonType>();
  for (const m of picked) {
    const t = m.current ? ref.chargedMove(m.current.charged)?.type : undefined;
    if (t && weak.includes(t)) covered.add(t);
  }
  const coverageGaps = weak.filter((t) => !covered.has(t));
  return { boss, members: picked, estimate, coverageGaps, needsData };
}

export interface RaidVerdict {
  level: 'strong' | 'workable' | 'difficult' | 'insufficient-data';
  headline: string;
  details: string[];
}

export function raidVerdict(result: RaidTeamResult): RaidVerdict {
  if (result.members.length === 0) {
    return {
      level: 'insufficient-data',
      headline: 'Not enough data to evaluate your counters',
      details: ['Add Pokémon with CP, level (or IVs) so the model can compute their damage.'],
    };
  }
  const details: string[] = [];
  const f = result.estimate.bossHpFraction;
  const tier = bossTierConfig(result.boss.tier.tier);
  if (result.coverageGaps.length > 0)
    details.push(`Your team lacks strong ${result.coverageGaps.join(' / ')}-type damage against ${result.boss.name}.`);
  const moveChanges = result.members.filter((m) => m.moveChangeRecommended);
  for (const m of moveChanges.slice(0, 2))
    details.push(
      `Moving ${m.species.name} to ${m.best?.fast} + ${m.best?.charged} would raise its estimated score by ~${Math.round(m.moveChangeGain * 100)}%.`,
    );
  if (f >= 1.2)
    return { level: 'strong', headline: `You have strong counters for ${result.boss.name}`, details: [`Model estimate: your six counters deal ~${Math.round(f * 100)}% of the ${tier.hp.toLocaleString()} HP boss within ${tier.timeLimitSec}s (before dodging).`, ...details] };
  if (f >= 0.45)
    return { level: 'workable', headline: `A small group should handle ${result.boss.name}`, details: [`Model estimate: ~${result.estimate.trainersNeeded} trainers with similar teams.`, ...details] };
  return {
    level: 'difficult',
    headline: `${result.boss.name} would be difficult with your current lineup`,
    details: [`Model estimate: ~${result.estimate.trainersNeeded}+ trainers with similar teams.`, ...details],
  };
}
