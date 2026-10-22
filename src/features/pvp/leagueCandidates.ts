import { resolveKnowledge } from '@/engine/combat/knowledge';
import { powerUpCost, type PowerUpCost } from '@/engine/powerup/powerUp';
import { assessLeague, type LeagueAssessment } from '@/engine/pvp/pvp';
import type { ReferenceData } from '@/engine/reference/referenceData';
import type { GoSpecies, LeagueId, OwnedPokemon } from '@/engine/types';

export interface LeagueRow {
  pokemon: OwnedPokemon;
  species: GoSpecies;
  assessment: LeagueAssessment;
  suitability: number;
  powerUp: PowerUpCost | null;
  currentLevel: number | null;
}

/** Rank the user's Pokémon for one league (works for all four formats, including Little Cup). */
export function leagueRows(ref: ReferenceData, collection: OwnedPokemon[], league: LeagueId, maxLevel: number): LeagueRow[] {
  const rows: LeagueRow[] = [];
  for (const p of collection) {
    const species = ref.getSpecies(p.speciesId, p.form);
    if (!species) continue;
    const k = resolveKnowledge(ref, species, p);
    if (k.candidates.length === 0) continue;
    const a = assessLeague(ref, species, k, league, { shadow: p.shadow, maxLevel });
    if (!a.eligible || !a.reachable || a.suitability === null) continue;
    const target = a.entry?.level ?? null;
    rows.push({
      pokemon: p,
      species,
      assessment: a,
      suitability: a.suitability,
      currentLevel: k.level,
      powerUp: k.level !== null && target !== null && k.level < target ? powerUpCost(ref, k.level, target, p) : null,
    });
  }
  return rows.sort((x, y) => y.suitability - x.suitability);
}
