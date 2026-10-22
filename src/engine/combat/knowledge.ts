import type { ReferenceData } from '../reference/referenceData';
import type { GoSpecies, IVs, OwnedPokemon } from '../types';
import { findLevelsForCp, solveIvCandidates, type IvCandidate } from './cp';

/**
 * What we actually know about a specific owned Pokémon. The recommendation engine and
 * evolution/power-up planners consume this instead of raw nullable fields, so the
 * "never invent precision" rule is enforced in exactly one place.
 */
export interface Knowledge {
  ivsKnown: boolean;
  ivs: IVs | null;
  /** Single resolved level, or null when unknown/ambiguous. */
  level: number | null;
  /** All levels consistent with the inputs (empty when none can be derived). */
  levelOptions: number[];
  /** All (IV, level) pairs consistent with the data. For known IVs this is derived from level options. */
  candidates: IvCandidate[];
  status: 'exact' | 'level-ambiguous' | 'iv-range' | 'unknown' | 'inconsistent';
  /** Human-readable note explaining why precision is limited. */
  note: string | null;
}

const MAX_CANDIDATES = 4000;

export function resolveKnowledge(ref: ReferenceData, species: GoSpecies, p: OwnedPokemon): Knowledge {
  const base = species.stats;
  if (p.ivs) {
    let levels: number[];
    if (p.level != null) levels = [p.level];
    else if (p.cp != null) levels = findLevelsForCp(ref.cpm, base, p.ivs, p.cp, p.hp);
    else levels = [];
    if (p.level == null && p.cp != null && levels.length === 0) {
      return {
        ivsKnown: true,
        ivs: p.ivs,
        level: null,
        levelOptions: [],
        candidates: [],
        status: 'inconsistent',
        note: 'The CP/HP you entered cannot occur with these IVs at any level — check for a typo.',
      };
    }
    const candidates = levels.map((level) => ({ ivs: p.ivs as IVs, level }));
    if (levels.length === 1) {
      return { ivsKnown: true, ivs: p.ivs, level: levels[0], levelOptions: levels, candidates, status: 'exact', note: null };
    }
    if (levels.length > 1) {
      return {
        ivsKnown: true,
        ivs: p.ivs,
        level: null,
        levelOptions: levels,
        candidates,
        status: 'level-ambiguous',
        note: `Level could be ${levels.join(' or ')} — add HP (or the level) to pin it down.`,
      };
    }
    return {
      ivsKnown: true,
      ivs: p.ivs,
      level: null,
      levelOptions: [],
      candidates: [],
      status: 'unknown',
      note: 'Add CP or level to evaluate power-up and evolution outcomes.',
    };
  }

  // IVs unknown
  if (p.cp != null) {
    const cands = solveIvCandidates(ref.cpm, base, p.cp, p.hp, p.level != null ? { levels: [p.level] } : {});
    if (cands.length === 0) {
      return {
        ivsKnown: false,
        ivs: null,
        level: p.level,
        levelOptions: p.level != null ? [p.level] : [],
        candidates: [],
        status: 'inconsistent',
        note: 'The CP/HP you entered does not match any possible IV/level for this species — check for a typo.',
      };
    }
    const limited = cands.length > MAX_CANDIDATES ? cands.slice(0, MAX_CANDIDATES) : cands;
    return {
      ivsKnown: false,
      ivs: null,
      level: p.level,
      levelOptions: [...new Set(cands.map((c) => c.level))].sort((a, b) => a - b),
      candidates: limited,
      status: 'iv-range',
      note: `IVs unknown — ${cands.length} (IV, level) combinations fit this CP${p.hp != null ? ' and HP' : ''}. Use the appraisal screen to narrow them.`,
    };
  }
  if (p.level != null) {
    const candidates: IvCandidate[] = [];
    for (let atk = 0; atk <= 15; atk += 1)
      for (let def = 0; def <= 15; def += 1)
        for (let sta = 0; sta <= 15; sta += 1) candidates.push({ ivs: { atk, def, sta }, level: p.level });
    return {
      ivsKnown: false,
      ivs: null,
      level: p.level,
      levelOptions: [p.level],
      candidates,
      status: 'iv-range',
      note: 'IVs unknown — results are shown as ranges.',
    };
  }
  return {
    ivsKnown: false,
    ivs: null,
    level: null,
    levelOptions: [],
    candidates: [],
    status: 'unknown',
    note: 'No CP, level or IVs entered — add details to get a personalised verdict.',
  };
}
