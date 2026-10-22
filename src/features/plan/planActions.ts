import { speciesDisplayName } from '@/engine/reference/referenceData';
import type { PokemonAnalysis } from '@/engine/recommendations/types';
import { VERDICT_LABEL } from '@/engine/recommendations/types';
import { getDb } from '@/services/database/db';
import { planRepo } from '@/services/database/repositories';
import { useData } from '@/store/data';

/** Save the engine's recommendation for a Pokémon as a tracked investment-plan task. */
export async function addPlanFromVerdict(a: PokemonAnalysis, opts: { reminderAt?: string | null } = {}): Promise<void> {
  const v = a.verdict;
  const db = await getDb();
  await planRepo.add(db, {
    pokemonId: a.pokemon.id,
    actionType: v.action,
    title: `${VERDICT_LABEL[v.action]}: ${speciesDisplayName(a.species)}${a.pokemon.nickname ? ` “${a.pokemon.nickname}”` : ''}`,
    targetLevel: v.targetLevel,
    targetSpeciesKey: v.targetSpeciesKey,
    estimatedStardust: v.cost.stardust,
    estimatedCandy: v.cost.candy,
    estimatedXl: v.cost.xlCandy,
    priority: v.priority,
    note: v.expectedBenefit || null,
    dependsOn: null,
    reminderAt: opts.reminderAt ?? null,
  });
  await useData.getState().reloadPlan();
}

export async function addCustomPlanAction(input: {
  pokemonId: string | null;
  actionType: string;
  title: string;
  targetLevel?: number | null;
  targetSpeciesKey?: string | null;
  stardust?: number;
  candy?: number;
  xl?: number;
  priority?: number;
  note?: string | null;
}): Promise<void> {
  const db = await getDb();
  await planRepo.add(db, {
    pokemonId: input.pokemonId,
    actionType: input.actionType,
    title: input.title,
    targetLevel: input.targetLevel ?? null,
    targetSpeciesKey: input.targetSpeciesKey ?? null,
    estimatedStardust: input.stardust ?? 0,
    estimatedCandy: input.candy ?? 0,
    estimatedXl: input.xl ?? 0,
    priority: input.priority ?? 3,
    note: input.note ?? null,
    dependsOn: null,
    reminderAt: null,
  });
  await useData.getState().reloadPlan();
}
