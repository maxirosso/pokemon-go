import { analyzeCollectionSync } from '@/engine/recommendations/account';
import { analyzePokemon, buildPeerIndex } from '@/engine/recommendations/analysis';
import { buildBudgetPlans, comparePlans } from '@/engine/recommendations/budget';
import { calcCp } from '@/engine/combat/cp';
import type { OwnedPokemon, ResourceBalance } from '@/engine/types';
import { ctxFor, getRef, owned } from './helpers';

const P = { atk: 15, def: 15, sta: 15 };
const dust = (amount: number): ResourceBalance => ({ type: 'stardust', scope: null, amount });
const candy = (family: number, amount: number): ResourceBalance => ({ type: 'candy', scope: String(family), amount });

function verdictFor(p: OwnedPokemon, col: OwnedPokemon[] = [p], balances: ResourceBalance[] = []) {
  const ctx = ctxFor(col, { balances });
  const a = analyzePokemon(ctx, p, buildPeerIndex(ctx))!;
  return a;
}

describe('recommendation engine — individual verdicts', () => {
  it('does not dismiss a level-6 Lucario with perfect IVs just because its CP is low', () => {
    const lucario = owned({ speciesId: 448, level: 6, ivs: P, fastMove: 'Counter', chargedMove1: 'Aura Sphere' });
    const a = verdictFor(lucario, [lucario], [dust(300000), candy(447, 400)]);
    expect(a.verdict.action).toBe('POWER_UP');
    expect(a.verdict.role).toBe('raid');
    expect(a.verdict.cost.stardust).toBeGreaterThan(200000);
    expect(a.verdict.cost.candy).toBeGreaterThan(200);
    expect(a.verdict.explanation).toMatch(/A-tier|S-tier/);
    expect(a.ratings.raid.now).toBeLessThan(30);
    expect(a.ratings.raid.potential).toBeGreaterThan(90);
  });

  it('flags a power-up as unaffordable and moves it to "later" when Stardust is short', () => {
    const lucario = owned({ speciesId: 448, level: 6, ivs: P });
    const a = verdictFor(lucario, [lucario], [dust(10000)]);
    expect(a.verdict.affordable).toBe(false);
    expect(a.verdict.when).toBe('later');
    expect(a.verdict.explanation).toContain('more Stardust');
  });

  it('does not claim affordability when resources were never entered', () => {
    const lucario = owned({ speciesId: 448, level: 6, ivs: P });
    const a = verdictFor(lucario);
    expect(a.verdict.affordable).toBeNull();
  });

  it('recommends evolving a 15/15/15 Charmander and respects Candy shortage', () => {
    const c = owned({ speciesId: 4, level: 20, ivs: P });
    const short = verdictFor(c, [c], [candy(4, 5)]);
    expect(short.verdict.action).toBe('EVOLVE');
    expect(short.verdict.when).toBe('later');
    expect(short.verdict.affordable).toBe(false);
    expect(short.verdict.explanation).toContain('20 more Candy');
    const ok = verdictFor(c, [c], [candy(4, 60)]);
    expect(ok.verdict.when).toBe('now');
    expect(ok.verdict.affordable).toBe(true);
    expect(ok.verdict.targetSpeciesKey).toBe('5:Normal');
  });

  it('judges a high-CP / poor-IV Pokémon as usable now without more investment', () => {
    const m = owned({ speciesId: 376, cp: 4000, level: 35, ivs: { atk: 5, def: 6, sta: 7 }, fastMove: 'Bullet Punch', chargedMove1: 'Meteor Mash' });
    const a = verdictFor(m);
    expect(a.verdict.action).toBe('KEEP');
    expect(a.verdict.headline).toContain('DIMINISHING');
    expect(a.ratings.raid.now).toBeGreaterThan(85);
  });

  it('does not recommend spending Stardust on a weak species with perfect IVs', () => {
    const delibird = owned({ speciesId: 225, level: 25, ivs: P });
    const a = verdictFor(delibird);
    expect(['DONT_INVEST', 'CONSIDER_TRANSFER']).toContain(a.verdict.action);
    expect(a.verdict.impact).toBe(0);
    expect(a.verdict.explanation).toMatch(/IVs/);
    expect(a.ivPercent).toBe(100);
  });

  it('values a strong species even with imperfect IVs', () => {
    const m = owned({ speciesId: 150, level: 35, ivs: { atk: 12, def: 10, sta: 11 }, fastMove: 'Confusion', chargedMove1: 'Psystrike' });
    const a = verdictFor(m);
    expect(a.ratings.raid.tier).toBe('S');
  });

  it('uses PvP IV ranking: a 0/15/15 Azumarill beats a 15/15/15 for Great League', () => {
    const low = owned({ speciesId: 184, level: 20, ivs: { atk: 0, def: 15, sta: 15 } });
    const high = owned({ speciesId: 184, level: 20, ivs: P });
    const col = [low, high];
    const ctx = ctxFor(col);
    const peers = buildPeerIndex(ctx);
    const aLow = analyzePokemon(ctx, low, peers)!;
    const aHigh = analyzePokemon(ctx, high, peers)!;
    expect(aLow.ratings.great.potential!).toBeGreaterThan(aHigh.ratings.great.potential!);
    expect(aLow.verdict.action).toBe('SAVE_FOR_PVP');
    expect(aLow.verdict.role).toBe('great');
    expect(aLow.verdict.explanation).toContain('IV rank #1');
    // multiple Pokémon from the same line: the weaker duplicate is not told to invest
    expect(aHigh.verdict.action).toBe('KEEP');
    expect(aHigh.betterOwned.map((b) => b.pokemon.id)).toContain(low.id);
  });

  it('shows ranges and low confidence when IVs are unknown', () => {
    const ref = getRef();
    const pika = ref.getSpecies(25)!;
    const cp = calcCp(pika.stats, { atk: 9, def: 9, sta: 9 }, ref.cpm.get(20));
    const p = owned({ speciesId: 25, cp });
    const a = verdictFor(p);
    expect(a.knowledge.ivsKnown).toBe(false);
    expect(a.verdict.confidence).not.toBe('high');
    expect(a.ivPercent).toBeNull();
    expect(a.verdict.explanation).toContain('Confidence');
  });

  it('asks for information instead of guessing when nothing is known', () => {
    const p = owned({ speciesId: 150 });
    const a = verdictFor(p);
    expect(a.verdict.action).toBe('MORE_INFO');
    expect(a.verdict.when).toBe('needs-data');
    expect(a.verdict.impact).toBe(0);
  });

  it('flags inconsistent CP/IV data as a typo instead of rating it', () => {
    const p = owned({ speciesId: 448, cp: 20, ivs: P });
    expect(verdictFor(p).verdict.headline).toContain('CHECK');
  });

  it('assumes best non-elite moves (and says so) when the moveset is missing', () => {
    const p = owned({ speciesId: 448, level: 30, ivs: P });
    const a = verdictFor(p);
    expect(a.ratings.raid.now).not.toBeNull();
  });

  it('recommends a move change when a better regular moveset exists', () => {
    const p = owned({ speciesId: 448, level: 40, ivs: P, fastMove: 'Bullet Punch', chargedMove1: 'Power-Up Punch' });
    const a = verdictFor(p);
    expect(['CHANGE_MOVES', 'KEEP']).toContain(a.verdict.action);
    if (a.verdict.action === 'CHANGE_MOVES') expect(a.verdict.cost.extras.length).toBeGreaterThan(0);
  });

  it('is data-driven: shadow Pokémon rate higher than normal ones in raids', () => {
    const normal = owned({ speciesId: 150, level: 40, ivs: P, fastMove: 'Confusion', chargedMove1: 'Psystrike' });
    const shadow = owned({ speciesId: 150, level: 40, ivs: P, shadow: true, fastMove: 'Confusion', chargedMove1: 'Psystrike' });
    const ctx = ctxFor([normal, shadow]);
    const peers = buildPeerIndex(ctx);
    const rn = peers.get(normal.id)!.ratings.raid;
    const rs = peers.get(shadow.id)!.ratings.raid;
    expect(rs.rawNow!).toBeGreaterThan(rn.rawNow!);
  });
});

describe('recommendation engine — whole collection', () => {
  const col = [
    owned({ speciesId: 225, level: 25, ivs: P }),
    owned({ speciesId: 184, level: 20, ivs: { atk: 0, def: 15, sta: 15 } }),
    owned({ speciesId: 448, level: 30, ivs: P, fastMove: 'Counter', chargedMove1: 'Aura Sphere' }),
    owned({ speciesId: 4, level: 20, ivs: P }),
    owned({ speciesId: 376, level: 35, ivs: { atk: 5, def: 6, sta: 7 }, fastMove: 'Bullet Punch', chargedMove1: 'Meteor Mash' }),
    owned({ speciesId: 150, level: 35, ivs: { atk: 14, def: 13, sta: 13 }, fastMove: 'Confusion', chargedMove1: 'Psystrike' }),
    owned({ speciesId: 10, level: 10, ivs: P }),
    owned({ speciesId: 25, level: 15, ivs: { atk: 10, def: 12, sta: 13 } }),
    owned({ speciesId: 130, level: 25, ivs: { atk: 12, def: 12, sta: 12 } }),
  ];

  it('handles an empty collection without fabricating statistics', () => {
    const acc = analyzeCollectionSync(ctxFor([]));
    expect(acc.analyses).toHaveLength(0);
    expect(acc.raidReadiness).toBeNull();
    expect(acc.pvpReadiness.great).toBeNull();
    expect(acc.actions).toHaveLength(0);
    expect(acc.priorities).toHaveLength(0);
    expect(acc.missingTypes).toHaveLength(0);
    expect(acc.goalProgress.find((g) => g.goal === 'raids')!.progress).toBeNull();
  });

  it('ranks actions, produces roadmap buckets and links every insight to a screen', () => {
    const ctx = ctxFor(col, { balances: [dust(150000), candy(4, 100)] });
    const acc = analyzeCollectionSync(ctx);
    expect(acc.actions.length).toBeGreaterThan(0);
    for (let i = 1; i < acc.actions.length; i += 1) expect(acc.actions[i - 1].verdict.impact).toBeGreaterThanOrEqual(acc.actions[i].verdict.impact);
    expect(acc.insights.every((i) => i.href.startsWith('/'))).toBe(true);
    expect(acc.priorities[0].rank).toBe(1);
    expect(acc.priorities[0].resources.length).toBeGreaterThan(0);
    const total = acc.roadmap.today.length + acc.roadmap.thisWeek.length + acc.roadmap.longTerm.length;
    expect(total).toBe(acc.actions.length);
    expect(acc.dataQuality.total).toBe(col.length);
  });

  it('only reports raid readiness once six Pokémon are rated', () => {
    const few = analyzeCollectionSync(ctxFor(col.slice(0, 3)));
    expect(few.raidReadiness).toBeNull();
    const many = analyzeCollectionSync(ctxFor(col));
    expect(many.raidReadiness).not.toBeNull();
    expect(many.raidReadiness!.score).toBeGreaterThan(0);
  });

  it('never exceeds the budget when planning investments (competing investments)', () => {
    const ctx = ctxFor(col, { balances: [dust(100000), candy(4, 100), candy(447, 500)] });
    const acc = analyzeCollectionSync(ctx);
    const plans = buildBudgetPlans(ctx, acc, { stardust: 100000, enforceCandy: true });
    expect(plans.map((p) => p.id)).toEqual(['cheapest', 'balanced', 'long-term']);
    for (const p of plans) {
      expect(p.totalStardust).toBeLessThanOrEqual(100000);
      expect(new Set(p.items.map((i) => i.group)).size).toBe(p.items.length); // one action per Pokémon
    }
    const balanced = plans.find((p) => p.id === 'balanced')!;
    expect(balanced.totalStardust).toBeLessThanOrEqual(70000);
    expect(typeof comparePlans(plans)).toBe('string');
  });

  it('drops plan items that need more Candy than the family balance', () => {
    const c = owned({ speciesId: 4, level: 20, ivs: P });
    const ctx = ctxFor([c], { balances: [dust(100000), candy(4, 5)] });
    const acc = analyzeCollectionSync(ctx);
    const plans = buildBudgetPlans(ctx, acc, { stardust: 100000, enforceCandy: true });
    expect(plans.every((p) => p.items.length === 0)).toBe(true);
    expect(plans.some((p) => p.blockedByCandy.length > 0)).toBe(true);
  });

  it('goal weights change which role is built', () => {
    const slow = owned({ speciesId: 80, level: 20, ivs: { atk: 0, def: 15, sta: 15 } });
    const raids = ctxFor([slow], { goals: [{ goal: 'raids', weight: 1 }] });
    const pvp = ctxFor([slow], { goals: [{ goal: 'ultra_league', weight: 1 }] });
    const a1 = analyzePokemon(raids, slow, buildPeerIndex(raids))!;
    const a2 = analyzePokemon(pvp, slow, buildPeerIndex(pvp))!;
    expect(a2.verdict.role).not.toBe('raid');
    expect(a1.verdict.impact).not.toBe(a2.verdict.impact);
  });
});
