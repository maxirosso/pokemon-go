import { analyzeCollectionSync } from '@/engine/recommendations/account';
import { applyFilters, EMPTY_FILTERS, sortPokemon } from '@/features/collection/filtering';
import type { OwnedPokemon } from '@/engine/types';
import { ctxFor, getRef, owned } from './helpers';

/** Smoke-level performance budgets on Node (a laptop is roughly 3–5× faster than a mid-range phone on Hermes). */
describe('large collections', () => {
  const ref = getRef();
  const species = ref.listSpecies().filter((s) => s.released && ref.movePool(s.speciesId, s.form));
  const big: OwnedPokemon[] = Array.from({ length: 1500 }, (_, i) => {
    const s = species[(i * 7) % species.length];
    const level = 10 + (i % 30);
    return owned({
      speciesId: s.speciesId,
      form: s.form,
      level,
      ivs: { atk: i % 16, def: (i >> 1) % 16, sta: (i >> 2) % 16 },
      cp: 100 + i,
    });
  });

  it('filters and sorts 1,500 Pokémon quickly', () => {
    const t0 = Date.now();
    const r = applyFilters(big, ref, { ...EMPTY_FILTERS, query: 'fire,water', ivPercent: { min: 50, max: null } }, null);
    sortPokemon(r.list, ref, 'iv-desc', null);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('analyses a 400-Pokémon collection within a few seconds', () => {
    const subset = big.slice(0, 400);
    const t0 = Date.now();
    const account = analyzeCollectionSync(ctxFor(subset));
    const ms = Date.now() - t0;
    expect(account.analyses).toHaveLength(400);
    console.log(`analysis of 400 Pokémon: ${ms} ms`);
    expect(ms).toBeLessThan(40000);
  });
});
