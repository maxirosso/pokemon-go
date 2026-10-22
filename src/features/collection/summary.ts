import { ivTotal } from '@/engine/combat/cp';
import type { ReferenceData } from '@/engine/reference/referenceData';
import type { OwnedPokemon } from '@/engine/types';

export interface CollectionSummary {
  total: number;
  uniqueSpecies: number;
  shiny: number;
  perfect: number;
  legendary: number;
  mythical: number;
  ultraBeast: number;
  shadow: number;
  purified: number;
  lucky: number;
  favorites: number;
  needDetails: number;
  demo: number;
}

export function summarizeCollection(list: OwnedPokemon[], ref: ReferenceData): CollectionSummary {
  const species = new Set<number>();
  const s: CollectionSummary = {
    total: list.length,
    uniqueSpecies: 0,
    shiny: 0,
    perfect: 0,
    legendary: 0,
    mythical: 0,
    ultraBeast: 0,
    shadow: 0,
    purified: 0,
    lucky: 0,
    favorites: 0,
    needDetails: 0,
    demo: 0,
  };
  for (const p of list) {
    species.add(p.speciesId);
    if (p.shiny) s.shiny += 1;
    if (p.ivs && ivTotal(p.ivs) === 45) s.perfect += 1;
    const sp = ref.getSpecies(p.speciesId, p.form);
    if (sp?.rarity === 'legendary') s.legendary += 1;
    if (sp?.rarity === 'mythical') s.mythical += 1;
    if (sp?.rarity === 'ultra-beast') s.ultraBeast += 1;
    if (p.shadow) s.shadow += 1;
    if (p.purified) s.purified += 1;
    if (p.lucky) s.lucky += 1;
    if (p.favorite) s.favorites += 1;
    if (!p.ivs || p.cp === null) s.needDetails += 1;
    if (p.source === 'demo') s.demo += 1;
  }
  s.uniqueSpecies = species.size;
  return s;
}
