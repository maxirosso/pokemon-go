import { useQuery } from '@tanstack/react-query';
import { getSpeciesInfo, type SpeciesInfo } from '@/services/api/pokeapi';
import { getDb } from '@/services/database/db';

/** PokéAPI species info (descriptions, genus, form ids). Cached in SQLite; null when offline & uncached. */
export function useSpeciesInfo(speciesId: number | null | undefined, enabled = true) {
  return useQuery<SpeciesInfo | null>({
    queryKey: ['species-info', speciesId],
    enabled: enabled && !!speciesId,
    staleTime: Infinity,
    gcTime: 24 * 3600 * 1000,
    queryFn: async () => (speciesId ? getSpeciesInfo(await getDb(), speciesId) : null),
  });
}
