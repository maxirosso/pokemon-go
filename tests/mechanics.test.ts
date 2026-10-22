import { defensiveMatchups, typeMultiplier, superEffectiveAgainst } from '@/engine/combat/typeChart';
import { calcCp } from '@/engine/combat/cp';
import { resolveKnowledge } from '@/engine/combat/knowledge';
import { buildEvolutionTree, estimateEvolvedStats, planEvolutions } from '@/engine/evolution/evolution';
import { maxAffordableLevel, powerUpCost, powerUpOutcome, levelForTargetCp, stepModifiers } from '@/engine/powerup/powerUp';
import { computeIvRanking, rankIvs, suitabilityFormula, assessLeague, leagueEligibility } from '@/engine/pvp/pvp';
import { LEAGUES } from '@/engine/types';
import { getRef, owned } from './helpers';

const PERFECT = { atk: 15, def: 15, sta: 15 };
const ref = getRef();

describe('type effectiveness (Pokémon GO multipliers)', () => {
  it('uses 1.6 / 0.625 / 0.390625', () => {
    expect(typeMultiplier(ref.typeChart, 'Fire', ['Grass'])).toBeCloseTo(1.6);
    expect(typeMultiplier(ref.typeChart, 'Fire', ['Water'])).toBeCloseTo(0.625);
    expect(typeMultiplier(ref.typeChart, 'Fire', ['Water', 'Rock'])).toBeCloseTo(0.390625);
    expect(typeMultiplier(ref.typeChart, 'Fire', ['Grass', 'Bug'])).toBeCloseTo(2.56);
  });
  it('lists weaknesses and resistances of a dual type', () => {
    const m = defensiveMatchups(ref.typeChart, ['Fighting', 'Steel']);
    expect(m.weaknesses.map((w) => w.type)).toEqual(expect.arrayContaining(['Fire', 'Ground']));
    expect(m.resistances.map((w) => w.type)).toContain('Rock');
    expect(superEffectiveAgainst(ref.typeChart, ['Flying'])).toEqual(expect.arrayContaining(['Electric', 'Ice', 'Rock']));
  });
});

describe('power-up costs', () => {
  it('matches the official cumulative totals', () => {
    const to40 = powerUpCost(ref, 1, 40);
    expect(to40).toMatchObject({ stardust: 270000, candy: 304, xlCandy: 0 });
    const to50 = powerUpCost(ref, 40, 50);
    expect(to50).toMatchObject({ stardust: 250000, candy: 0, xlCandy: 296 });
  });
  it('applies shadow / purified / lucky modifiers', () => {
    expect(stepModifiers({ shadow: true })).toEqual({ dust: 1.2, candy: 1.2 });
    const base = powerUpCost(ref, 20, 30);
    expect(powerUpCost(ref, 20, 30, { shadow: true }).stardust).toBe(base.stardust * 1.2);
    expect(powerUpCost(ref, 20, 30, { lucky: true }).stardust).toBe(base.stardust * 0.5);
    expect(powerUpCost(ref, 20, 30, { purified: true }).stardust).toBeCloseTo(base.stardust * 0.9, 0);
  });
  it('reports incomplete costs rather than silently under-pricing', () => {
    expect(powerUpCost(ref, 50, 51).incomplete).toBe(true);
  });
  it('finds the highest affordable level and efficiency', () => {
    const lvl = maxAffordableLevel(ref, 20, { stardust: 20000, candy: 1000, xlCandy: 0 }, 40);
    expect(powerUpCost(ref, 20, lvl).stardust).toBeLessThanOrEqual(20000);
    expect(powerUpCost(ref, 20, lvl + 0.5).stardust).toBeGreaterThan(20000);
    const lucario = ref.getSpecies(448)!;
    const out = powerUpOutcome(ref, lucario.stats, PERFECT, 20, 30);
    expect(out.cpAfter).toBeGreaterThan(out.cpBefore);
    expect(out.cpPer10kStardust).toBeGreaterThan(0);
    expect(levelForTargetCp(ref.cpm, lucario.stats, PERFECT, 1500)).toBeLessThan(25);
  });
});

describe('evolution maths', () => {
  const charmander = ref.getSpecies(4)!;
  const charmeleon = ref.getSpecies(5)!;
  it('keeps level and IVs and changes base stats', () => {
    const p = owned({ speciesId: 4, ivs: { atk: 12, def: 13, sta: 14 }, level: 20 });
    const k = resolveKnowledge(ref, charmander, p);
    const est = estimateEvolvedStats(ref, charmeleon, k)!;
    expect(est.exact).toBe(true);
    expect(est.cp.min).toBe(calcCp(charmeleon.stats, { atk: 12, def: 13, sta: 14 }, ref.cpm.get(20)));
  });
  it('returns a range when IVs are unknown', () => {
    const k = resolveKnowledge(ref, charmander, owned({ speciesId: 4, level: 20 }));
    const est = estimateEvolvedStats(ref, charmeleon, k)!;
    expect(est.exact).toBe(false);
    expect(est.cp.max).toBeGreaterThan(est.cp.min);
  });
  it('returns null when nothing is known', () => {
    const k = resolveKnowledge(ref, charmander, owned({ speciesId: 4 }));
    expect(estimateEvolvedStats(ref, charmeleon, k)).toBeNull();
  });
  it('handles branching evolutions and candy affordability', () => {
    const eevee = ref.getSpecies(133)!;
    const plans = planEvolutions(ref, eevee, 20, () => null);
    expect(plans.length).toBeGreaterThanOrEqual(8);
    expect(plans.every((p) => p.candyCost === 25)).toBe(true);
    expect(plans.every((p) => !p.affordable)).toBe(true);
    expect(plans[0].candyShort).toBe(5);
    const tree = buildEvolutionTree(ref, '134:Normal')!;
    expect(tree.species.name).toBe('Eevee');
    expect(tree.children.length).toBeGreaterThanOrEqual(8);
  });
  it('honours free trade evolutions for data-flagged species', () => {
    const kadabra = ref.getSpecies(64)!;
    const normal = planEvolutions(ref, kadabra, 0, () => null)[0];
    const traded = planEvolutions(ref, kadabra, 0, () => null, { traded: true })[0];
    expect(normal.candyCost).toBe(100);
    expect(traded.candyCost).toBe(0);
  });
  it('lists item requirements', () => {
    const slowpoke = ref.getSpecies(79)!;
    const king = planEvolutions(ref, slowpoke, 100, () => 0).find((p) => p.target.name === 'Slowking')!;
    expect(king.conditions.join(' ')).toContain("King's Rock");
  });
});

describe('PvP', () => {
  it('has the correct league caps', () => {
    expect(LEAGUES.little.cpCap).toBe(500);
    expect(LEAGUES.great.cpCap).toBe(1500);
    expect(LEAGUES.ultra.cpCap).toBe(2500);
    expect(Number.isFinite(LEAGUES.master.cpCap)).toBe(false);
  });
  it('picks the best level under the cap for every IV combination', () => {
    const azu = ref.getSpecies(184)!;
    const r = rankIvs(ref, azu, 1500, 50);
    for (const e of r.entries.slice(0, 50)) expect(e.cp).toBeLessThanOrEqual(1500);
    expect(r.best!.ivs).toEqual({ atk: 0, def: 15, sta: 15 });
    expect(r.best!.level).toBe(45.5);
    expect(r.best!.cp).toBe(1499);
  });
  it('shows that 0/15/15 can outrank 15/15/15 at a CP cap', () => {
    const azumarill = ref.getSpecies(184)!;
    const r = rankIvs(ref, azumarill, 1500, 50);
    expect(r.lookup({ atk: 0, def: 15, sta: 15 })!.rank).toBeLessThan(r.lookup(PERFECT)!.rank);
  });
  it('matches brute-force level search (closed form is verified)', () => {
    const species = ref.getSpecies(448)!;
    const r = computeIvRanking(ref.cpm, species.stats, 1500, 50);
    const ivs = { atk: 7, def: 9, sta: 11 };
    const e = r.lookup(ivs)!;
    let expected = 0;
    for (const l of ref.cpm.levels) if (l <= 50 && calcCp(species.stats, ivs, ref.cpm.get(l)) <= 1500) expected = l;
    expect(e.level).toBe(expected);
  });
  it('handles species that cannot reach the cap or are ineligible', () => {
    const shuckle = ref.getSpecies(213)!;
    const r = rankIvs(ref, shuckle, 1500, 50);
    expect(r.best!.cp).toBeLessThan(1500);
    const mewtwo = ref.getSpecies(150)!;
    expect(leagueEligibility(mewtwo, 'little').eligible).toBe(false);
    expect(leagueEligibility(ref.getSpecies(4)!, 'little').eligible).toBe(true);
    const k = resolveKnowledge(ref, mewtwo, owned({ speciesId: 150, ivs: PERFECT, level: 40 }));
    const a = assessLeague(ref, mewtwo, k, 'little');
    expect(a.eligible).toBe(false);
    expect(a.suitability).toBeNull();
  });
  it('degrades suitability as stat product drops', () => {
    expect(suitabilityFormula(80, 1)).toBe(80);
    expect(suitabilityFormula(80, 0.9)).toBeLessThan(80);
    expect(suitabilityFormula(80, 0.5)).toBe(20);
  });
  it('uses a rank range when IVs are unknown', () => {
    const azu = ref.getSpecies(184)!;
    const k = resolveKnowledge(ref, azu, owned({ speciesId: 184, cp: 1400 }));
    const a = assessLeague(ref, azu, k, 'great');
    expect(a.uncertain).toBe(true);
    expect(a.rankRange).not.toBeNull();
  });
});
