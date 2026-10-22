import {
  CpmTable,
  bestLevelUnderCap,
  calcCp,
  calcHp,
  estimateLevel,
  findLevelsForCp,
  ivPercent,
  ivStars,
  maxLevelForTrainer,
  solveIvCandidates,
} from '@/engine/combat/cp';
import { resolveKnowledge } from '@/engine/combat/knowledge';
import maxcp from './fixtures/maxcp.json';
import { getRef, owned } from './helpers';

const PERFECT = { atk: 15, def: 15, sta: 15 };

describe('CP / HP formulas', () => {
  const ref = getRef();

  it('matches well-known values (Mewtwo 15/15/15)', () => {
    const mewtwo = ref.getSpecies(150)!;
    expect(calcCp(mewtwo.stats, PERFECT, ref.cpm.get(40))).toBe(4178);
    expect(calcCp(mewtwo.stats, PERFECT, ref.cpm.get(50))).toBe(4724);
    expect(calcHp(mewtwo.stats.sta, 15, ref.cpm.get(40))).toBe(Math.floor(229 * 0.79030001));
  });

  it("agrees with an independent provider's max-CP table for 40+ species at level 51", () => {
    for (const [id, expected] of maxcp as number[][]) {
      const s = ref.getSpecies(id)!;
      expect({ id, cp: calcCp(s.stats, PERFECT, ref.cpm.get(51)) }).toEqual({ id, cp: expected });
    }
  });

  it('enforces the minimum CP of 10', () => {
    expect(calcCp({ atk: 1, def: 1, sta: 1 }, { atk: 0, def: 0, sta: 0 }, 0.094)).toBe(10);
  });

  it('supports half levels', () => {
    const lucario = ref.getSpecies(448)!;
    const l20 = calcCp(lucario.stats, PERFECT, ref.cpm.get(20));
    const l205 = calcCp(lucario.stats, PERFECT, ref.cpm.get(20.5));
    const l21 = calcCp(lucario.stats, PERFECT, ref.cpm.get(21));
    expect(l20).toBeLessThan(l205);
    expect(l205).toBeLessThan(l21);
  });

  it('extrapolates CPM beyond the provider range and flags it', () => {
    const t = ref.cpm;
    expect(t.providerMaxLevel).toBe(45);
    expect(t.isExtrapolated(50)).toBe(true);
    expect(t.get(50)).toBeCloseTo(0.8403, 4);
    expect(() => t.get(52)).toThrow();
    expect(new CpmTable([{ level: 1, multiplier: 0.094 }]).levels.length).toBeGreaterThan(1);
  });
});

describe('IV helpers', () => {
  it('computes IV percentage as (atk+def+sta)/45', () => {
    expect(ivPercent({ atk: 15, def: 15, sta: 15 })).toBe(100);
    expect(ivPercent({ atk: 0, def: 15, sta: 15 })).toBeCloseTo(66.667, 2);
    expect(ivPercent({ atk: 0, def: 0, sta: 0 })).toBe(0);
  });

  it('maps totals to appraisal stars', () => {
    expect(ivStars({ atk: 15, def: 15, sta: 15 })).toBe(4);
    expect(ivStars({ atk: 14, def: 14, sta: 14 })).toBe(3);
    expect(ivStars({ atk: 10, def: 10, sta: 10 })).toBe(2);
    expect(ivStars({ atk: 8, def: 8, sta: 8 })).toBe(1);
    expect(ivStars({ atk: 5, def: 5, sta: 5 })).toBe(0);
  });
});

describe('level estimation never invents precision', () => {
  const ref = getRef();
  const lucario = ref.getSpecies(448)!;

  it('uses a supplied level as known', () => {
    expect(estimateLevel(ref.cpm, lucario.stats, { level: 25, cp: null, hp: null, ivs: null })).toEqual({ status: 'known', level: 25 });
  });

  it('finds the level from CP + IVs', () => {
    const cp = calcCp(lucario.stats, PERFECT, ref.cpm.get(30));
    const r = estimateLevel(ref.cpm, lucario.stats, { level: null, cp, hp: null, ivs: PERFECT });
    expect(r.status === 'unique' || r.status === 'ambiguous').toBe(true);
    if (r.status === 'unique') expect(r.level).toBe(30);
    expect(findLevelsForCp(ref.cpm, lucario.stats, PERFECT, cp)).toContain(30);
  });

  it('reports impossible CP values', () => {
    expect(estimateLevel(ref.cpm, lucario.stats, { level: null, cp: 99, hp: null, ivs: PERFECT }).status).toBe('impossible');
  });

  it('asks for more data when inputs are insufficient', () => {
    expect(estimateLevel(ref.cpm, lucario.stats, { level: null, cp: 1000, hp: null, ivs: null }).status).toBe('insufficient');
  });

  it('returns every IV/level combination for an unknown-IV Pokémon', () => {
    const cp = calcCp(lucario.stats, { atk: 10, def: 11, sta: 12 }, ref.cpm.get(25));
    const hp = calcHp(lucario.stats.sta, 12, ref.cpm.get(25));
    const cands = solveIvCandidates(ref.cpm, lucario.stats, cp, hp);
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.some((c) => c.level === 25 && c.ivs.atk === 10 && c.ivs.def === 11 && c.ivs.sta === 12)).toBe(true);
  });

  it('computes the best level under a CP cap', () => {
    const lvl = bestLevelUnderCap(ref.cpm, lucario.stats, PERFECT, 1500)!;
    expect(calcCp(lucario.stats, PERFECT, ref.cpm.get(lvl))).toBeLessThanOrEqual(1500);
    expect(calcCp(lucario.stats, PERFECT, ref.cpm.get(lvl + 0.5))).toBeGreaterThan(1500);
  });

  it('caps level by trainer level (+2, +1 with Best Buddy, max 51)', () => {
    expect(maxLevelForTrainer(30)).toBe(32);
    expect(maxLevelForTrainer(30, true)).toBe(33);
    expect(maxLevelForTrainer(50)).toBe(50);
    expect(maxLevelForTrainer(50, true)).toBe(51);
  });
});

describe('knowledge model', () => {
  const ref = getRef();
  const lucario = ref.getSpecies(448)!;
  it('is exact when IVs and level are known', () => {
    const k = resolveKnowledge(ref, lucario, owned({ speciesId: 448, ivs: PERFECT, level: 30 }));
    expect(k.status).toBe('exact');
    expect(k.level).toBe(30);
  });
  it('is a range when IVs are unknown', () => {
    const cp = calcCp(lucario.stats, { atk: 9, def: 9, sta: 9 }, ref.cpm.get(20));
    const k = resolveKnowledge(ref, lucario, owned({ speciesId: 448, cp }));
    expect(k.ivsKnown).toBe(false);
    expect(k.status).toBe('iv-range');
    expect(k.candidates.length).toBeGreaterThan(1);
  });
  it('flags inconsistent CP/IV combinations', () => {
    const k = resolveKnowledge(ref, lucario, owned({ speciesId: 448, ivs: PERFECT, cp: 12 }));
    expect(k.status).toBe('inconsistent');
  });
  it('is unknown with no data', () => {
    expect(resolveKnowledge(ref, lucario, owned({ speciesId: 448 })).status).toBe('unknown');
  });
});
