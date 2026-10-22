import { bundledManifest, bundledPvpoke, bundledRaw } from '@/data/bundledReference';
import { rawBundleSchema, pvpokeRankingSchema } from '@/engine/reference/schemas';
import { getRef } from './helpers';

describe('bundled reference data', () => {
  it('validates against the runtime Zod schemas', () => {
    const r = rawBundleSchema.safeParse(bundledRaw);
    expect(r.success).toBe(true);
    for (const rows of Object.values(bundledPvpoke)) expect(pvpokeRankingSchema.safeParse(rows).success).toBe(true);
  });

  it('records provenance for the snapshot', () => {
    expect(bundledManifest.generatedAt).toMatch(/^20\d\d-/);
    expect(Object.keys(bundledManifest.pogoapi).length).toBeGreaterThan(15);
  });

  it('normalises species with Pokémon GO base stats (not main-series stats)', () => {
    const ref = getRef();
    const lucario = ref.getSpecies(448)!;
    expect(lucario.name).toBe('Lucario');
    // Pokémon GO base stats (attack 236 / defense 144 / stamina 172), main-series would be 110/70/70.
    expect(lucario.stats).toEqual({ atk: 236, def: 144, sta: 172 });
    expect(lucario.types).toEqual(['Fighting', 'Steel']);
    expect(lucario.generation).toBe(4);
  });

  it('builds evolution families with candy families and stages', () => {
    const ref = getRef();
    const eevee = ref.familyMembers(133).map((s) => s.name);
    expect(eevee).toEqual(expect.arrayContaining(['Eevee', 'Vaporeon', 'Umbreon', 'Sylveon']));
    expect(ref.getSpecies(6)!.stage).toBe(2);
    expect(ref.getSpecies(4)!.stage).toBe(0);
    expect(ref.getSpecies(4)!.isFinalStage).toBe(false);
    expect(ref.getSpecies(6)!.isFinalStage).toBe(true);
    expect(ref.getSpecies(6)!.familyId).toBe(4);
  });

  it('keeps regional forms separate and collapses cosmetic ones', () => {
    const ref = getRef();
    expect(ref.getByKey('19:Alola')?.types).toEqual(['Dark', 'Normal']);
    expect(ref.getByKey('25:Doctor')).toBeUndefined();
  });

  it('flags rarity classes from provider data', () => {
    const ref = getRef();
    expect(ref.getSpecies(150)!.rarity).toBe('legendary');
    expect(ref.getSpecies(151)!.rarity).toBe('mythical');
    expect(ref.getSpecies(793)!.rarity).toBe('ultra-beast');
  });

  it('maps PvPoke ranking entries onto Pokémon GO species', () => {
    const ref = getRef();
    expect(ref.hasPvpMeta()).toBe(true);
    const meta = ref.getPvpMeta('great', 448, 'Normal', false);
    expect(meta).not.toBeNull();
    expect(meta!.moveset.length).toBe(3);
    expect(ref.getPvpMeta('great', 38, 'Alola', false)).not.toBeNull(); // Alolan Ninetales
  });

  it('finds species from messy names', () => {
    const ref = getRef();
    expect(ref.findSpeciesIdByName('mr. mime')).toBe(122);
    expect(ref.findSpeciesIdByName('Farfetch’d')).toBe(83);
    expect(ref.findSpeciesIdByName('nidoran♀')).toBe(29);
  });
});
