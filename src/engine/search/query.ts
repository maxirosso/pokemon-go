import { ivPercent, ivStars } from '../combat/cp';
import { formLabel, normalizeName } from '../reference/referenceData';
import { POKEMON_TYPES, type GoSpecies, type OwnedPokemon, type PokemonType } from '../types';

/**
 * A practical subset of Pokémon GO-style search expressions. This is NOT full GO search compatibility.
 *
 * Operators:   `&` AND · `,` OR · `!` NOT (prefix)      e.g.  `fire&!shiny, water&4*`
 * Terms:
 *   name / nickname / alias    pikachu · zard · mew2
 *   dex number or range        25 · 1-151
 *   type                       fire · water …
 *   flags                      shiny shadow purified lucky favorite legendary mythical ultrabeast baby
 *   stars                      4* (100%) 3* 2* 1* 0*
 *   CP / HP range              cp1500-  cp-1500  cp1000-1500  hp100-
 *   IV% range                  iv90-  iv100
 *   IV stats                   atk15 def0-2 sta14-15
 *   generation                 gen1 … gen9
 *   tag                        tag:keeper
 *   evolution                  evolve (can evolve) · final
 *   unknown                    ivunknown cpunknown
 */

export interface SearchRecord {
  pokemon: OwnedPokemon;
  species: GoSpecies;
}

export interface CompiledSearch {
  test(r: SearchRecord): boolean;
  /** Human-readable notes about terms that were not understood (treated as free text). */
  warnings: string[];
  /** Hard syntax errors (e.g. empty operand). When non-empty `test` matches everything. */
  errors: string[];
  empty: boolean;
}

const ALIASES: Record<string, number> = {
  zard: 6,
  mew2: 150,
  ttar: 248,
  mgross: 376,
  gross: 376,
  chomp: 445,
  garch: 445,
  hippo: 450,
  ray: 384,
  kyo: 382,
  grou: 383,
  toge: 468,
  exca: 530,
  conk: 534,
  bliss: 242,
  snor: 143,
  mamo: 473,
  gard: 282,
  rhype: 464,
  dnite: 149,
  charzard: 6,
  pika: 25,
};

type Pred = (r: SearchRecord) => boolean;

const TYPE_LOOKUP = new Map<string, PokemonType>(POKEMON_TYPES.map((t) => [t.toLowerCase(), t]));

function parseRange(s: string): { lo: number; hi: number } | null {
  const m = /^(\d+(?:\.\d+)?)?(-)?(\d+(?:\.\d+)?)?$/.exec(s);
  if (!m || (m[1] === undefined && m[3] === undefined)) return null;
  const [, a, dash, b] = m;
  if (!dash) return { lo: Number(a), hi: Number(a) };
  return { lo: a !== undefined ? Number(a) : -Infinity, hi: b !== undefined ? Number(b) : Infinity };
}

const inRange = (v: number | null, r: { lo: number; hi: number }) => v !== null && v >= r.lo && v <= r.hi;

function compileTerm(raw: string, warnings: string[], errors: string[]): Pred | null {
  let term = raw.trim().toLowerCase();
  if (!term) return null;
  let negate = false;
  while (term.startsWith('!')) {
    negate = !negate;
    term = term.slice(1).trim();
  }
  if (!term) {
    errors.push('A "!" must be followed by a term.');
    return null;
  }
  const pred = compileAtom(term, warnings);
  return negate ? (r) => !pred(r) : pred;
}

function compileAtom(term: string, warnings: string[]): Pred {
  // flags
  switch (term) {
    case 'shiny':
      return (r) => r.pokemon.shiny;
    case 'shadow':
      return (r) => r.pokemon.shadow;
    case 'purified':
      return (r) => r.pokemon.purified;
    case 'lucky':
      return (r) => r.pokemon.lucky;
    case 'favorite':
    case 'favourite':
      return (r) => r.pokemon.favorite;
    case 'legendary':
      return (r) => r.species.rarity === 'legendary';
    case 'mythical':
    case 'mythic':
      return (r) => r.species.rarity === 'mythical';
    case 'ultrabeast':
      return (r) => r.species.rarity === 'ultra-beast';
    case 'baby':
      return (r) => r.species.isBaby;
    case 'evolve':
      return (r) => !r.species.isFinalStage;
    case 'final':
      return (r) => r.species.isFinalStage;
    case 'ivunknown':
      return (r) => r.pokemon.ivs === null;
    case 'cpunknown':
      return (r) => r.pokemon.cp === null;
    default:
      break;
  }
  // stars
  const stars = /^([0-4])\*$/.exec(term);
  if (stars) {
    const n = Number(stars[1]);
    return (r) => (r.pokemon.ivs ? ivStars(r.pokemon.ivs) === n : false);
  }
  // types
  const t = TYPE_LOOKUP.get(term);
  if (t) return (r) => r.species.types.includes(t);
  // generation
  const gen = /^gen(\d)$/.exec(term);
  if (gen) return (r) => r.species.generation === Number(gen[1]);
  // tag
  if (term.startsWith('tag:')) {
    const tag = term.slice(4);
    return (r) => r.pokemon.tags.some((x) => x.toLowerCase() === tag);
  }
  // numeric families
  const numeric = /^(cp|hp|iv|atk|def|sta)([\d.\-]+)$/.exec(term);
  if (numeric) {
    const range = parseRange(numeric[2]);
    if (!range) {
      warnings.push(`Could not read the range in "${term}".`);
      return () => true;
    }
    switch (numeric[1]) {
      case 'cp':
        return (r) => inRange(r.pokemon.cp, range);
      case 'hp':
        return (r) => inRange(r.pokemon.hp, range);
      case 'iv':
        return (r) => (r.pokemon.ivs ? inRange(ivPercent(r.pokemon.ivs), range) : false);
      case 'atk':
        return (r) => (r.pokemon.ivs ? inRange(r.pokemon.ivs.atk, range) : false);
      case 'def':
        return (r) => (r.pokemon.ivs ? inRange(r.pokemon.ivs.def, range) : false);
      default:
        return (r) => (r.pokemon.ivs ? inRange(r.pokemon.ivs.sta, range) : false);
    }
  }
  // dex number / range
  const dex = /^[\d]+(-[\d]*)?$|^-\d+$/.exec(term);
  if (dex) {
    const range = parseRange(term);
    if (range) return (r) => inRange(r.species.speciesId, range);
  }
  // alias
  const alias = ALIASES[term];
  if (alias) return (r) => r.species.speciesId === alias;
  // free text: species name, form label, nickname
  const norm = normalizeName(term);
  if (!norm) {
    warnings.push(`Ignored "${term}".`);
    return () => true;
  }
  return (r) =>
    normalizeName(r.species.name).includes(norm) ||
    (r.pokemon.nickname ? normalizeName(r.pokemon.nickname).includes(norm) : false) ||
    (formLabel(r.species.form) !== '' && normalizeName(formLabel(r.species.form)).includes(norm));
}

export function compileSearch(expr: string): CompiledSearch {
  const warnings: string[] = [];
  const errors: string[] = [];
  const trimmed = expr.trim();
  if (!trimmed) return { test: () => true, warnings, errors, empty: true };

  const orGroups = trimmed.split(',').map((g) => g.trim());
  const compiled: Pred[][] = [];
  for (const group of orGroups) {
    if (!group) {
      errors.push('Empty option between commas.');
      continue;
    }
    const terms = group.split('&').map((t) => t.trim());
    const preds: Pred[] = [];
    for (const t of terms) {
      if (!t) {
        errors.push('Empty term next to "&".');
        continue;
      }
      const p = compileTerm(t, warnings, errors);
      if (p) preds.push(p);
    }
    compiled.push(preds);
  }
  if (errors.length) return { test: () => true, warnings, errors, empty: false };
  return {
    test: (r) => compiled.some((all) => all.every((p) => p(r))),
    warnings,
    errors,
    empty: false,
  };
}
