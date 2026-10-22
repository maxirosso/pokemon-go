import { MAX_POWER_UP_LEVEL } from '../combat/cp';
import { resolveKnowledge } from '../combat/knowledge';
import { typeMultiplier } from '../combat/typeChart';
import { powerUpCost, type PowerUpCost } from '../powerup/powerUp';
import type { ReferenceData } from '../reference/referenceData';
import { POKEMON_TYPES, LEAGUES, type GoSpecies, type LeagueId, type OwnedPokemon, type PokemonType } from '../types';
import { averagedRating, fighterFromMoveIds, fighterFromStats, type PvpFighter } from './battle';
import { leagueEligibility, rankIvs } from './pvp';

export interface MetaThreat {
  fighter: PvpFighter;
  species: GoSpecies;
  rank: number;
  shadow: boolean;
}

/** Top-N provider-ranked threats for a league, built at their rank-1 IVs and provider moveset. */
export function buildMetaThreats(ref: ReferenceData, league: LeagueId, n: number): MetaThreat[] {
  const cap = LEAGUES[league].cpCap;
  const out: MetaThreat[] = [];
  for (const e of ref.topPvpMeta(league, n * 3)) {
    if (out.length >= n) break;
    const species = ref.getSpecies(e.speciesId, e.form);
    if (!species) continue;
    const best = rankIvs(ref, species, cap, MAX_POWER_UP_LEVEL).best;
    if (!best) continue;
    const f = fighterFromMoveIds(ref, species, best.ivs, best.level, e.moveset, e.shadow, `meta: ${species.name}${e.shadow ? ' (Shadow)' : ''}`);
    if (!f) continue;
    out.push({ fighter: f, species, rank: e.rank, shadow: e.shadow });
  }
  return out;
}

export interface PvpCandidate {
  pokemon: OwnedPokemon;
  species: GoSpecies;
  fighter: PvpFighter;
  level: number;
  cp: number;
  rank: number;
  percentOfBest: number;
  /** Level the Pokémon currently is at (null if unknown). */
  currentLevel: number | null;
  /** Cost to reach the league level; null when current level unknown. */
  powerUp: PowerUpCost | null;
  movesAssumed: boolean;
}

/**
 * Build a league-ready fighter from an owned Pokémon at the best level under the cap.
 * Requires known IVs (rank cannot be derived from a range) and at least one usable moveset.
 */
export function buildCandidate(
  ref: ReferenceData,
  p: OwnedPokemon,
  league: LeagueId,
  maxLevel: number = MAX_POWER_UP_LEVEL,
): PvpCandidate | null {
  if (p.deletedAt || !p.ivs) return null;
  const species = ref.getSpecies(p.speciesId, p.form);
  if (!species) return null;
  if (!leagueEligibility(species, league).eligible) return null;
  const cap = LEAGUES[league].cpCap;
  const ranking = rankIvs(ref, species, cap, maxLevel);
  const entry = ranking.lookup(p.ivs);
  if (!entry || !ranking.best) return null;

  let fast = p.fastMove ? ref.fastMove(p.fastMove) : undefined;
  let charged = [p.chargedMove1, p.chargedMove2].flatMap((n) => {
    const m = n ? ref.chargedMove(n) : undefined;
    return m && m.pvpEnergy > 0 ? [m] : [];
  });
  let assumed = false;
  if (!fast || fast.pvpTurns <= 0 || charged.length === 0) {
    const meta = ref.getPvpMeta(league, species.speciesId, species.form, p.shadow);
    const f = meta ? fighterFromMoveIds(ref, species, p.ivs, entry.level, meta.moveset, p.shadow, `your ${species.name}`) : null;
    if (!f) return null;
    fast = f.fast;
    charged = f.charged;
    assumed = true;
  }
  const fighter = fighterFromStats(ref, species, p.ivs, entry.level, fast, charged, p.shadow, `your ${species.name}`);
  const knowledge = resolveKnowledge(ref, species, p);
  const currentLevel = knowledge.level;
  return {
    pokemon: p,
    species,
    fighter,
    level: entry.level,
    cp: entry.cp,
    rank: entry.rank,
    percentOfBest: (entry.product / ranking.best.product) * 100,
    currentLevel,
    powerUp: currentLevel != null && currentLevel < entry.level ? powerUpCost(ref, currentLevel, entry.level, p) : null,
    movesAssumed: assumed,
  };
}

export interface MatchupCell {
  rating: number;
  byShield: [number, number, number];
}

export interface TeamAnalysis {
  members: PvpCandidate[];
  threats: MetaThreat[];
  /** matrix[memberIndex][threatIndex] */
  matrix: MatchupCell[][];
  /** Threats no member beats on average (rating < 500). */
  gaps: MetaThreat[];
  /** Types that ≥2 members are weak to. */
  sharedWeaknesses: { type: PokemonType; members: number }[];
  /** Mean over threats of the best member rating. */
  coverageScore: number;
  roles: { lead: number; safeSwitch: number; closer: number } | null;
}

export function computeMatrix(ref: ReferenceData, fighters: PvpFighter[], threats: MetaThreat[]): MatchupCell[][] {
  return fighters.map((f) => threats.map((t) => averagedRating(ref, f, t.fighter)));
}

export function weaknessCounts(ref: ReferenceData, species: GoSpecies[]): { type: PokemonType; members: number }[] {
  const out: { type: PokemonType; members: number }[] = [];
  for (const t of POKEMON_TYPES) {
    const n = species.filter((s) => typeMultiplier(ref.typeChart, t, s.types) > 1.0001).length;
    if (n >= 2) out.push({ type: t, members: n });
  }
  return out.sort((a, b) => b.members - a.members);
}

export function analyzeTeam(
  ref: ReferenceData,
  members: PvpCandidate[],
  threats: MetaThreat[],
  matrix?: MatchupCell[][],
): TeamAnalysis {
  const m = matrix ?? computeMatrix(ref, members.map((x) => x.fighter), threats);
  const best = threats.map((_, j) => Math.max(...m.map((row) => row[j].rating)));
  const gaps = threats.filter((_, j) => best[j] < 500);
  const coverageScore = best.length ? best.reduce((a, b) => a + b, 0) / best.length : 0;
  const shared = weaknessCounts(ref, members.map((x) => x.species));

  let roles: TeamAnalysis['roles'] = null;
  if (members.length === 3) {
    const energyRate = members.map((x) => x.fighter.fast.pvpEnergy / x.fighter.fast.pvpTurns);
    const avg = m.map((row) => row.reduce((a, c) => a + c.rating, 0) / Math.max(1, row.length));
    const bulk = members.map((x) => x.fighter.hp * x.fighter.def);
    const lead = argmax(members.map((_, i) => energyRate[i] * 40 + avg[i]));
    const rest = [0, 1, 2].filter((i) => i !== lead);
    const closer = rest.reduce((a, b) => (bulk[a] * (avg[a] + 1) >= bulk[b] * (avg[b] + 1) ? a : b));
    const safeSwitch = rest.find((i) => i !== closer) ?? rest[0];
    roles = { lead, safeSwitch, closer };
  }
  return { members, threats, matrix: m, gaps, sharedWeaknesses: shared, coverageScore, roles };
}

function argmax(arr: number[]): number {
  let bi = 0;
  arr.forEach((v, i) => {
    if (v > arr[bi]) bi = i;
  });
  return bi;
}

export interface SuggestedTeam {
  analysis: TeamAnalysis;
  /** Pokémon recommended to catch/build that are NOT in the collection — kept separate from deployable members. */
  missingCoverage: MetaThreat[];
}

/**
 * Pick the best three of the user's *own* Pokémon for a league. Only owned Pokémon are ever
 * placed in the team; leftover threats are reported separately as gaps to fill.
 */
export function suggestTeam(
  ref: ReferenceData,
  collection: OwnedPokemon[],
  league: LeagueId,
  opts: { maxLevel?: number; threatCount?: number; candidateLimit?: number } = {},
): SuggestedTeam | null {
  const threats = buildMetaThreats(ref, league, opts.threatCount ?? 20);
  if (threats.length === 0) return null;
  const candidates = collection
    .map((p) => buildCandidate(ref, p, league, opts.maxLevel))
    .filter((c): c is PvpCandidate => !!c);
  if (candidates.length === 0) return null;

  // pre-filter: strongest 18 by mean rating vs the threat list
  const rows = candidates.map((c) => ({
    c,
    cells: threats.map((t) => averagedRating(ref, c.fighter, t.fighter)),
  }));
  rows.sort((a, b) => avg(b.cells.map((x) => x.rating)) - avg(a.cells.map((x) => x.rating)));
  const pool = rows.slice(0, opts.candidateLimit ?? 18);
  if (pool.length <= 3) {
    const members = pool.map((r) => r.c);
    return { analysis: analyzeTeam(ref, members, threats, pool.map((r) => r.cells)), missingCoverage: [] };
  }

  let bestScore = -Infinity;
  let bestIdx: [number, number, number] | null = null;
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      for (let k = j + 1; k < pool.length; k += 1) {
        const trio = [pool[i], pool[j], pool[k]];
        // avoid duplicate species in a team
        if (new Set(trio.map((t) => t.c.species.speciesId)).size < 3) continue;
        let sum = 0;
        for (let t = 0; t < threats.length; t += 1) {
          const rs = trio.map((x) => x.cells[t].rating).sort((a, b) => b - a);
          sum += rs[0] * 0.75 + rs[1] * 0.25;
        }
        const shared = weaknessCounts(ref, trio.map((x) => x.c.species)).length;
        const score = sum / threats.length - shared * 18;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = [i, j, k];
        }
      }
    }
  }
  if (!bestIdx) return null;
  const chosen = bestIdx.map((i) => pool[i]);
  const analysis = analyzeTeam(ref, chosen.map((x) => x.c), threats, chosen.map((x) => x.cells));
  return { analysis, missingCoverage: analysis.gaps };
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
