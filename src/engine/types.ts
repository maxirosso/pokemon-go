/**
 * Domain types for the Pokémon GO game-mechanics engine.
 * Nothing in src/engine may import React, React Native or Expo — the engine is
 * pure TypeScript so it can be unit-tested without rendering.
 */

export const POKEMON_TYPES = [
  'Normal',
  'Fire',
  'Water',
  'Electric',
  'Grass',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dragon',
  'Dark',
  'Steel',
  'Fairy',
] as const;

export type PokemonType = (typeof POKEMON_TYPES)[number];

export interface BaseStats {
  atk: number;
  def: number;
  sta: number;
}

/** Individual values (0–15). */
export interface IVs {
  atk: number;
  def: number;
  sta: number;
}

/** Possibly-unknown IVs: the app never assumes 0/0/0 or 15/15/15 when unknown. */
export type MaybeIVs = IVs | null;

export type LeagueId = 'little' | 'great' | 'ultra' | 'master';

export const LEAGUES: Record<LeagueId, { id: LeagueId; label: string; cpCap: number }> = {
  little: { id: 'little', label: 'Little Cup', cpCap: 500 },
  great: { id: 'great', label: 'Great League', cpCap: 1500 },
  ultra: { id: 'ultra', label: 'Ultra League', cpCap: 2500 },
  master: { id: 'master', label: 'Master League', cpCap: Number.POSITIVE_INFINITY },
};

export type Rarity = 'standard' | 'legendary' | 'mythical' | 'ultra-beast';

export interface SpeciesKey {
  speciesId: number;
  form: string;
}

export interface GoSpecies {
  key: string; // `${speciesId}:${form}`
  speciesId: number;
  name: string;
  form: string;
  stats: BaseStats;
  types: PokemonType[];
  generation: number;
  rarity: Rarity;
  isBaby: boolean;
  shadowAvailable: boolean;
  shinyAvailable: boolean;
  released: boolean;
  /** Evolution-family id (lowest speciesId in the connected evolution graph). */
  familyId: number;
  /** 0 = base stage. */
  stage: number;
  /** True when no further evolutions exist. */
  isFinalStage: boolean;
}

export interface FastMove {
  id: number;
  name: string;
  type: PokemonType;
  /** PvE */
  power: number;
  energy: number;
  durationMs: number;
  /** PvP */
  pvpPower: number;
  pvpEnergy: number;
  pvpTurns: number;
}

export interface MoveBuffs {
  activationChance: number;
  selfAtk?: number;
  selfDef?: number;
  targetAtk?: number;
  targetDef?: number;
}

export interface ChargedMove {
  id: number;
  name: string;
  type: PokemonType;
  /** PvE */
  power: number;
  /** Positive energy cost. */
  energy: number;
  durationMs: number;
  critChance: number;
  /** PvP */
  pvpPower: number;
  pvpEnergy: number;
  buffs: MoveBuffs | null;
}

export interface MovePool {
  fast: string[];
  charged: string[];
  eliteFast: string[];
  eliteCharged: string[];
}

export interface EvolutionEdge {
  fromKey: string;
  toKey: string;
  candy: number;
  item?: string;
  lure?: string;
  buddyDistanceKm?: number;
  mustBeBuddy?: boolean;
  daytimeOnly?: boolean;
  nighttimeOnly?: boolean;
  noCandyIfTraded?: boolean;
  genderRequired?: string;
  upsideDown?: boolean;
  priority?: number;
}

export interface PowerUpStep {
  level: number;
  nextLevel: number;
  stardust: number;
  candy: number;
  xlCandy: number;
}

export interface MegaForm {
  speciesId: number;
  baseForm: string;
  name: string;
  stats: BaseStats;
  types: PokemonType[];
  energyFirst: number;
  energyRepeat: number;
}

export interface RaidBoss {
  speciesId: number;
  form: string;
  name: string;
  tier: string; // '1'..'6' | 'mega' | 'mega_legendary' | 'ex'
  types: PokemonType[];
  boostedWeather: string[];
  cpMin: number;
  cpMax: number;
  possibleShiny: boolean;
}

export type TagId = string;

export type PokemonSource = 'manual' | 'screenshot' | 'csv' | 'json' | 'backup' | 'demo' | 'ai-screenshot';

export type SizeVariant = 'XXS' | 'XS' | 'M' | 'XL' | 'XXL';

export type AppraisalOverall = 0 | 1 | 2 | 3;

export interface OwnedPokemon {
  id: string;
  speciesId: number;
  form: string;
  nickname: string | null;
  cp: number | null;
  hp: number | null;
  /** Confirmed/estimated level (half-levels allowed). null = unknown. */
  level: number | null;
  ivs: MaybeIVs;
  fastMove: string | null;
  chargedMove1: string | null;
  chargedMove2: string | null;
  shiny: boolean;
  shadow: boolean;
  purified: boolean;
  lucky: boolean;
  favorite: boolean;
  gender: 'male' | 'female' | 'unknown';
  size: SizeVariant | null;
  tags: TagId[];
  notes: string | null;
  dateCaught: string | null;
  /** True when the user asserts a Mega/Dynamax capable flag etc. is out of scope; kept for extensibility */
  dynamaxEligible: boolean;
  source: PokemonSource;
  importBatchId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type ResourceType =
  | 'stardust'
  | 'rare_candy'
  | 'rare_candy_xl'
  | 'candy'
  | 'candy_xl'
  | 'fast_tm'
  | 'charged_tm'
  | 'elite_fast_tm'
  | 'elite_charged_tm'
  | 'mega_energy'
  | 'item';

export interface ResourceBalance {
  type: ResourceType;
  /** Evolution family id for candy / candy_xl / mega_energy; item name for item; null otherwise. */
  scope: string | null;
  amount: number;
}

export type GoalId =
  | 'raids'
  | 'great_league'
  | 'ultra_league'
  | 'master_league'
  | 'collecting'
  | 'pokedex'
  | 'stardust'
  | 'account_strength';

export interface GoalWeight {
  goal: GoalId;
  /** 0..1 relative weight. */
  weight: number;
}
