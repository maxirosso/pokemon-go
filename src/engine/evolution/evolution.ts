import { calcCp, calcHp } from '../combat/cp';
import type { Knowledge } from '../combat/knowledge';
import type { ReferenceData } from '../reference/referenceData';
import type { EvolutionEdge, GoSpecies } from '../types';

export interface EvolutionNode {
  species: GoSpecies;
  /** edges leaving this node */
  children: { edge: EvolutionEdge; node: EvolutionNode }[];
}

/** Full evolution tree for the family that `key` belongs to, rooted at its earliest stage. */
export function buildEvolutionTree(ref: ReferenceData, key: string): EvolutionNode | null {
  let rootKey = key;
  for (let guard = 0; guard < 6; guard += 1) {
    const parent = ref.evolvesFrom(rootKey)[0];
    if (!parent) break;
    rootKey = parent.fromKey;
  }
  const build = (k: string, depth: number): EvolutionNode | null => {
    const species = ref.getByKey(k);
    if (!species) return null;
    const children = depth > 5 ? [] : ref.evolutionsFrom(k).flatMap((edge) => {
      const node = build(edge.toKey, depth + 1);
      return node ? [{ edge, node }] : [];
    });
    return { species, children };
  };
  return build(rootKey, 0);
}

/** Human-readable requirement list for an evolution edge (data-driven; nothing hardcoded per species). */
export function describeRequirements(edge: EvolutionEdge, opts: { traded?: boolean } = {}): string[] {
  const out: string[] = [];
  out.push(opts.traded && edge.noCandyIfTraded ? '0 Candy (traded Pokémon evolve free)' : `${edge.candy} Candy`);
  if (edge.item) out.push(`Item: ${edge.item}`);
  if (edge.lure) out.push(`Evolve near a ${edge.lure}`);
  if (edge.mustBeBuddy) out.push('Must be your buddy');
  if (edge.buddyDistanceKm) out.push(`Walk ${edge.buddyDistanceKm} km as buddy`);
  if (edge.daytimeOnly) out.push('Evolve during the day');
  if (edge.nighttimeOnly) out.push('Evolve at night');
  if (edge.genderRequired) out.push(`Must be ${edge.genderRequired.toLowerCase()}`);
  if (edge.upsideDown) out.push('Hold phone upside-down while evolving');
  if (edge.noCandyIfTraded && !opts.traded) out.push('Free Candy if obtained by trade');
  return out;
}

export interface EvolvedStats {
  cp: { min: number; max: number };
  hp: { min: number; max: number };
  exact: boolean;
}

/**
 * CP/HP after evolving: level and IVs are preserved, base stats change. Uses every (IV, level)
 * combination consistent with what the user entered, so unknowns produce a range, never a guess.
 */
export function estimateEvolvedStats(ref: ReferenceData, target: GoSpecies, knowledge: Knowledge): EvolvedStats | null {
  if (knowledge.candidates.length === 0) return null;
  let cpMin = Infinity;
  let cpMax = -Infinity;
  let hpMin = Infinity;
  let hpMax = -Infinity;
  for (const c of knowledge.candidates) {
    const cpm = ref.cpm.get(c.level);
    const cp = calcCp(target.stats, c.ivs, cpm);
    const hp = calcHp(target.stats.sta, c.ivs.sta, cpm);
    cpMin = Math.min(cpMin, cp);
    cpMax = Math.max(cpMax, cp);
    hpMin = Math.min(hpMin, hp);
    hpMax = Math.max(hpMax, hp);
  }
  return { cp: { min: cpMin, max: cpMax }, hp: { min: hpMin, max: hpMax }, exact: cpMin === cpMax };
}

export interface EvolutionCandyPlan {
  edge: EvolutionEdge;
  target: GoSpecies;
  candyCost: number;
  /** candy still needed given current balance (0 when affordable) */
  candyShort: number;
  affordable: boolean;
  /** Items/conditions that cannot be verified by the app (item stock, buddy walking, lure, …). */
  conditions: string[];
}

export function planEvolutions(
  ref: ReferenceData,
  species: GoSpecies,
  candyBalance: number | null,
  itemStock: (name: string) => number | null,
  opts: { traded?: boolean } = {},
): EvolutionCandyPlan[] {
  return ref.evolutionsFrom(species.key).flatMap((edge) => {
    const target = ref.getByKey(edge.toKey);
    if (!target) return [];
    const cost = opts.traded && edge.noCandyIfTraded ? 0 : edge.candy;
    const conditions = describeRequirements(edge, opts).slice(1);
    if (edge.item) {
      const stock = itemStock(edge.item);
      if (stock !== null && stock <= 0) conditions.push(`You have 0× ${edge.item}`);
    }
    return [
      {
        edge,
        target,
        candyCost: cost,
        candyShort: candyBalance === null ? cost : Math.max(0, cost - candyBalance),
        affordable: candyBalance !== null && candyBalance >= cost,
        conditions,
      },
    ];
  });
}
