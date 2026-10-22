import type { Knowledge } from '../combat/knowledge';
import type { ReferenceData } from '../reference/referenceData';
import type { GoalWeight, GoSpecies, LeagueId, OwnedPokemon, PokemonType, ResourceBalance, ResourceType } from '../types';

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';

export type RoleId = 'raid' | 'gymAttack' | 'gymDefense' | 'great' | 'ultra' | 'master';

export const ROLE_LABEL: Record<RoleId, string> = {
  raid: 'Raid attacker',
  gymAttack: 'Gym attacker',
  gymDefense: 'Gym defender',
  great: 'Great League',
  ultra: 'Ultra League',
  master: 'Master League',
};

export const LEAGUE_ROLE: Record<LeagueId, RoleId | null> = {
  little: null,
  great: 'great',
  ultra: 'ultra',
  master: 'master',
};

export type Basis = 'simulation' | 'provider' | 'estimate';

export interface RoleRating {
  role: RoleId;
  /** 0–100 for the Pokémon as it is now (null when unknown or not yet built). */
  now: number | null;
  /** 0–100 once developed to the role's target level/CP. null when not enough data. */
  potential: number | null;
  /** Low/high band when IVs or levels are unknown. */
  potentialRange: { low: number; high: number } | null;
  tier: Tier | null;
  basis: Basis;
  /** Short evidence line shown under the rating. */
  detail: string;
  /** Level this rating assumes as its target (raid 40 / league level / 50). */
  targetLevel: number | null;
  uncertain: boolean;
  /** Raw model score now/at potential (raid only) — lets the engine express gains as % rather than percentile points. */
  rawNow?: number | null;
  rawPotential?: number | null;
}

export type VerdictAction =
  | 'POWER_UP'
  | 'EVOLVE'
  | 'KEEP'
  | 'SAVE_FOR_PVP'
  | 'CHANGE_MOVES'
  | 'WAIT_FOR_EVENT'
  | 'DONT_INVEST'
  | 'CONSIDER_TRANSFER'
  | 'MORE_INFO';

export const VERDICT_LABEL: Record<VerdictAction, string> = {
  POWER_UP: 'Power Up',
  EVOLVE: 'Evolve',
  KEEP: 'Keep',
  SAVE_FOR_PVP: 'Save for PvP',
  CHANGE_MOVES: 'Change Moves',
  WAIT_FOR_EVENT: 'Wait for an Event',
  DONT_INVEST: "Don't Invest Yet",
  CONSIDER_TRANSFER: 'Consider Transfer',
  MORE_INFO: 'More Information Needed',
};

export interface Cost {
  stardust: number;
  candy: number;
  xlCandy: number;
  /** Candy family the candy/XL costs are drawn from. */
  familyId: number | null;
  /** Free-form extra requirements (TMs, items) that are not Stardust/Candy. */
  extras: string[];
}

export const ZERO_COST: Cost = { stardust: 0, candy: 0, xlCandy: 0, familyId: null, extras: [] };

export type When = 'now' | 'later' | 'never' | 'needs-data';

export interface Verdict {
  action: VerdictAction;
  /** Upper-case banner, e.g. "KEEP AND INVEST LATER". */
  headline: string;
  /** 1 (highest) – 5 (lowest). */
  priority: 1 | 2 | 3 | 4 | 5;
  /** Numeric impact used to rank actions across the collection (gain × goal weight). 0 when no action. */
  impact: number;
  /** impact per (1 + stardust/50k) — see GAME_MECHANICS.md. */
  efficiency: number;
  when: When;
  expectedBenefit: string;
  cost: Cost;
  /** Whether the user's *entered* resources cover the cost. null = resources not entered. */
  affordable: boolean | null;
  explanation: string;
  alternative: string | null;
  confidence: 'high' | 'medium' | 'low';
  /** Role the recommendation is aimed at (for goal weighting & UI chips). */
  role: RoleId | null;
  /** For EVOLVE: species key of the evolution target. */
  targetSpeciesKey: string | null;
  /** For POWER_UP/SAVE_FOR_PVP: level to power up to. */
  targetLevel: number | null;
}

export interface LineEntry {
  species: GoSpecies;
  ratings: Record<RoleId, RoleRating>;
  /** Goal-weighted headline value 0–100 (the max of weighted potentials). */
  value: number | null;
  bestRole: RoleId | null;
}

export interface PokemonAnalysis {
  pokemon: OwnedPokemon;
  species: GoSpecies;
  knowledge: Knowledge;
  ivPercent: number | null;
  /** Ratings for the Pokémon's *current* species. */
  ratings: Record<RoleId, RoleRating>;
  /** The current species plus every future evolution, each with its own potential ratings. */
  line: LineEntry[];
  /** The line entry with the highest goal-weighted value (may be the current species). */
  bestInLine: LineEntry | null;
  /** Evidence bullets that fed the verdict (shown in the UI as "Why"). */
  evidence: string[];
  verdict: Verdict;
  /** Better alternatives already in the collection for the verdict's role. */
  betterOwned: { pokemon: OwnedPokemon; species: GoSpecies; score: number }[];
  datasetVersion: string;
}

export class ResourceView {
  private readonly map = new Map<string, number>();
  readonly entered: boolean;

  constructor(balances: ResourceBalance[]) {
    for (const b of balances) this.map.set(this.key(b.type, b.scope), b.amount);
    this.entered = balances.length > 0;
  }

  private key(type: ResourceType, scope: string | null) {
    return `${type}|${scope ?? ''}`;
  }

  /** null = never entered (unknown), which is different from 0. */
  get(type: ResourceType, scope: string | null = null): number | null {
    return this.map.get(this.key(type, scope)) ?? null;
  }
  get stardust(): number | null {
    return this.get('stardust');
  }
  candy(familyId: number): number | null {
    return this.get('candy', String(familyId));
  }
  xl(familyId: number): number | null {
    return this.get('candy_xl', String(familyId));
  }
  get rareCandy(): number | null {
    return this.get('rare_candy');
  }
  get rareCandyXl(): number | null {
    return this.get('rare_candy_xl');
  }
  item(name: string): number | null {
    return this.get('item', name);
  }
}

export interface AnalysisContext {
  ref: ReferenceData;
  trainerLevel: number;
  goals: GoalWeight[];
  resources: ResourceView;
  /** Active (non-deleted) collection. */
  collection: OwnedPokemon[];
  /** Human-readable version string of the reference data used (shown with every recommendation). */
  datasetVersion: string;
  /** Highest level assumed for PvP rankings (50 with Candy XL, 40 without). Defaults to 50. */
  maxPvpLevel?: number;
}

export interface TypeCoverageEntry {
  type: PokemonType;
  /** Best owned attacker of this attack type (null when none has enough data). */
  best: { pokemon: OwnedPokemon; species: GoSpecies; potential: number; now: number | null } | null;
  count: number;
}
