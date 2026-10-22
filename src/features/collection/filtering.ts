import { ivPercent, ivStars } from '@/engine/combat/cp';
import type { ReferenceData } from '@/engine/reference/referenceData';
import type { Verdict, VerdictAction } from '@/engine/recommendations/types';
import { compileSearch } from '@/engine/search/query';
import type { GoSpecies, OwnedPokemon, PokemonType } from '@/engine/types';

export type Tri = boolean | null; // null = don't care

export interface CollectionFilters {
  query: string;
  types: PokemonType[];
  generations: number[];
  cp: { min: number | null; max: number | null };
  ivPercent: { min: number | null; max: number | null };
  stars: number[];
  atkIvMin: number | null;
  defIvMin: number | null;
  staIvMin: number | null;
  stages: ('base' | 'middle' | 'final')[];
  legendary: Tri;
  mythical: Tri;
  ultraBeast: Tri;
  shiny: Tri;
  shadow: Tri;
  purified: Tri;
  lucky: Tri;
  favorite: Tri;
  megaEligible: Tri;
  dynamax: Tri;
  /** null = any; true = IVs known; false = IVs unknown (needs appraisal). */
  ivsKnown: Tri;
  pvpSuitable: 'great' | 'ultra' | 'master' | null;
  raidSuitable: Tri;
  maxPriority: number | null;
  verdicts: VerdictAction[];
  tags: string[];
  evolutionAffordable: Tri;
  powerUpAffordable: Tri;
}

export const EMPTY_FILTERS: CollectionFilters = {
  query: '',
  types: [],
  generations: [],
  cp: { min: null, max: null },
  ivPercent: { min: null, max: null },
  stars: [],
  atkIvMin: null,
  defIvMin: null,
  staIvMin: null,
  stages: [],
  legendary: null,
  mythical: null,
  ultraBeast: null,
  shiny: null,
  shadow: null,
  purified: null,
  lucky: null,
  favorite: null,
  megaEligible: null,
  dynamax: null,
  ivsKnown: null,
  pvpSuitable: null,
  raidSuitable: null,
  maxPriority: null,
  verdicts: [],
  tags: [],
  evolutionAffordable: null,
  powerUpAffordable: null,
};

export type SortKey =
  | 'cp-desc'
  | 'cp-asc'
  | 'iv-desc'
  | 'iv-asc'
  | 'potential'
  | 'raid'
  | 'pvp'
  | 'investment'
  | 'evolution'
  | 'recent'
  | 'dex'
  | 'alpha';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'investment', label: 'Investment value' },
  { key: 'cp-desc', label: 'Highest CP' },
  { key: 'cp-asc', label: 'Lowest CP' },
  { key: 'iv-desc', label: 'Highest IV' },
  { key: 'iv-asc', label: 'Lowest IV' },
  { key: 'potential', label: 'Highest potential' },
  { key: 'raid', label: 'Raid usefulness' },
  { key: 'pvp', label: 'PvP usefulness' },
  { key: 'evolution', label: 'Evolution opportunities' },
  { key: 'recent', label: 'Recently added' },
  { key: 'dex', label: 'Pokédex order' },
  { key: 'alpha', label: 'Alphabetical' },
];

/** Pre-computed per-Pokémon numbers from the recommendation engine (null while analysis is running). */
export interface ScoreInfo {
  raid: number | null;
  great: number | null;
  ultra: number | null;
  master: number | null;
  potential: number | null;
  verdict: Verdict | null;
}

const tri = (want: Tri, actual: boolean) => want === null || want === actual;

export function activeFilterCount(f: CollectionFilters): number {
  let n = 0;
  n += f.types.length ? 1 : 0;
  n += f.generations.length ? 1 : 0;
  n += f.cp.min !== null || f.cp.max !== null ? 1 : 0;
  n += f.ivPercent.min !== null || f.ivPercent.max !== null ? 1 : 0;
  n += f.stars.length ? 1 : 0;
  n += [f.atkIvMin, f.defIvMin, f.staIvMin].filter((x) => x !== null).length;
  n += f.stages.length ? 1 : 0;
  for (const k of ['legendary', 'mythical', 'ultraBeast', 'shiny', 'shadow', 'purified', 'lucky', 'favorite', 'megaEligible', 'dynamax', 'ivsKnown', 'raidSuitable', 'evolutionAffordable', 'powerUpAffordable'] as const) {
    if (f[k] !== null) n += 1;
  }
  n += f.pvpSuitable ? 1 : 0;
  n += f.maxPriority !== null ? 1 : 0;
  n += f.verdicts.length ? 1 : 0;
  n += f.tags.length ? 1 : 0;
  return n;
}

export interface ApplyResult {
  list: OwnedPokemon[];
  warnings: string[];
  errors: string[];
}

export function applyFilters(
  all: OwnedPokemon[],
  ref: ReferenceData,
  f: CollectionFilters,
  scores: Map<string, ScoreInfo> | null,
): ApplyResult {
  const search = compileSearch(f.query);
  const out: OwnedPokemon[] = [];
  for (const p of all) {
    const s = ref.getSpecies(p.speciesId, p.form);
    if (!s) continue;
    if (!search.empty && !search.test({ pokemon: p, species: s })) continue;
    if (f.types.length && !f.types.some((t) => s.types.includes(t))) continue;
    if (f.generations.length && !f.generations.includes(s.generation)) continue;
    if (f.cp.min !== null && (p.cp === null || p.cp < f.cp.min)) continue;
    if (f.cp.max !== null && (p.cp === null || p.cp > f.cp.max)) continue;
    const iv = p.ivs ? ivPercent(p.ivs) : null;
    if (f.ivPercent.min !== null && (iv === null || iv < f.ivPercent.min)) continue;
    if (f.ivPercent.max !== null && (iv === null || iv > f.ivPercent.max)) continue;
    if (f.stars.length && (!p.ivs || !f.stars.includes(ivStars(p.ivs)))) continue;
    if (f.atkIvMin !== null && (!p.ivs || p.ivs.atk < f.atkIvMin)) continue;
    if (f.defIvMin !== null && (!p.ivs || p.ivs.def < f.defIvMin)) continue;
    if (f.staIvMin !== null && (!p.ivs || p.ivs.sta < f.staIvMin)) continue;
    if (f.stages.length) {
      const stage: 'base' | 'middle' | 'final' = s.stage === 0 ? 'base' : s.isFinalStage ? 'final' : 'middle';
      if (!f.stages.includes(stage)) continue;
    }
    if (!tri(f.legendary, s.rarity === 'legendary')) continue;
    if (!tri(f.mythical, s.rarity === 'mythical')) continue;
    if (!tri(f.ultraBeast, s.rarity === 'ultra-beast')) continue;
    if (!tri(f.shiny, p.shiny)) continue;
    if (!tri(f.shadow, p.shadow)) continue;
    if (!tri(f.purified, p.purified)) continue;
    if (!tri(f.lucky, p.lucky)) continue;
    if (!tri(f.favorite, p.favorite)) continue;
    if (!tri(f.megaEligible, ref.megaFormsOf(p.speciesId).length > 0)) continue;
    if (!tri(f.dynamax, p.dynamaxEligible)) continue;
    if (!tri(f.ivsKnown, p.ivs !== null)) continue;
    if (f.tags.length && !f.tags.some((t) => p.tags.includes(t))) continue;
    const sc = scores?.get(p.id) ?? null;
    if (f.pvpSuitable) {
      const v = sc?.[f.pvpSuitable] ?? null;
      if (v === null || v < 60) continue;
    }
    if (f.raidSuitable !== null) {
      const ok = (sc?.raid ?? -1) >= 70;
      if (f.raidSuitable !== ok) continue;
    }
    if (f.maxPriority !== null && (!sc?.verdict || sc.verdict.impact <= 0 || sc.verdict.priority > f.maxPriority)) continue;
    if (f.verdicts.length && (!sc?.verdict || !f.verdicts.includes(sc.verdict.action))) continue;
    if (f.evolutionAffordable !== null) {
      const ok = sc?.verdict?.action === 'EVOLVE' && sc.verdict.affordable === true;
      if (f.evolutionAffordable !== ok) continue;
    }
    if (f.powerUpAffordable !== null) {
      const ok = (sc?.verdict?.action === 'POWER_UP' || sc?.verdict?.action === 'SAVE_FOR_PVP') && sc.verdict.affordable === true;
      if (f.powerUpAffordable !== ok) continue;
    }
    out.push(p);
  }
  return { list: out, warnings: search.warnings, errors: search.errors };
}

const nullLast = (v: number | null, dir: 1 | -1) => (v === null ? (dir === 1 ? Infinity : -Infinity) : v);

export function sortPokemon(
  list: OwnedPokemon[],
  ref: ReferenceData,
  key: SortKey,
  scores: Map<string, ScoreInfo> | null,
): OwnedPokemon[] {
  const arr = [...list];
  const sp = (p: OwnedPokemon): GoSpecies | undefined => ref.getSpecies(p.speciesId, p.form);
  const iv = (p: OwnedPokemon) => (p.ivs ? ivPercent(p.ivs) : null);
  const best = (p: OwnedPokemon, ks: ('raid' | 'great' | 'ultra' | 'master')[]) => {
    const sc = scores?.get(p.id);
    if (!sc) return null;
    const vals = ks.map((k) => sc[k]).filter((v): v is number => v !== null);
    return vals.length ? Math.max(...vals) : null;
  };
  const by = (f: (p: OwnedPokemon) => number | null, dir: 1 | -1) =>
    arr.sort((a, b) => {
      const x = f(a);
      const y = f(b);
      // unknown values always sink to the bottom regardless of direction
      const ax = x === null ? null : x * dir;
      const ay = y === null ? null : y * dir;
      if (ax === null && ay === null) return 0;
      if (ax === null) return 1;
      if (ay === null) return -1;
      return ay - ax;
    });
  switch (key) {
    case 'cp-desc':
      return by((p) => p.cp, 1);
    case 'cp-asc':
      return by((p) => p.cp, -1);
    case 'iv-desc':
      return by(iv, 1);
    case 'iv-asc':
      return by(iv, -1);
    case 'potential':
      return by((p) => scores?.get(p.id)?.potential ?? null, 1);
    case 'raid':
      return by((p) => best(p, ['raid']), 1);
    case 'pvp':
      return by((p) => best(p, ['great', 'ultra', 'master']), 1);
    case 'investment':
      return by((p) => {
        const v = scores?.get(p.id)?.verdict;
        return v ? v.impact : null;
      }, 1);
    case 'evolution':
      return by((p) => {
        const v = scores?.get(p.id)?.verdict;
        return v?.action === 'EVOLVE' ? v.impact : v ? 0 : null;
      }, 1);
    case 'recent':
      return arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    case 'dex':
      return arr.sort((a, b) => a.speciesId - b.speciesId || (b.cp ?? 0) - (a.cp ?? 0));
    case 'alpha':
      return arr.sort((a, b) => (sp(a)?.name ?? '').localeCompare(sp(b)?.name ?? '') || (b.cp ?? 0) - (a.cp ?? 0));
    default:
      return arr;
  }
}

export { nullLast };
