import { useMemo } from 'react';
import { useAnalysis } from '@/store/analysis';
import type { ScoreInfo } from './filtering';

/** Per-Pokémon numbers from the latest analysis, keyed by Pokémon id (null until the first run finishes). */
export function useScores(): Map<string, ScoreInfo> | null {
  const account = useAnalysis((s) => s.account);
  return useMemo(() => {
    if (!account) return null;
    const m = new Map<string, ScoreInfo>();
    for (const a of account.analyses) {
      m.set(a.pokemon.id, {
        raid: a.ratings.raid.potential,
        great: a.ratings.great.potential,
        ultra: a.ratings.ultra.potential,
        master: a.ratings.master.potential,
        potential: a.bestInLine?.value ?? null,
        verdict: a.verdict,
      });
    }
    return m;
  }, [account]);
}
