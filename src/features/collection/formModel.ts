import { EMPTY_POKEMON, type NewPokemon } from '@/engine/io/importers';
import type { OwnedPokemon, SizeVariant } from '@/engine/types';

export interface FormState {
  form: string;
  cp: number | null;
  hp: number | null;
  level: number | null;
  /** null = not entered. IVs are only saved when all three are set (never defaulted to 0 or 15). */
  atk: number | null;
  def: number | null;
  sta: number | null;
  fastMove: string | null;
  chargedMove1: string | null;
  chargedMove2: string | null;
  shiny: boolean;
  shadow: boolean;
  purified: boolean;
  lucky: boolean;
  favorite: boolean;
  dynamax: boolean;
  nickname: string;
  gender: 'male' | 'female' | 'unknown';
  size: SizeVariant | null;
  dateCaught: string;
  notes: string;
  tags: string[];
}

export const emptyForm = (form = 'Normal'): FormState => ({
  form,
  cp: null,
  hp: null,
  level: null,
  atk: null,
  def: null,
  sta: null,
  fastMove: null,
  chargedMove1: null,
  chargedMove2: null,
  shiny: false,
  shadow: false,
  purified: false,
  lucky: false,
  favorite: false,
  dynamax: false,
  nickname: '',
  gender: 'unknown',
  size: null,
  dateCaught: '',
  notes: '',
  tags: [],
});

export function formFromPokemon(p: OwnedPokemon): FormState {
  return {
    form: p.form,
    cp: p.cp,
    hp: p.hp,
    level: p.level,
    atk: p.ivs?.atk ?? null,
    def: p.ivs?.def ?? null,
    sta: p.ivs?.sta ?? null,
    fastMove: p.fastMove,
    chargedMove1: p.chargedMove1,
    chargedMove2: p.chargedMove2,
    shiny: p.shiny,
    shadow: p.shadow,
    purified: p.purified,
    lucky: p.lucky,
    favorite: p.favorite,
    dynamax: p.dynamaxEligible,
    nickname: p.nickname ?? '',
    gender: p.gender,
    size: p.size,
    dateCaught: p.dateCaught ? p.dateCaught.slice(0, 10) : '',
    notes: p.notes ?? '',
    tags: p.tags,
  };
}

export type FormErrors = Partial<Record<keyof FormState | 'ivs', string>>;

export function buildDraft(speciesId: number, f: FormState): { draft: NewPokemon | null; errors: FormErrors } {
  const errors: FormErrors = {};
  if (f.cp !== null && (f.cp < 10 || f.cp > 99999)) errors.cp = 'CP must be between 10 and 99,999.';
  if (f.hp !== null && (f.hp < 1 || f.hp > 9999)) errors.hp = 'HP must be between 1 and 9,999.';
  if (f.level !== null && (f.level < 1 || f.level > 51 || f.level * 2 !== Math.round(f.level * 2))) errors.level = 'Level must be 1–51 in steps of 0.5.';
  const given = [f.atk, f.def, f.sta].filter((x) => x !== null).length;
  if (given > 0 && given < 3) errors.ivs = 'Set all three IVs, or clear them if unknown.';
  if (f.shadow && f.purified) errors.purified = 'A Pokémon cannot be both Shadow and Purified.';
  const date = f.dateCaught.trim();
  let dateCaught: string | null = null;
  if (date) {
    const t = Date.parse(date);
    if (Number.isNaN(t) || !/^\d{4}-\d{2}-\d{2}/.test(date)) errors.dateCaught = 'Use YYYY-MM-DD.';
    else dateCaught = new Date(t).toISOString();
  }
  if (Object.keys(errors).length) return { draft: null, errors };
  return {
    errors,
    draft: {
      ...EMPTY_POKEMON,
      speciesId,
      form: f.form,
      nickname: f.nickname.trim() || null,
      cp: f.cp,
      hp: f.hp,
      level: f.level,
      ivs: given === 3 ? { atk: f.atk as number, def: f.def as number, sta: f.sta as number } : null,
      fastMove: f.fastMove,
      chargedMove1: f.chargedMove1,
      chargedMove2: f.chargedMove2,
      shiny: f.shiny,
      shadow: f.shadow,
      purified: f.purified,
      lucky: f.lucky,
      favorite: f.favorite,
      gender: f.gender,
      size: f.size,
      notes: f.notes.trim() || null,
      dateCaught,
      dynamaxEligible: f.dynamax,
      tags: f.tags,
    },
  };
}
