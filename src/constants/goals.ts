import type { GoalId } from '@/engine/types';

export interface GoalDef {
  id: GoalId;
  label: string;
  description: string;
}

export const GOALS: GoalDef[] = [
  { id: 'raids', label: 'Build strong raid teams', description: 'Counters, move changes and the best six for any boss.' },
  { id: 'great_league', label: 'Win more Great League battles', description: '1,500 CP cap — IV ranks and team coverage.' },
  { id: 'ultra_league', label: 'Improve Ultra League teams', description: '2,500 CP cap — bulkier, stronger picks.' },
  { id: 'master_league', label: 'Build a Master League team', description: 'No cap — long-term, Candy XL heavy investments.' },
  { id: 'collecting', label: 'Collect rare Pokémon', description: 'Shiny, Legendary, Mythical and Shadow tracking.' },
  { id: 'pokedex', label: 'Complete Pokédex entries', description: 'See which species you still need.' },
  { id: 'stardust', label: 'Save Stardust', description: 'Prefer efficient, low-cost improvements.' },
  { id: 'account_strength', label: 'Maximise account strength', description: 'Balanced improvements across every mode.' },
];

export const GOAL_LABEL: Record<GoalId, string> = Object.fromEntries(GOALS.map((g) => [g.id, g.label])) as Record<GoalId, string>;

export const PRIORITY_LEVELS = [
  { label: 'Low', weight: 0.4 },
  { label: 'Medium', weight: 0.7 },
  { label: 'High', weight: 1 },
] as const;

export const PLAY_STYLES = ['Casual', 'Raider', 'PvP battler', 'Collector', 'Competitive all-rounder'] as const;
