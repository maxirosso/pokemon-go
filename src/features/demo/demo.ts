import { calcCp, calcHp } from '@/engine/combat/cp';
import { EMPTY_POKEMON, type NewPokemon } from '@/engine/io/importers';
import type { ReferenceData } from '@/engine/reference/referenceData';
import type { IVs } from '@/engine/types';

/** Tag + source marking demo data everywhere in the UI so it is never mistaken for the user's own Pokémon. */
export const DEMO_TAG = 'demo';

interface DemoSeed {
  id: number;
  form?: string;
  ivs: IVs;
  level: number;
  fast?: string;
  charged?: string;
  charged2?: string;
  shadow?: boolean;
  shiny?: boolean;
  favorite?: boolean;
}

const SEEDS: DemoSeed[] = [
  { id: 448, ivs: { atk: 15, def: 15, sta: 15 }, level: 30, fast: 'Counter', charged: 'Aura Sphere', charged2: 'Shadow Ball', favorite: true },
  { id: 4, ivs: { atk: 15, def: 15, sta: 15 }, level: 20 },
  { id: 64, ivs: { atk: 15, def: 15, sta: 15 }, level: 25 },
  { id: 184, ivs: { atk: 0, def: 15, sta: 15 }, level: 22, fast: 'Bubble', charged: 'Ice Beam', charged2: 'Play Rough' },
  { id: 376, ivs: { atk: 8, def: 9, sta: 10 }, level: 35, fast: 'Bullet Punch', charged: 'Meteor Mash' },
  { id: 150, ivs: { atk: 14, def: 13, sta: 13 }, level: 40, fast: 'Confusion', charged: 'Psystrike', favorite: true },
  { id: 16, ivs: { atk: 15, def: 15, sta: 15 }, level: 10 },
  { id: 94, ivs: { atk: 12, def: 14, sta: 15 }, level: 30, fast: 'Shadow Claw', charged: 'Shadow Ball', charged2: 'Sludge Bomb', shadow: true },
  { id: 445, ivs: { atk: 10, def: 13, sta: 12 }, level: 35, fast: 'Dragon Tail', charged: 'Outrage', charged2: 'Earth Power' },
  { id: 68, ivs: { atk: 13, def: 10, sta: 12 }, level: 32, fast: 'Counter', charged: 'Dynamic Punch' },
  { id: 130, ivs: { atk: 11, def: 12, sta: 14 }, level: 30, fast: 'Dragon Breath', charged: 'Hydro Pump' },
  { id: 248, ivs: { atk: 9, def: 11, sta: 12 }, level: 34, fast: 'Smack Down', charged: 'Stone Edge' },
  { id: 379, ivs: { atk: 5, def: 14, sta: 15 }, level: 24, fast: 'Lock On', charged: 'Flash Cannon', charged2: 'Focus Blast' },
  { id: 149, ivs: { atk: 15, def: 14, sta: 13 }, level: 35, fast: 'Dragon Tail', charged: 'Outrage' },
  { id: 242, ivs: { atk: 6, def: 12, sta: 14 }, level: 28, fast: 'Zen Headbutt', charged: 'Hyper Beam' },
  { id: 25, ivs: { atk: 10, def: 12, sta: 13 }, level: 15, shiny: true },
];

/**
 * A small, clearly-labelled demo collection. CP/HP are computed with the real formulas from the current
 * reference data (never hard-coded) and moves are kept only if they are in the species' real move pool.
 */
export function buildDemoCollection(ref: ReferenceData): NewPokemon[] {
  const out: NewPokemon[] = [];
  for (const s of SEEDS) {
    const species = ref.getSpecies(s.id, s.form ?? 'Normal');
    if (!species) continue;
    const pool = ref.movePool(species.speciesId, species.form);
    const allFast = pool ? [...pool.fast, ...pool.eliteFast] : [];
    const allCharged = pool ? [...pool.charged, ...pool.eliteCharged] : [];
    const fast = s.fast && allFast.includes(s.fast) ? s.fast : null;
    const c1 = s.charged && allCharged.includes(s.charged) ? s.charged : null;
    const c2 = s.charged2 && allCharged.includes(s.charged2) ? s.charged2 : null;
    const cpm = ref.cpm.get(s.level);
    out.push({
      ...EMPTY_POKEMON,
      speciesId: species.speciesId,
      form: species.form,
      cp: calcCp(species.stats, s.ivs, cpm),
      hp: calcHp(species.stats.sta, s.ivs.sta, cpm),
      level: s.level,
      ivs: s.ivs,
      fastMove: fast,
      chargedMove1: c1,
      chargedMove2: c2,
      shadow: !!s.shadow,
      shiny: !!s.shiny,
      favorite: !!s.favorite,
      tags: [DEMO_TAG],
      notes: 'Demo data — safe to delete.',
    });
  }
  return out;
}
