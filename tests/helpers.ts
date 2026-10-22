import { bundledPvpoke, bundledRaw } from '@/data/bundledReference';
import { ReferenceData } from '@/engine/reference/referenceData';
import { ResourceView, type AnalysisContext } from '@/engine/recommendations/types';
import type { GoalWeight, OwnedPokemon, ResourceBalance } from '@/engine/types';

let cached: ReferenceData | null = null;
export function getRef(): ReferenceData {
  if (!cached) cached = new ReferenceData(bundledRaw, bundledPvpoke, { source: 'bundled', fetchedAt: 'test', versions: {} });
  return cached;
}

let n = 0;
export function owned(over: Partial<OwnedPokemon> & { speciesId: number }): OwnedPokemon {
  n += 1;
  return {
    id: `p${n}`,
    form: 'Normal',
    nickname: null,
    cp: null,
    hp: null,
    level: null,
    ivs: null,
    fastMove: null,
    chargedMove1: null,
    chargedMove2: null,
    shiny: false,
    shadow: false,
    purified: false,
    lucky: false,
    favorite: false,
    gender: 'unknown',
    size: null,
    tags: [],
    notes: null,
    dateCaught: null,
    dynamaxEligible: false,
    source: 'manual',
    importBatchId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}

export function ctxFor(
  collection: OwnedPokemon[],
  opts: { balances?: ResourceBalance[]; goals?: GoalWeight[]; trainerLevel?: number } = {},
): AnalysisContext {
  return {
    ref: getRef(),
    trainerLevel: opts.trainerLevel ?? 40,
    goals: opts.goals ?? [],
    resources: new ResourceView(opts.balances ?? []),
    collection,
    datasetVersion: 'test',
  };
}
