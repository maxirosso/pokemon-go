import { z } from 'zod';
import { speciesInfoCacheRepo, type DbLike } from '@/services/database/repositories';
import { fetchJson } from './http';

/**
 * PokéAPI adapter — main-series *species* data only (names, descriptions, artwork, varieties).
 * Combat stats, moves and evolution costs come from the Pokémon GO datasets, never from here:
 * main-series values must not be presented as Pokémon GO values.
 */

export const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const CACHE_MS = 60 * 24 * 3600 * 1000;

const nameLang = z.object({ name: z.string() });

const speciesSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  color: nameLang.nullable().optional(),
  habitat: nameLang.nullable().optional(),
  generation: nameLang.optional(),
  genera: z.array(z.object({ genus: z.string(), language: nameLang })).default([]),
  flavor_text_entries: z.array(z.object({ flavor_text: z.string(), language: nameLang })).default([]),
  names: z.array(z.object({ name: z.string(), language: nameLang })).default([]),
  varieties: z.array(z.object({ is_default: z.boolean(), pokemon: z.object({ name: z.string(), url: z.string() }) })).default([]),
  evolution_chain: z.object({ url: z.string() }).nullable().optional(),
});

export interface SpeciesInfo {
  speciesId: number;
  /** Localised display name when PokéAPI has one for the requested language. */
  names: Record<'en' | 'es', string | null>;
  genus: Record<'en' | 'es', string | null>;
  description: Record<'en' | 'es', string | null>;
  color: string | null;
  habitat: string | null;
  evolutionChainId: number | null;
  varieties: { name: string; pokemonId: number; isDefault: boolean }[];
}

const clean = (s: string) => s.replace(/[\f\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

function pick<T extends { language: { name: string } }>(items: T[], lang: string, get: (t: T) => string): string | null {
  const hit = items.find((i) => i.language.name === lang);
  return hit ? clean(get(hit)) : null;
}

export function normalizeSpecies(raw: z.infer<typeof speciesSchema>): SpeciesInfo {
  const idFromUrl = (u: string) => Number(/\/(\d+)\/?$/.exec(u)?.[1] ?? NaN);
  const chain = raw.evolution_chain ? idFromUrl(raw.evolution_chain.url) : NaN;
  return {
    speciesId: raw.id,
    names: { en: pick(raw.names, 'en', (n) => n.name), es: pick(raw.names, 'es', (n) => n.name) },
    genus: { en: pick(raw.genera, 'en', (g) => g.genus), es: pick(raw.genera, 'es', (g) => g.genus) },
    description: {
      en: pick(raw.flavor_text_entries.slice().reverse(), 'en', (f) => f.flavor_text),
      es: pick(raw.flavor_text_entries.slice().reverse(), 'es', (f) => f.flavor_text),
    },
    color: raw.color?.name ?? null,
    habitat: raw.habitat?.name ?? null,
    evolutionChainId: Number.isNaN(chain) ? null : chain,
    varieties: raw.varieties.map((v) => ({ name: v.pokemon.name, pokemonId: idFromUrl(v.pokemon.url), isDefault: v.is_default })).filter((v) => !Number.isNaN(v.pokemonId)),
  };
}

const infoKey = (id: number) => `species:${id}`;

/** Cached species info; returns null when offline and nothing is cached (callers render without it). */
export async function getSpeciesInfo(db: DbLike, speciesId: number): Promise<SpeciesInfo | null> {
  const cached = await speciesInfoCacheRepo.get(db, infoKey(speciesId));
  if (cached) {
    try {
      const info = JSON.parse(cached.payload) as SpeciesInfo;
      if (Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_MS) return info;
      // stale: try to refresh, fall back to the cached copy if the network fails
      try {
        return await fetchAndStore(db, speciesId);
      } catch {
        return info;
      }
    } catch {
      // corrupt cache → refetch below
    }
  }
  try {
    return await fetchAndStore(db, speciesId);
  } catch {
    return null;
  }
}

async function fetchAndStore(db: DbLike, speciesId: number): Promise<SpeciesInfo> {
  const raw = await fetchJson(`${POKEAPI_BASE}/pokemon-species/${speciesId}`, speciesSchema, { retries: 2, timeoutMs: 15000 });
  const info = normalizeSpecies(raw);
  await speciesInfoCacheRepo.put(db, infoKey(speciesId), JSON.stringify(info));
  return info;
}

const FORM_SUFFIX: Record<string, string> = { Alola: 'alola', Galarian: 'galar', Hisuian: 'hisui', Paldea: 'paldea' };

export function pokeApiIdForForm(speciesId: number, form: string, info: SpeciesInfo | null | undefined): number {
  const suffix = FORM_SUFFIX[form];
  if (!suffix || !info) return speciesId;
  const v = info.varieties.find((x) => x.name.endsWith(`-${suffix}`));
  return v ? v.pokemonId : speciesId;
}

export type ImageKind = 'artwork' | 'sprite';

/** Deterministic image URLs (no API call needed for the default form). */
export function pokemonImageUrl(pokeApiId: number, opts: { shiny?: boolean; kind?: ImageKind } = {}): string {
  const { shiny = false, kind = 'artwork' } = opts;
  if (kind === 'sprite') return `${SPRITES}/${shiny ? 'shiny/' : ''}${pokeApiId}.png`;
  return `${SPRITES}/other/official-artwork/${shiny ? 'shiny/' : ''}${pokeApiId}.png`;
}
