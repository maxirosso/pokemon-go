import { findLevelsForCp } from '../combat/cp';
import { normalizeName, type ReferenceData } from '../reference/referenceData';
import type { IVs, OwnedPokemon } from '../types';
import { parseCsv } from './csv';

export type NewPokemon = Omit<OwnedPokemon, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'importBatchId' | 'source'>;

export interface RejectedRow {
  line: number;
  reason: string;
  raw?: string;
}

export interface ImportResult {
  accepted: NewPokemon[];
  rejected: RejectedRow[];
  warnings: string[];
}

export const EMPTY_POKEMON: NewPokemon = {
  speciesId: 0,
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
};

const HEADER_ALIASES: Record<string, string> = {
  name: 'species',
  species: 'species',
  speciesname: 'species',
  pokemon: 'species',
  pokemonname: 'species',
  pokemonnumber: 'dex',
  dex: 'dex',
  dexnumber: 'dex',
  pokedex: 'dex',
  pokedexnumber: 'dex',
  number: 'dex',
  speciesid: 'dex',
  form: 'form',
  nickname: 'nickname',
  nick: 'nickname',
  cp: 'cp',
  combatpower: 'cp',
  hp: 'hp',
  atkiv: 'atk',
  attackiv: 'atk',
  ivatk: 'atk',
  ivattack: 'atk',
  attack: 'atk',
  atk: 'atk',
  defiv: 'def',
  defenseiv: 'def',
  ivdef: 'def',
  ivdefense: 'def',
  defense: 'def',
  def: 'def',
  staiv: 'sta',
  staminaiv: 'sta',
  hpiv: 'sta',
  ivsta: 'sta',
  ivstamina: 'sta',
  ivhp: 'sta',
  stamina: 'sta',
  sta: 'sta',
  level: 'level',
  lvl: 'level',
  levelmin: 'levelMin',
  levelmax: 'levelMax',
  fastmove: 'fast',
  quickmove: 'fast',
  fast: 'fast',
  move1: 'fast',
  chargedmove: 'charged1',
  chargemove: 'charged1',
  charged: 'charged1',
  chargedmove1: 'charged1',
  chargemove1: 'charged1',
  move2: 'charged1',
  chargedmove2: 'charged2',
  chargemove2: 'charged2',
  move3: 'charged2',
  shiny: 'shiny',
  shadow: 'shadow',
  purified: 'purified',
  shadowpurified: 'shadowPurified',
  lucky: 'lucky',
  favorite: 'favorite',
  favourite: 'favorite',
  gender: 'gender',
  catchdate: 'date',
  datecaught: 'date',
  caught: 'date',
  acquired: 'date',
  notes: 'notes',
  note: 'notes',
  tags: 'tags',
  tag: 'tags',
};

const FORM_ALIASES: Record<string, string> = {
  normal: 'Normal',
  '': 'Normal',
  alolan: 'Alola',
  alola: 'Alola',
  galarian: 'Galarian',
  galar: 'Galarian',
  hisuian: 'Hisuian',
  hisui: 'Hisuian',
  paldean: 'Paldea',
  paldea: 'Paldea',
};

const truthy = (v: unknown): boolean => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'x', 'shiny', 'shadow', 'purified', 'lucky', 'favorite', '✓', '*'].includes(s);
};

const intOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : Number.NaN;
};

function normalizeKey(k: string) {
  return k.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Map one loosely-typed record (CSV row / JSON object) to a validated NewPokemon, or explain why not. */
export function mapRecord(
  ref: ReferenceData,
  raw: Record<string, unknown>,
  line: number,
): { ok: true; value: NewPokemon; warnings: string[] } | { ok: false; reject: RejectedRow } {
  const rec: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const alias = HEADER_ALIASES[normalizeKey(k)];
    if (alias && rec[alias] === undefined) rec[alias] = v;
    else if (!alias) rec[normalizeKey(k)] = v;
  }
  const warnings: string[] = [];
  const reject = (reason: string): { ok: false; reject: RejectedRow } => ({
    ok: false,
    reject: { line, reason, raw: JSON.stringify(raw).slice(0, 160) },
  });

  // species
  let speciesId: number | undefined;
  const dexRaw = intOrNull(rec.dex);
  if (dexRaw !== null && !Number.isNaN(dexRaw)) speciesId = dexRaw;
  const nameRaw = typeof rec.species === 'string' ? rec.species.trim() : '';
  if (nameRaw) {
    const byName = ref.findSpeciesIdByName(nameRaw);
    if (byName !== undefined) {
      if (speciesId !== undefined && speciesId !== byName) warnings.push(`Line ${line}: dex number ${speciesId} and name "${nameRaw}" disagree — using the name.`);
      speciesId = byName;
    } else if (speciesId === undefined) return reject(`Unknown species "${nameRaw}".`);
  }
  if (speciesId === undefined) return reject('No species name or Pokédex number.');
  if (ref.formsOf(speciesId).length === 0) return reject(`Species #${speciesId} is not in the Pokémon GO dataset.`);

  // form
  const formRaw = String(rec.form ?? '').trim();
  let form = FORM_ALIASES[formRaw.toLowerCase()];
  if (form === undefined) {
    const match = ref.formsOf(speciesId).find((f) => normalizeName(f.form) === normalizeName(formRaw));
    form = match?.form ?? 'Normal';
    if (!match && formRaw) warnings.push(`Line ${line}: form "${formRaw}" not recognised, using Normal.`);
  }
  if (!ref.getByKey(`${speciesId}:${form}`)) form = 'Normal';

  // numbers
  const cp = intOrNull(rec.cp);
  const hp = intOrNull(rec.hp);
  if (Number.isNaN(cp) || (cp !== null && (cp < 10 || cp > 99999))) return reject(`Invalid CP "${String(rec.cp)}".`);
  if (Number.isNaN(hp) || (hp !== null && (hp < 1 || hp > 9999))) return reject(`Invalid HP "${String(rec.hp)}".`);

  let level = intOrNull(rec.level);
  if (level === null) {
    const lo = intOrNull(rec.levelMin);
    const hi = intOrNull(rec.levelMax);
    if (lo !== null && hi !== null && lo === hi) level = lo;
    else if (lo !== null && hi !== null && lo !== hi) warnings.push(`Line ${line}: level range ${lo}–${hi} ignored (not a single level).`);
  }
  if (level !== null && (Number.isNaN(level) || level < 1 || level > 51 || level * 2 !== Math.round(level * 2)))
    return reject(`Invalid level "${String(rec.level)}" (must be 1–51 in 0.5 steps).`);

  // IVs: all or nothing
  const a = intOrNull(rec.atk);
  const d = intOrNull(rec.def);
  const s = intOrNull(rec.sta);
  let ivs: IVs | null = null;
  const given = [a, d, s].filter((x) => x !== null);
  if (given.length === 3) {
    if ([a, d, s].some((x) => x === null || Number.isNaN(x) || (x as number) < 0 || (x as number) > 15 || !Number.isInteger(x)))
      return reject('IVs must be whole numbers between 0 and 15.');
    ivs = { atk: a as number, def: d as number, sta: s as number };
  } else if (given.length > 0) {
    warnings.push(`Line ${line}: only some IVs were given — all three are required, so IVs were left unknown.`);
  }

  // consistency check (warning only)
  const species = ref.getByKey(`${speciesId}:${form}`);
  if (species && ivs && cp !== null && level === null) {
    const levels = findLevelsForCp(ref.cpm, species.stats, ivs, cp, hp);
    if (levels.length === 0) warnings.push(`Line ${line}: CP ${cp} is impossible for these IVs — please check the row.`);
    else if (levels.length === 1) level = levels[0];
  }

  // moves — keep exact provider names when we can resolve them
  const resolveFast = (v: unknown) => {
    const n = String(v ?? '').trim();
    if (!n) return null;
    const m = ref.allFastMoves().find((x) => normalizeName(x.name) === normalizeName(n));
    if (!m) warnings.push(`Line ${line}: fast move "${n}" not recognised.`);
    return m?.name ?? null;
  };
  const resolveCharged = (v: unknown) => {
    const n = String(v ?? '').trim();
    if (!n) return null;
    const m = ref.allChargedMoves().find((x) => normalizeName(x.name) === normalizeName(n));
    if (!m) warnings.push(`Line ${line}: charged move "${n}" not recognised.`);
    return m?.name ?? null;
  };

  const sp = String(rec.shadowPurified ?? '').trim().toLowerCase();
  const genderRaw = String(rec.gender ?? '').trim().toLowerCase();
  const gender: NewPokemon['gender'] = ['male', 'm', '♂'].includes(genderRaw) ? 'male' : ['female', 'f', '♀'].includes(genderRaw) ? 'female' : 'unknown';
  const dateRaw = String(rec.date ?? '').trim();
  let dateCaught: string | null = null;
  if (dateRaw) {
    const t = Date.parse(dateRaw);
    if (Number.isNaN(t)) warnings.push(`Line ${line}: date "${dateRaw}" not recognised.`);
    else dateCaught = new Date(t).toISOString();
  }
  const tags = String(rec.tags ?? '')
    .split(/[;|]/)
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    ok: true,
    warnings,
    value: {
      ...EMPTY_POKEMON,
      speciesId,
      form,
      nickname: typeof rec.nickname === 'string' && rec.nickname.trim() ? rec.nickname.trim() : null,
      cp,
      hp,
      level,
      ivs,
      fastMove: resolveFast(rec.fast),
      chargedMove1: resolveCharged(rec.charged1),
      chargedMove2: resolveCharged(rec.charged2),
      shiny: truthy(rec.shiny),
      shadow: truthy(rec.shadow) || sp === 'shadow',
      purified: truthy(rec.purified) || sp === 'purified',
      lucky: truthy(rec.lucky),
      favorite: truthy(rec.favorite),
      gender,
      notes: typeof rec.notes === 'string' && rec.notes.trim() ? rec.notes.trim() : null,
      dateCaught,
      tags,
    },
  };
}

export function importCsv(ref: ReferenceData, text: string): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { accepted: [], rejected: [{ line: 1, reason: 'The file has no data rows.' }], warnings: [] };
  const header = rows[0];
  const known = header.filter((h) => HEADER_ALIASES[normalizeKey(h)]).length;
  if (known === 0)
    return {
      accepted: [],
      rejected: [{ line: 1, reason: 'No recognised column headers (expected e.g. Name, CP, Atk IV, Def IV, Sta IV).' }],
      warnings: [],
    };
  const result: ImportResult = { accepted: [], rejected: [], warnings: [] };
  for (let i = 1; i < rows.length; i += 1) {
    const rec: Record<string, unknown> = {};
    header.forEach((h, c) => {
      rec[h] = rows[i][c] ?? '';
    });
    const m = mapRecord(ref, rec, i + 1);
    if (m.ok) {
      result.accepted.push(m.value);
      result.warnings.push(...m.warnings);
    } else result.rejected.push(m.reject);
  }
  return result;
}

export function importJsonPokemon(ref: ReferenceData, text: string): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { accepted: [], rejected: [{ line: 1, reason: 'The file is not valid JSON.' }], warnings: [] };
  }
  const list = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && Array.isArray((json as { pokemon?: unknown }).pokemon)
      ? ((json as { pokemon: unknown[] }).pokemon)
      : null;
  if (!list) return { accepted: [], rejected: [{ line: 1, reason: 'Expected a JSON array of Pokémon (or an object with a "pokemon" array).' }], warnings: [] };
  const result: ImportResult = { accepted: [], rejected: [], warnings: [] };
  list.forEach((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      result.rejected.push({ line: i + 1, reason: 'Entry is not an object.' });
      return;
    }
    const o = item as Record<string, unknown>;
    // Accept our own export shape (nested ivs / speciesId / chargedMove1…) as well as flat CSV-like objects.
    const flat: Record<string, unknown> = { ...o };
    if (o.ivs && typeof o.ivs === 'object') {
      const iv = o.ivs as Record<string, unknown>;
      flat.atk = iv.atk;
      flat.def = iv.def;
      flat.sta = iv.sta;
    }
    if (o.speciesId !== undefined) flat.dex = o.speciesId;
    if (o.chargedMove1 !== undefined) flat.charged1 = o.chargedMove1;
    if (o.chargedMove2 !== undefined) flat.charged2 = o.chargedMove2;
    if (o.fastMove !== undefined) flat.fast = o.fastMove;
    if (Array.isArray(o.tags)) flat.tags = o.tags.join(';');
    const m = mapRecord(ref, flat, i + 1);
    if (m.ok) {
      result.accepted.push(m.value);
      result.warnings.push(...m.warnings);
    } else result.rejected.push(m.reject);
  });
  return result;
}

/** Identity used to detect duplicates: two imports of the same Pokémon should collide. */
export function pokemonSignature(p: Pick<NewPokemon, 'speciesId' | 'form' | 'cp' | 'hp' | 'ivs' | 'level' | 'shiny' | 'shadow' | 'purified' | 'nickname' | 'dateCaught'>): string {
  const iv = p.ivs ? `${p.ivs.atk}/${p.ivs.def}/${p.ivs.sta}` : '?';
  return [p.speciesId, p.form, p.cp ?? '?', p.hp ?? '?', iv, p.level ?? '?', p.shiny ? 's' : '', p.shadow ? 'sh' : '', p.purified ? 'pu' : '', p.dateCaught ?? ''].join('|');
}

export function splitDuplicates(
  existing: Pick<OwnedPokemon, 'speciesId' | 'form' | 'cp' | 'hp' | 'ivs' | 'level' | 'shiny' | 'shadow' | 'purified' | 'nickname' | 'dateCaught' | 'deletedAt'>[],
  incoming: NewPokemon[],
): { fresh: NewPokemon[]; duplicates: NewPokemon[] } {
  const seen = new Set(existing.filter((e) => !e.deletedAt).map(pokemonSignature));
  const fresh: NewPokemon[] = [];
  const duplicates: NewPokemon[] = [];
  for (const p of incoming) {
    const sig = pokemonSignature(p);
    // A Pokémon with no identifying numbers at all (species only) is never treated as a duplicate: players can own many.
    const identifying = p.cp !== null || p.ivs !== null || p.level !== null || p.dateCaught !== null;
    if (identifying && seen.has(sig)) duplicates.push(p);
    else {
      fresh.push(p);
      if (identifying) seen.add(sig);
    }
  }
  return { fresh, duplicates };
}

export function pokemonToCsvRows(list: OwnedPokemon[]): (string | number | boolean | null)[][] {
  return list.map((p) => [
    p.speciesId,
    p.form,
    p.nickname,
    p.cp,
    p.hp,
    p.level,
    p.ivs?.atk ?? null,
    p.ivs?.def ?? null,
    p.ivs?.sta ?? null,
    p.fastMove,
    p.chargedMove1,
    p.chargedMove2,
    p.shiny,
    p.shadow,
    p.purified,
    p.lucky,
    p.favorite,
    p.gender,
    p.dateCaught,
    p.tags.join(';'),
    p.notes,
  ]);
}

export const CSV_EXPORT_HEADER = [
  'Pokemon Number',
  'Form',
  'Nickname',
  'CP',
  'HP',
  'Level',
  'Atk IV',
  'Def IV',
  'Sta IV',
  'Fast Move',
  'Charged Move',
  'Charged Move 2',
  'Shiny',
  'Shadow',
  'Purified',
  'Lucky',
  'Favorite',
  'Gender',
  'Date Caught',
  'Tags',
  'Notes',
];
