import { parseBackup, serializeBackup, pokemonToBackup } from '@/engine/io/backup';
import { parseCsv, toCsv } from '@/engine/io/csv';
import { extractedToReview, parseOcrText } from '@/engine/io/extraction';
import {
  CSV_EXPORT_HEADER,
  importCsv,
  importJsonPokemon,
  pokemonToCsvRows,
  splitDuplicates,
} from '@/engine/io/importers';
import { compileSearch } from '@/engine/search/query';
import { calcCp, calcHp } from '@/engine/combat/cp';
import { getRef, owned } from './helpers';

const ref = getRef();

describe('CSV parsing', () => {
  it('handles quotes, escaped quotes, commas and newlines inside fields', () => {
    const rows = parseCsv('a,b\n"x, y","say ""hi"""\n"multi\nline",z');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['multi\nline', 'z'],
    ]);
  });
  it('detects semicolon delimiters and strips BOM', () => {
    expect(parseCsv('﻿a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('round-trips through toCsv', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'q"q']]);
    expect(parseCsv(csv)[1]).toEqual(['x,y', 'q"q']);
  });
});

describe('CSV import', () => {
  it('imports a Poke Genie style export and validates every row', () => {
    const csv = [
      'Name,Form,Pokemon Number,Gender,CP,HP,Atk IV,Def IV,Sta IV,Level Min,Level Max,Quick Move,Charge Move,Lucky,Shadow/Purified',
      'Lucario,,448,Male,2500,150,15,15,15,30,30,Counter,Aura Sphere,0,',
      'Marowak,Alolan,105,Female,1400,110,10,11,12,,,Fire Spin,Shadow Bone,1,Shadow',
      'Notamon,,,,500,,,,,,,,,,',
      'Pikachu,,25,,100,,16,15,15,,,,,,',
      'Eevee,,133,,300,,12,,,,,,,,',
    ].join('\n');
    const r = importCsv(ref, csv);
    expect(r.accepted).toHaveLength(3);
    expect(r.rejected.map((x) => x.line)).toEqual([4, 5]);
    expect(r.rejected[0].reason).toContain('Unknown species');
    expect(r.rejected[1].reason).toContain('IVs');
    const [lucario, marowak, eevee] = r.accepted;
    expect(lucario).toMatchObject({ speciesId: 448, cp: 2500, level: 30, ivs: { atk: 15, def: 15, sta: 15 }, fastMove: 'Counter', chargedMove1: 'Aura Sphere' });
    expect(marowak).toMatchObject({ speciesId: 105, form: 'Alola', shadow: true, lucky: true });
    expect(eevee.ivs).toBeNull(); // partial IVs are never guessed
    expect(r.warnings.some((w) => w.includes('only some IVs'))).toBe(true);
  });

  it('rejects files without recognisable headers or rows', () => {
    expect(importCsv(ref, 'foo,bar\n1,2').rejected[0].reason).toContain('No recognised column headers');
    expect(importCsv(ref, 'Name,CP').rejected[0].reason).toContain('no data rows');
  });

  it('rejects out-of-range IVs, CP and levels', () => {
    const r = importCsv(ref, 'Name,CP,Atk IV,Def IV,Sta IV,Level\nLucario,99999999,1,1,1,\nLucario,1000,1,1,1,60\nLucario,1000,1,1,99,');
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected).toHaveLength(3);
  });

  it('infers level from CP+IVs only when unique, and warns about impossible CP', () => {
    const lucario = ref.getSpecies(448)!;
    const cp = calcCp(lucario.stats, { atk: 15, def: 15, sta: 15 }, ref.cpm.get(40));
    const hp = calcHp(lucario.stats.sta, 15, ref.cpm.get(40));
    const ok = importCsv(ref, `Name,CP,HP,Atk IV,Def IV,Sta IV\nLucario,${cp},${hp},15,15,15`);
    expect(ok.accepted[0].level).toBe(40);
    const bad = importCsv(ref, 'Name,CP,Atk IV,Def IV,Sta IV\nLucario,10,15,15,15');
    expect(bad.warnings.some((w) => w.includes('impossible'))).toBe(true);
  });
});

describe('JSON import', () => {
  it('accepts arrays and objects with a pokemon array', () => {
    const arr = importJsonPokemon(ref, JSON.stringify([{ name: 'Lucario', cp: 2000, ivs: { atk: 1, def: 2, sta: 3 } }]));
    expect(arr.accepted[0].ivs).toEqual({ atk: 1, def: 2, sta: 3 });
    const obj = importJsonPokemon(ref, JSON.stringify({ pokemon: [{ speciesId: 25, cp: 400 }] }));
    expect(obj.accepted[0].speciesId).toBe(25);
  });
  it('rejects malformed JSON and wrong shapes', () => {
    expect(importJsonPokemon(ref, '{nope').rejected[0].reason).toContain('not valid JSON');
    expect(importJsonPokemon(ref, '{"a":1}').rejected[0].reason).toContain('Expected');
    expect(importJsonPokemon(ref, '[1,"x"]').rejected).toHaveLength(2);
  });
});

describe('duplicates', () => {
  it('prevents re-importing identical Pokémon but allows species-only entries', () => {
    const existing = [owned({ speciesId: 448, cp: 2500, ivs: { atk: 15, def: 15, sta: 15 }, level: 30 })];
    const incoming = importJsonPokemon(
      ref,
      JSON.stringify([
        { speciesId: 448, cp: 2500, level: 30, ivs: { atk: 15, def: 15, sta: 15 } },
        { speciesId: 448, cp: 2501, level: 30, ivs: { atk: 15, def: 15, sta: 15 } },
        { speciesId: 25 },
        { speciesId: 25 },
      ]),
    ).accepted;
    const { fresh, duplicates } = splitDuplicates(existing, incoming);
    expect(duplicates).toHaveLength(1);
    expect(fresh).toHaveLength(3);
  });
  it('ignores soft-deleted Pokémon when checking duplicates', () => {
    const existing = [owned({ speciesId: 448, cp: 2500, deletedAt: '2026-01-01T00:00:00.000Z' })];
    const incoming = importJsonPokemon(ref, JSON.stringify([{ speciesId: 448, cp: 2500 }])).accepted;
    expect(splitDuplicates(existing, incoming).duplicates).toHaveLength(0);
  });
});

describe('backup & restore', () => {
  it('round-trips a backup', () => {
    const p = owned({ speciesId: 448, cp: 2500, ivs: { atk: 15, def: 14, sta: 13 }, tags: ['keeper'] });
    const text = serializeBackup({
      trainer: { nickname: 'Max', trainerLevel: 48, goals: [{ goal: 'raids', weight: 1 }], playStyle: null, language: 'en' },
      pokemon: [pokemonToBackup(p)],
      resources: [{ type: 'stardust', scope: null, amount: 12345 }],
      teams: [],
      plan: [],
      tags: [],
    });
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.pokemon[0]).toMatchObject({ id: p.id, speciesId: 448, tags: ['keeper'] });
      expect(r.backup.resources[0].amount).toBe(12345);
      expect(r.backup.schemaVersion).toBe(1);
    }
  });
  it('rejects malformed or foreign files with readable errors', () => {
    expect(parseBackup('xx').ok).toBe(false);
    const foreign = parseBackup(JSON.stringify({ app: 'other', pokemon: [] }));
    expect(foreign.ok).toBe(false);
    const badIv = parseBackup(
      JSON.stringify({
        app: 'go-compass',
        schemaVersion: 1,
        exportedAt: 'x',
        pokemon: [{ id: 'a', speciesId: 1, createdAt: 'x', updatedAt: 'x', ivs: { atk: 99, def: 1, sta: 1 } }],
      }),
    );
    expect(badIv.ok).toBe(false);
    if (!badIv.ok) expect(badIv.issues.join(' ')).toContain('ivs.atk');
  });
  it('exports CSV that can be re-imported', () => {
    const p = owned({ speciesId: 448, cp: 2500, level: 30, ivs: { atk: 1, def: 2, sta: 3 }, fastMove: 'Counter', chargedMove1: 'Aura Sphere', shiny: true });
    const csv = toCsv(CSV_EXPORT_HEADER, pokemonToCsvRows([p]));
    const r = importCsv(ref, csv);
    expect(r.rejected).toHaveLength(0);
    expect(r.accepted[0]).toMatchObject({ speciesId: 448, cp: 2500, level: 30, shiny: true, fastMove: 'Counter' });
  });
});

describe('search expressions', () => {
  const pikachu = owned({ speciesId: 25, cp: 500, ivs: { atk: 15, def: 15, sta: 15 }, shiny: true, tags: ['keeper'], nickname: 'Sparky' });
  const lucario = owned({ speciesId: 448, cp: 2500, ivs: { atk: 5, def: 6, sta: 7 }, shadow: true });
  const charmander = owned({ speciesId: 4, cp: 300 });
  const recs = [pikachu, lucario, charmander].map((pokemon) => ({ pokemon, species: ref.getSpecies(pokemon.speciesId, pokemon.form)! }));
  const run = (q: string) => {
    const c = compileSearch(q);
    return recs.filter((r) => c.test(r)).map((r) => r.species.name);
  };
  it('matches names, nicknames, dex numbers and aliases', () => {
    expect(run('pika')).toEqual(['Pikachu']);
    expect(run('sparky')).toEqual(['Pikachu']);
    expect(run('448')).toEqual(['Lucario']);
    expect(run('1-30')).toEqual(['Pikachu', 'Charmander']);
  });
  it('supports AND / OR / NOT', () => {
    expect(run('fire,fighting')).toEqual(['Lucario', 'Charmander']);
    expect(run('shiny&electric')).toEqual(['Pikachu']);
    expect(run('!shiny')).toEqual(['Lucario', 'Charmander']);
  });
  it('supports ranges, stars and IV filters', () => {
    expect(run('cp1000-')).toEqual(['Lucario']);
    expect(run('cp-600')).toEqual(['Pikachu', 'Charmander']);
    expect(run('4*')).toEqual(['Pikachu']);
    expect(run('iv90-')).toEqual(['Pikachu']);
    expect(run('atk0-5')).toEqual(['Lucario']);
    expect(run('ivunknown')).toEqual(['Charmander']);
  });
  it('supports flags, generation, tags and evolution state', () => {
    expect(run('shadow')).toEqual(['Lucario']);
    expect(run('gen4')).toEqual(['Lucario']);
    expect(run('tag:keeper')).toEqual(['Pikachu']);
    expect(run('evolve')).toEqual(['Pikachu', 'Charmander']);
    expect(run('final')).toEqual(['Lucario']);
  });
  it('reports syntax errors instead of silently matching nothing', () => {
    expect(compileSearch('fire,,water').errors.length).toBeGreaterThan(0);
    expect(compileSearch('fire&').errors.length).toBeGreaterThan(0);
    expect(compileSearch('!').errors.length).toBeGreaterThan(0);
    expect(compileSearch('cp12-34-56').warnings.length).toBeGreaterThan(0);
    expect(compileSearch('').empty).toBe(true);
  });
});

describe('screenshot extraction (OCR text parsing)', () => {
  const lines = ['CP 842', 'Lucario', '120/120 HP', 'Counter', 'Aura Sphere', 'Flash Cannon', 'POWER UP'];
  it('reads CP, HP, species and moves from detail-screen text', () => {
    const ex = parseOcrText(ref, lines);
    expect(ex.cp).toBe(842);
    expect(ex.hp).toBe(120);
    expect(ex.speciesName).toBe('Lucario');
    expect(ex.fastMove).toBe('Counter');
    expect(ex.chargedMove1).toBe('Aura Sphere');
    expect(ex.chargedMove2).toBe('Flash Cannon');
    expect(ex.ivs).toBeNull();
    expect(ex.notes.join(' ')).toContain('IVs are shown as bars');
  });
  it('reads IV triples printed by overlay apps and marks them uncertain', () => {
    const ex = parseOcrText(ref, [...lines, '15/14/13']);
    expect(ex.ivs).toEqual({ atk: 15, def: 14, sta: 13 });
    const review = extractedToReview(ref, ex, 'ocr');
    expect(review.fieldStatus.ivs).toBe('uncertain');
    expect(review.fieldStatus.cp).toBe('confident');
    expect(review.draft.speciesId).toBe(448);
    expect(review.warnings.join(' ')).toContain('Shiny, Shadow');
  });
  it('does not invent values when text is unreadable', () => {
    const ex = parseOcrText(ref, ['@@@', '12']);
    expect(ex.cp).toBeNull();
    expect(ex.speciesName).toBeNull();
    const review = extractedToReview(ref, ex, 'ocr');
    expect(review.draft.speciesId).toBe(0);
    expect(review.fieldStatus.speciesName).toBe('missing');
  });
  it('narrows IVs from appraisal wording + CP/HP only when the solution is unique', () => {
    const lucario = ref.getSpecies(448)!;
    const cp = calcCp(lucario.stats, { atk: 15, def: 15, sta: 15 }, ref.cpm.get(30));
    const hp = calcHp(lucario.stats.sta, 15, ref.cpm.get(30));
    const ex = parseOcrText(ref, ['Lucario', `CP ${cp}`, `${hp}/${hp} HP`, 'Overall, Lucario is a wonder! What a breathtaking Pokémon!']);
    expect(ex.ivTotalRange).toEqual({ min: 37, max: 45 });
    const r = extractedToReview(ref, ex, 'ocr');
    // either uniquely solved (flagged uncertain) or left unknown with a warning — never silently guessed
    if (r.draft.ivs) expect(r.fieldStatus.ivs).toBe('uncertain');
    else expect(r.warnings.join(' ')).toMatch(/possible IV|appraisal/);
  });
});
