import { applyFilters, activeFilterCount, EMPTY_FILTERS, sortPokemon, type ScoreInfo } from '@/features/collection/filtering';
import { buildDraft, emptyForm, formFromPokemon } from '@/features/collection/formModel';
import { summarizeCollection } from '@/features/collection/summary';
import { buildDemoCollection, DEMO_TAG } from '@/features/demo/demo';
import { analyzePokemon, buildPeerIndex } from '@/engine/recommendations/analysis';
import { ctxFor, getRef, owned } from './helpers';

const ref = getRef();
const P = { atk: 15, def: 15, sta: 15 };
const list = [
  owned({ speciesId: 448, cp: 2500, ivs: P, shiny: true, tags: ['keeper'] }),
  owned({ speciesId: 4, cp: 300, ivs: { atk: 5, def: 6, sta: 7 } }),
  owned({ speciesId: 150, cp: 4000, ivs: { atk: 14, def: 13, sta: 13 }, shadow: true, favorite: true }),
  owned({ speciesId: 25, cp: 500 }),
  owned({ speciesId: 184, cp: 1480, ivs: { atk: 0, def: 15, sta: 15 }, lucky: true }),
];
const names = (r: { list: { speciesId: number }[] }) => r.list.map((p) => ref.getSpecies(p.speciesId)!.name);

describe('collection filtering', () => {
  it('returns everything with empty filters', () => {
    expect(applyFilters(list, ref, EMPTY_FILTERS, null).list).toHaveLength(5);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('combines advanced filters (AND semantics)', () => {
    const r = applyFilters(list, ref, { ...EMPTY_FILTERS, types: ['Psychic', 'Fighting'], cp: { min: 3000, max: null } }, null);
    expect(names(r)).toEqual(['Mewtwo']);
    const iv = applyFilters(list, ref, { ...EMPTY_FILTERS, atkIvMin: 14 }, null);
    expect(names(iv).sort()).toEqual(['Lucario', 'Mewtwo']);
    const unknown = applyFilters(list, ref, { ...EMPTY_FILTERS, ivsKnown: false }, null);
    expect(names(unknown)).toEqual(['Pikachu']);
  });

  it('filters by status, generation, stage, rarity, tags and mega eligibility', () => {
    expect(names(applyFilters(list, ref, { ...EMPTY_FILTERS, shiny: true }, null))).toEqual(['Lucario']);
    expect(names(applyFilters(list, ref, { ...EMPTY_FILTERS, shadow: true, favorite: true }, null))).toEqual(['Mewtwo']);
    expect(names(applyFilters(list, ref, { ...EMPTY_FILTERS, generations: [1] }, null)).sort()).toEqual(['Charmander', 'Mewtwo', 'Pikachu']);
    expect(names(applyFilters(list, ref, { ...EMPTY_FILTERS, stages: ['base'] }, null)).sort()).toEqual(['Charmander', 'Mewtwo']);
    expect(names(applyFilters(list, ref, { ...EMPTY_FILTERS, legendary: true }, null))).toEqual(['Mewtwo']);
    expect(names(applyFilters(list, ref, { ...EMPTY_FILTERS, tags: ['keeper'] }, null))).toEqual(['Lucario']);
    expect(names(applyFilters(list, ref, { ...EMPTY_FILTERS, megaEligible: true }, null))).toEqual(['Lucario']); // Charmander only evolves into Mega-capable Charizard; mega data is keyed by the Mega-capable species
    expect(names(applyFilters(list, ref, { ...EMPTY_FILTERS, stars: [4] }, null))).toEqual(['Lucario']);
  });

  it('uses the search expression and surfaces syntax errors', () => {
    expect(names(applyFilters(list, ref, { ...EMPTY_FILTERS, query: 'shiny,shadow' }, null)).sort()).toEqual(['Lucario', 'Mewtwo']);
    const bad = applyFilters(list, ref, { ...EMPTY_FILTERS, query: 'fire&' }, null);
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(bad.list).toHaveLength(5); // never silently hides everything on a typo
  });

  it('applies analysis-based filters when scores are available', () => {
    const ctx = ctxFor(list.map((p) => ({ ...p, level: 30 })));
    const peers = buildPeerIndex(ctx);
    const scores = new Map<string, ScoreInfo>();
    for (const p of ctx.collection) {
      const a = analyzePokemon(ctx, p, peers)!;
      scores.set(p.id, { raid: a.ratings.raid.potential, great: a.ratings.great.potential, ultra: a.ratings.ultra.potential, master: a.ratings.master.potential, potential: a.bestInLine?.value ?? null, verdict: a.verdict });
    }
    const pvp = applyFilters(ctx.collection, ref, { ...EMPTY_FILTERS, pvpSuitable: 'great' }, scores);
    expect(names(pvp)).toContain('Azumarill');
    const evo = applyFilters(ctx.collection, ref, { ...EMPTY_FILTERS, verdicts: ['EVOLVE'] }, scores);
    expect(names(evo)).toContain('Charmander');
    // without scores these filters exclude everything rather than guessing
    expect(applyFilters(ctx.collection, ref, { ...EMPTY_FILTERS, pvpSuitable: 'great' }, null).list).toHaveLength(0);
  });
});

describe('collection sorting', () => {
  it('sorts by CP and IV with unknown values always last', () => {
    expect(sortPokemon(list, ref, 'cp-desc', null).map((p) => p.cp)).toEqual([4000, 2500, 1480, 500, 300]);
    expect(sortPokemon(list, ref, 'cp-asc', null).map((p) => p.cp)).toEqual([300, 500, 1480, 2500, 4000]);
    const iv = sortPokemon(list, ref, 'iv-desc', null);
    expect(ref.getSpecies(iv[0].speciesId)!.name).toBe('Lucario');
    expect(iv[iv.length - 1].ivs).toBeNull();
    const ivAsc = sortPokemon(list, ref, 'iv-asc', null);
    expect(ivAsc[ivAsc.length - 1].ivs).toBeNull();
  });
  it('sorts by dex number, name and recency', () => {
    expect(sortPokemon(list, ref, 'dex', null).map((p) => p.speciesId)).toEqual([4, 25, 150, 184, 448]);
    expect(sortPokemon(list, ref, 'alpha', null).map((p) => ref.getSpecies(p.speciesId)!.name)).toEqual(['Azumarill', 'Charmander', 'Lucario', 'Mewtwo', 'Pikachu']);
    const recent = sortPokemon([{ ...list[0], createdAt: '2026-01-01' }, { ...list[1], createdAt: '2026-03-01' }], ref, 'recent', null);
    expect(recent[0].speciesId).toBe(list[1].speciesId);
  });
  it('sorts by investment value using analysis impact', () => {
    const scores = new Map<string, ScoreInfo>();
    scores.set(list[0].id, { raid: 90, great: null, ultra: null, master: null, potential: 90, verdict: { impact: 5 } as never });
    scores.set(list[1].id, { raid: 10, great: null, ultra: null, master: null, potential: 10, verdict: { impact: 40 } as never });
    const sorted = sortPokemon(list.slice(0, 3), ref, 'investment', scores);
    expect(sorted[0].id).toBe(list[1].id);
    expect(sorted[2].id).toBe(list[2].id); // no verdict → last
  });
});

describe('add/edit form model', () => {
  it('never assumes IVs: empty form saves null IVs', () => {
    const { draft, errors } = buildDraft(448, emptyForm());
    expect(errors).toEqual({});
    expect(draft!.ivs).toBeNull();
    expect(draft!.cp).toBeNull();
  });
  it('requires all three IVs or none', () => {
    const r = buildDraft(448, { ...emptyForm(), atk: 15 });
    expect(r.draft).toBeNull();
    expect(r.errors.ivs).toBeDefined();
    const ok = buildDraft(448, { ...emptyForm(), atk: 1, def: 2, sta: 3, cp: 1500, level: 20.5 });
    expect(ok.draft!.ivs).toEqual({ atk: 1, def: 2, sta: 3 });
  });
  it('validates ranges, half levels, dates and exclusive flags', () => {
    expect(buildDraft(1, { ...emptyForm(), cp: 5 }).errors.cp).toBeDefined();
    expect(buildDraft(1, { ...emptyForm(), level: 20.3 }).errors.level).toBeDefined();
    expect(buildDraft(1, { ...emptyForm(), dateCaught: 'yesterday' }).errors.dateCaught).toBeDefined();
    expect(buildDraft(1, { ...emptyForm(), shadow: true, purified: true }).errors.purified).toBeDefined();
    expect(buildDraft(1, { ...emptyForm(), dateCaught: '2026-05-02' }).draft!.dateCaught).toMatch(/^2026-05-02/);
  });
  it('round-trips an existing Pokémon through the form', () => {
    const p = owned({ speciesId: 448, cp: 2000, level: 30, ivs: { atk: 3, def: 4, sta: 5 }, nickname: 'Luc', tags: ['a'], fastMove: 'Counter' });
    const { draft } = buildDraft(448, formFromPokemon(p));
    expect(draft).toMatchObject({ cp: 2000, level: 30, ivs: { atk: 3, def: 4, sta: 5 }, nickname: 'Luc', tags: ['a'], fastMove: 'Counter' });
  });
});

describe('summary & demo data', () => {
  it('summarises the collection', () => {
    const s = summarizeCollection(list, ref);
    expect(s).toMatchObject({ total: 5, uniqueSpecies: 5, shiny: 1, perfect: 1, legendary: 1, shadow: 1, lucky: 1, favorites: 1, needDetails: 1 });
  });
  it('builds a clearly-labelled, internally consistent demo collection', () => {
    const demo = buildDemoCollection(ref);
    expect(demo.length).toBeGreaterThanOrEqual(14);
    for (const d of demo) {
      expect(d.tags).toContain(DEMO_TAG);
      const s = ref.getSpecies(d.speciesId, d.form)!;
      const pool = ref.movePool(s.speciesId, s.form)!;
      if (d.fastMove) expect([...pool.fast, ...pool.eliteFast]).toContain(d.fastMove);
      if (d.chargedMove1) expect([...pool.charged, ...pool.eliteCharged]).toContain(d.chargedMove1);
      expect(d.cp).toBeGreaterThan(10);
    }
  });
});
