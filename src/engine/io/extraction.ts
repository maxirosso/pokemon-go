import { z } from 'zod';
import { ivTotal, solveIvCandidates } from '../combat/cp';
import { normalizeName, type ReferenceData } from '../reference/referenceData';
import type { IVs } from '../types';
import { EMPTY_POKEMON, type NewPokemon } from './importers';

/**
 * Screenshot extraction pipeline shared by on-device OCR and the optional Gemini vision backend.
 * Both produce an `ExtractedPokemon`; nothing is saved until the user has reviewed every field.
 */

export const extractedSchema = z.object({
  speciesName: z.string().nullable().default(null),
  form: z.string().nullable().default(null),
  nickname: z.string().nullable().default(null),
  cp: z.number().int().min(10).max(99999).nullable().default(null),
  hp: z.number().int().min(1).max(9999).nullable().default(null),
  level: z.number().min(1).max(51).nullable().default(null),
  ivs: z
    .object({ atk: z.number().int().min(0).max(15), def: z.number().int().min(0).max(15), sta: z.number().int().min(0).max(15) })
    .nullable()
    .default(null),
  /** Appraisal-derived IV total bracket (e.g. 37–45) when exact IVs are not readable. */
  ivTotalRange: z.object({ min: z.number().int().min(0).max(45), max: z.number().int().min(0).max(45) }).nullable().default(null),
  fastMove: z.string().nullable().default(null),
  chargedMove1: z.string().nullable().default(null),
  chargedMove2: z.string().nullable().default(null),
  shiny: z.boolean().nullable().default(null),
  shadow: z.boolean().nullable().default(null),
  purified: z.boolean().nullable().default(null),
  lucky: z.boolean().nullable().default(null),
  gender: z.enum(['male', 'female', 'unknown']).nullable().default(null),
  /** Per-field confidence 0–1 (model/OCR self-reported — not guaranteed accurate). */
  confidence: z.record(z.string(), z.number().min(0).max(1)).default({}),
  notes: z.array(z.string()).default([]),
});

export type ExtractedPokemon = z.infer<typeof extractedSchema>;

export type ExtractionBackend = 'ocr' | 'gemini';

export type FieldStatus = 'confident' | 'uncertain' | 'missing';

export interface ReviewField<T> {
  value: T | null;
  status: FieldStatus;
  confidence: number | null;
}

export interface ReviewDraft {
  backend: ExtractionBackend;
  speciesId: number | null;
  form: string;
  draft: NewPokemon;
  fieldStatus: Record<string, FieldStatus>;
  warnings: string[];
}

const CONFIDENT = 0.8;

const OVERALL_PHRASES: { re: RegExp; min: number; max: number }[] = [
  { re: /wonder|breathtaking|stats exceed|incredible|blown away/i, min: 37, max: 45 },
  { re: /certainly caught my attention|impressive|truly strong/i, min: 30, max: 36 },
  { re: /\bdecent\b|above average|pretty decent/i, min: 23, max: 29 },
  { re: /doesn.?t look like much|not likely to make much|not (?:much )?of a difference/i, min: 0, max: 22 },
];

function cleanLines(lines: string[]) {
  return lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/**
 * Parse raw OCR text lines from a Pokémon details / appraisal screenshot.
 * Only values that are actually printed as text can be read. The appraisal *bars* (the actual IV
 * values) are graphics and cannot be OCR'd — unless an IV overlay app printed them — so IVs usually
 * come out empty or as a bracket. The caller must show everything on the editable review screen.
 */
export function parseOcrText(ref: ReferenceData, rawLines: string[]): ExtractedPokemon {
  const lines = cleanLines(rawLines);
  const joined = lines.join('\n');
  const out: ExtractedPokemon = extractedSchema.parse({});
  const conf: Record<string, number> = {};

  const cp = /\b[CG]P\s*[:\-]?\s*(\d{2,5})\b/i.exec(joined);
  if (cp) {
    out.cp = Number(cp[1]);
    conf.cp = 0.9;
  }

  const hp1 = /(\d{1,4})\s*\/\s*(\d{1,4})\s*HP\b/i.exec(joined) ?? /\bHP\s*[:\-]?\s*(\d{1,4})\s*\/\s*(\d{1,4})/i.exec(joined);
  if (hp1) {
    out.hp = Math.max(Number(hp1[1]), Number(hp1[2]));
    conf.hp = 0.85;
  }

  const lvl = /\b(?:LV|LVL|LEVEL|NIVEL)\.?\s*[:\-]?\s*(\d{1,2}(?:\.5)?)\b/i.exec(joined);
  if (lvl && Number(lvl[1]) >= 1 && Number(lvl[1]) <= 51) {
    out.level = Number(lvl[1]);
    conf.level = 0.75;
  }

  // IV triples printed by IV overlay apps: "15/14/15" or "15-14-15"
  const triple = /\b(\d{1,2})\s*[/|\-·]\s*(\d{1,2})\s*[/|\-·]\s*(\d{1,2})\b/.exec(joined);
  if (triple && [triple[1], triple[2], triple[3]].every((n) => Number(n) <= 15)) {
    out.ivs = { atk: Number(triple[1]), def: Number(triple[2]), sta: Number(triple[3]) };
    conf.ivs = 0.6;
  } else {
    const a = /\batk\w*\s*[:=]?\s*(\d{1,2})\b/i.exec(joined);
    const d = /\bdef\w*\s*[:=]?\s*(\d{1,2})\b/i.exec(joined);
    const s = /\b(?:sta\w*|hp)\s*(?:iv)?\s*[:=]\s*(\d{1,2})\b/i.exec(joined);
    if (a && d && s && [a[1], d[1], s[1]].every((n) => Number(n) <= 15)) {
      out.ivs = { atk: Number(a[1]), def: Number(d[1]), sta: Number(s[1]) };
      conf.ivs = 0.6;
    }
  }

  // appraisal wording → IV total bracket
  for (const p of OVERALL_PHRASES) {
    if (p.re.test(joined)) {
      out.ivTotalRange = { min: p.min, max: p.max };
      conf.ivTotalRange = 0.6;
      break;
    }
  }

  // species: longest n-gram (1–3 words) that matches a known species name
  let bestLen = 0;
  for (const line of lines) {
    const words = line.split(/[\s,()]+/).filter(Boolean);
    for (let n = Math.min(3, words.length); n >= 1; n -= 1) {
      for (let i = 0; i + n <= words.length; i += 1) {
        const phrase = words.slice(i, i + n).join(' ');
        const norm = normalizeName(phrase);
        if (norm.length < 3 || norm.length <= bestLen) continue;
        const id = ref.findSpeciesIdByName(phrase);
        if (id !== undefined) {
          const sp = ref.getSpecies(id);
          if (sp) {
            out.speciesName = sp.name;
            bestLen = norm.length;
            conf.speciesName = phrase.length === line.length ? 0.85 : 0.7;
          }
        }
      }
    }
  }

  // moves (exact line match, ignoring case/punctuation)
  const fastNames = new Map(ref.allFastMoves().map((m) => [normalizeName(m.name), m.name]));
  const chargedNames = new Map(ref.allChargedMoves().map((m) => [normalizeName(m.name), m.name]));
  const foundCharged: string[] = [];
  for (const line of lines) {
    const norm = normalizeName(line.replace(/\d+(\.\d+)?/g, ''));
    if (!norm) continue;
    const f = fastNames.get(norm);
    const c = chargedNames.get(norm);
    if (f && !out.fastMove && !c) {
      out.fastMove = f;
      conf.fastMove = 0.8;
    } else if (c && !foundCharged.includes(c)) foundCharged.push(c);
    else if (f && !out.fastMove) {
      out.fastMove = f;
      conf.fastMove = 0.6;
    }
  }
  if (foundCharged[0]) {
    out.chargedMove1 = foundCharged[0];
    conf.chargedMove1 = 0.8;
  }
  if (foundCharged[1]) {
    out.chargedMove2 = foundCharged[1];
    conf.chargedMove2 = 0.8;
  }

  out.confidence = conf;
  if (!out.speciesName) out.notes.push('No species name could be read.');
  if (!out.cp) out.notes.push('CP not found — make sure the top of the Pokémon screen is visible.');
  if (!out.ivs && !out.ivTotalRange) out.notes.push('IVs are shown as bars in-game and cannot be read by OCR. Enter them on the next screen.');
  return out;
}

/** Convert an extraction into an editable draft with per-field certainty; never invents missing values. */
export function extractedToReview(ref: ReferenceData, ex: ExtractedPokemon, backend: ExtractionBackend): ReviewDraft {
  const warnings = [...ex.notes];
  const status: Record<string, FieldStatus> = {};
  const st = (field: string, present: boolean): FieldStatus => {
    if (!present) return 'missing';
    return (ex.confidence[field] ?? 0.5) >= CONFIDENT ? 'confident' : 'uncertain';
  };

  const speciesId = ex.speciesName ? ref.findSpeciesIdByName(ex.speciesName) ?? null : null;
  status.speciesName = st('speciesName', speciesId !== null);
  const species = speciesId !== null ? ref.getSpecies(speciesId, ex.form ?? 'Normal') : undefined;
  const form = species?.form ?? 'Normal';

  let ivs: IVs | null = ex.ivs;
  let level = ex.level;
  status.cp = st('cp', ex.cp !== null);
  status.hp = st('hp', ex.hp !== null);
  status.ivs = st('ivs', ivs !== null);
  status.level = st('level', level !== null);

  // When IVs are only bracketed by the appraisal text, try to narrow with CP/HP; only accept a unique solution.
  if (!ivs && ex.ivTotalRange && species && ex.cp !== null) {
    const cands = solveIvCandidates(ref.cpm, species.stats, ex.cp, ex.hp, {
      minTotal: ex.ivTotalRange.min,
      maxTotal: ex.ivTotalRange.max,
      levels: level !== null ? [level] : undefined,
    });
    if (cands.length === 1) {
      ivs = cands[0].ivs;
      level = level ?? cands[0].level;
      status.ivs = 'uncertain';
      warnings.push('IVs were solved from CP/HP and the appraisal wording — please verify.');
    } else if (cands.length > 1) {
      warnings.push(`CP/HP and the appraisal wording leave ${cands.length} possible IV/level combinations — enter the IVs from the appraisal bars.`);
    } else warnings.push('CP/HP do not match the appraisal wording — double-check the values.');
  }
  if (ivs && species && ex.cp !== null && level === null) {
    const cands = solveIvCandidates(ref.cpm, species.stats, ex.cp, ex.hp, { fixed: ivs });
    if (cands.length === 1) level = cands[0].level;
  }
  if (ivs) {
    const total = ivTotal(ivs);
    if (ex.ivTotalRange && (total < ex.ivTotalRange.min || total > ex.ivTotalRange.max)) {
      warnings.push('The IVs read from the screen contradict the appraisal wording.');
      status.ivs = 'uncertain';
    }
  }

  status.fastMove = st('fastMove', !!ex.fastMove);
  status.chargedMove1 = st('chargedMove1', !!ex.chargedMove1);
  status.chargedMove2 = st('chargedMove2', !!ex.chargedMove2);

  const draft: NewPokemon = {
    ...EMPTY_POKEMON,
    speciesId: speciesId ?? 0,
    form,
    nickname: ex.nickname && normalizeName(ex.nickname) !== normalizeName(ex.speciesName ?? '') ? ex.nickname : null,
    cp: ex.cp,
    hp: ex.hp,
    level,
    ivs,
    fastMove: ex.fastMove,
    chargedMove1: ex.chargedMove1,
    chargedMove2: ex.chargedMove2,
    shiny: ex.shiny === true,
    shadow: ex.shadow === true,
    purified: ex.purified === true,
    lucky: ex.lucky === true,
    gender: ex.gender ?? 'unknown',
  };
  if (backend === 'ocr') warnings.push('Shiny, Shadow, Lucky and Purified status cannot be detected by OCR — set them manually if needed.');
  return { backend, speciesId, form, draft, fieldStatus: status, warnings };
}
