import { POKEMON_TYPES, type PokemonType } from '../types';

/** attackType → defenderType → multiplier (Pokémon GO values: 1.6 / 0.625 / 0.390625). */
export type TypeChart = Record<string, Record<string, number>>;

/** Combined multiplier of one attack type against a (possibly dual-typed) defender. */
export function typeMultiplier(chart: TypeChart, attack: PokemonType, defenders: readonly PokemonType[]): number {
  const row = chart[attack];
  if (!row) return 1;
  let m = 1;
  for (const d of defenders) m *= row[d] ?? 1;
  return m;
}

export interface TypeMatchups {
  /** attacker type → multiplier against this defender */
  weaknesses: { type: PokemonType; multiplier: number }[];
  resistances: { type: PokemonType; multiplier: number }[];
  neutral: PokemonType[];
}

/** Weaknesses/resistances of a defender with the given types. */
export function defensiveMatchups(chart: TypeChart, defenderTypes: readonly PokemonType[]): TypeMatchups {
  const weaknesses: TypeMatchups['weaknesses'] = [];
  const resistances: TypeMatchups['resistances'] = [];
  const neutral: PokemonType[] = [];
  for (const t of POKEMON_TYPES) {
    const m = typeMultiplier(chart, t, defenderTypes);
    if (m > 1.0001) weaknesses.push({ type: t, multiplier: m });
    else if (m < 0.9999) resistances.push({ type: t, multiplier: m });
    else neutral.push(t);
  }
  weaknesses.sort((a, b) => b.multiplier - a.multiplier);
  resistances.sort((a, b) => a.multiplier - b.multiplier);
  return { weaknesses, resistances, neutral };
}

/** Types that hit `defenderTypes` super-effectively, best first. */
export function superEffectiveAgainst(chart: TypeChart, defenderTypes: readonly PokemonType[]): PokemonType[] {
  return defensiveMatchups(chart, defenderTypes).weaknesses.map((w) => w.type);
}

/** Best multiplier any of the attacker's types can achieve vs a defender (offensive coverage). */
export function bestOffensiveMultiplier(
  chart: TypeChart,
  attackTypes: readonly PokemonType[],
  defenderTypes: readonly PokemonType[],
): number {
  let best = 0;
  for (const a of attackTypes) best = Math.max(best, typeMultiplier(chart, a, defenderTypes));
  return best;
}
