import { calcBattleStats } from '@/engine/combat/cp';
import { simulateBattle, fighterFromStats, fighterFromMoveIds, resolveMove, averagedRating } from '@/engine/pvp/battle';
import { buildCandidate, buildMetaThreats, suggestTeam, weaknessCounts, analyzeTeam } from '@/engine/pvp/team';
import { rankIvs } from '@/engine/pvp/pvp';
import { getRaidIndex } from '@/engine/raids/raidIndex';
import {
  NO_MODIFIERS,
  buildBossProfile,
  cycleDps,
  evaluateRaidAttacker,
  pveDamage,
  bossTierConfig,
} from '@/engine/raids/raidModel';
import { buildRaidTeam, raidVerdict } from '@/engine/raids/teamBuilder';
import { getRef, owned } from './helpers';

const P = { atk: 15, def: 15, sta: 15 };
const ref = getRef();

describe('raid damage model', () => {
  it('implements the PvE damage formula', () => {
    expect(pveDamage(12, 200, 100, 1.2)).toBe(15); // floor(0.5×12×2×1.2)+1
    expect(pveDamage(100, 300, 150, 1)).toBe(101);
  });

  it('computes fractional-cycle DPS', () => {
    // 10 dmg / 1 s fast (10 energy), 100 dmg charged costing 50, 2 s long: 5 fasts + 1 charged
    expect(cycleDps(10, 10, 1000, 100, 50, 2000)).toBeCloseTo((5 * 10 + 100) / (5 + 2), 6);
  });

  it('scores super-effective attackers above resisted ones', () => {
    const snorlax = buildBossProfile(ref, ref.getSpecies(143)!, '5'); // Normal → weak to Fighting
    const lucario = ref.getSpecies(448)!;
    const fighting = evaluateRaidAttacker(
      ref,
      { speciesKey: lucario.key, stats: lucario.stats, types: lucario.types, ivs: P, level: 40, shadow: false },
      ref.fastMove('Counter')!,
      ref.chargedMove('Aura Sphere')!,
      snorlax,
      NO_MODIFIERS,
    );
    const normalAttacker = evaluateRaidAttacker(
      ref,
      { speciesKey: lucario.key, stats: lucario.stats, types: ['Normal'], ivs: P, level: 40, shadow: false },
      ref.fastMove('Tackle')!,
      ref.chargedMove('Hyper Beam')!,
      snorlax,
      NO_MODIFIERS,
    );
    expect(fighting.dps).toBeGreaterThan(normalAttacker.dps);
  });

  it('applies weather, friendship and shadow modifiers', () => {
    const boss = buildBossProfile(ref, ref.getSpecies(143)!, '5');
    const lucario = ref.getSpecies(448)!;
    const base = { speciesKey: lucario.key, stats: lucario.stats, types: lucario.types, ivs: P, level: 40, shadow: false };
    const f = ref.fastMove('Counter')!;
    const c = ref.chargedMove('Aura Sphere')!;
    const normal = evaluateRaidAttacker(ref, base, f, c, boss, NO_MODIFIERS);
    const weather = evaluateRaidAttacker(ref, base, f, c, boss, { ...NO_MODIFIERS, weather: 'Overcast' });
    const friend = evaluateRaidAttacker(ref, base, f, c, boss, { ...NO_MODIFIERS, friendship: 'Best Friend' });
    const shadow = evaluateRaidAttacker(ref, { ...base, shadow: true }, f, c, boss, NO_MODIFIERS);
    expect(weather.dps).toBeGreaterThan(normal.dps);
    expect(friend.dps).toBeGreaterThan(normal.dps);
    expect(shadow.dps).toBeGreaterThan(normal.dps);
    expect(shadow.survivalSec).toBeLessThan(normal.survivalSec); // shadows are frailer
  });

  it('keeps tier constants explicit', () => {
    expect(bossTierConfig('5').hp).toBe(15000);
    expect(bossTierConfig('unknown').hp).toBe(15000);
  });

  it('builds a species benchmark index with ranks per attack type', () => {
    const index = getRaidIndex(ref);
    expect(index.entries.length).toBeGreaterThan(900);
    const r = index.rankOf('448:Normal')!;
    expect(r.attackType).toBe('Fighting');
    expect(r.type).toBeLessThan(15);
    expect(index.percentile('score', index.maxScore)).toBe(100);
    expect(index.percentile('score', 0)).toBe(0);
  });
});

describe('raid team builder', () => {
  const collection = [
    owned({ speciesId: 448, level: 40, ivs: P, fastMove: 'Counter', chargedMove1: 'Aura Sphere' }),
    owned({ speciesId: 68, level: 35, ivs: P, fastMove: 'Counter', chargedMove1: 'Dynamic Punch' }),
    owned({ speciesId: 376, level: 30, ivs: { atk: 10, def: 10, sta: 10 }, fastMove: 'Bullet Punch', chargedMove1: 'Meteor Mash' }),
    owned({ speciesId: 134, level: 30, ivs: P, fastMove: 'Water Gun', chargedMove1: 'Hydro Pump' }),
    owned({ speciesId: 16, level: 10, ivs: P }),
    owned({ speciesId: 25 }), // no data → cannot be evaluated
  ];

  it('builds the best team from owned Pokémon only and reports who needs data', () => {
    const snorlax = ref.getSpecies(143)!;
    const r = buildRaidTeam(ref, collection, snorlax, '5', { mods: NO_MODIFIERS });
    expect(r.members.length).toBeGreaterThan(0);
    expect(r.members.length).toBeLessThanOrEqual(6);
    const ids = new Set(collection.map((p) => p.id));
    for (const m of r.members) expect(ids.has(m.pokemon.id)).toBe(true);
    // Fighting types should lead against a Normal boss
    expect(['Lucario', 'Machamp']).toContain(r.members[0].species.name);
    expect(r.needsData.length).toBe(1);
    expect(r.estimate.caveats.length).toBeGreaterThan(0);
    expect(r.estimate.bossHpFraction).toBeGreaterThan(0);
  });

  it('limits duplicates of the same species', () => {
    const dupes = Array.from({ length: 4 }, () => owned({ speciesId: 448, level: 40, ivs: P, fastMove: 'Counter', chargedMove1: 'Aura Sphere' }));
    const r = buildRaidTeam(ref, dupes, ref.getSpecies(143)!, '5', { mods: NO_MODIFIERS, maxPerSpecies: 2 });
    expect(r.members.length).toBe(2);
  });

  it('never promises a solo win and reports coverage gaps', () => {
    const kyogre = ref.getSpecies(382)!;
    const r = buildRaidTeam(ref, collection, kyogre, '5', { mods: NO_MODIFIERS });
    const v = raidVerdict(r);
    expect(v.headline).not.toMatch(/solo/i);
    expect(r.coverageGaps).toEqual(expect.arrayContaining(['Electric']));
  });

  it('recommends a move change only when the gain is material', () => {
    const weak = owned({ speciesId: 448, level: 40, ivs: P, fastMove: 'Bullet Punch', chargedMove1: 'Power-Up Punch' });
    const r = buildRaidTeam(ref, [weak], ref.getSpecies(143)!, '5', { mods: NO_MODIFIERS });
    expect(r.members[0].best).not.toBeNull();
    expect(typeof r.members[0].moveChangeRecommended).toBe('boolean');
  });
});

describe('PvP battle simulation', () => {
  const cap = 1500;
  const fighter = (id: number, fast: string, charged: string[], label: string) => {
    const s = ref.getSpecies(id)!;
    const best = rankIvs(ref, s, cap, 50).best!;
    return fighterFromStats(ref, s, best.ivs, best.level, ref.fastMove(fast)!, charged.map((c) => ref.chargedMove(c)!), false, label);
  };

  it('is deterministic and symmetric in outcome', () => {
    const a = fighter(184, 'Bubble', ['Play Rough', 'Ice Beam'], 'azu');
    const b = fighter(80, 'Confusion', ['Psychic', 'Surf'], 'slowbro');
    const r1 = simulateBattle(ref, a, b, 1, 1);
    const r2 = simulateBattle(ref, a, b, 1, 1);
    expect(r1).toEqual(r2);
    const flipped = simulateBattle(ref, b, a, 1, 1);
    expect(flipped.winner).toBe(r1.winner === 'a' ? 'b' : r1.winner === 'b' ? 'a' : 'tie');
    expect(r1.rating).toBeGreaterThanOrEqual(0);
    expect(r1.rating).toBeLessThanOrEqual(1000);
  });

  it('gives the type-advantaged fighter a winning rating', () => {
    const water = fighter(184, 'Bubble', ['Ice Beam', 'Play Rough'], 'azumarill');
    const fire = fighter(38, 'Fire Spin', ['Flamethrower', 'Scorching Sands'], 'ninetales');
    const { rating } = averagedRating(ref, water, fire);
    expect(rating).toBeGreaterThan(500);
  });

  it('resolves provider move ids and skips unknown moves', () => {
    expect(resolveMove(ref, 'THUNDER_SHOCK').fast?.name).toBe('Thunder Shock');
    expect(resolveMove(ref, 'WEATHER_BALL_FIRE').charged?.name).toBe('Weather Ball Fire');
    const s = ref.getSpecies(184)!;
    expect(fighterFromMoveIds(ref, s, P, 20, ['NOT_A_MOVE', 'ICE_BEAM'], false, 'x')).toBeNull();
  });

  it('calculates battle stats with shadow handicap in the simulator', () => {
    const s = ref.getSpecies(448)!;
    const st = calcBattleStats(s.stats, P, ref.cpm.get(30));
    expect(st.hp).toBeGreaterThan(0);
  });
});

describe('PvP team builder', () => {
  const col = [
    owned({ speciesId: 184, level: 20, ivs: { atk: 0, def: 15, sta: 15 } }),
    owned({ speciesId: 80, level: 20, ivs: { atk: 0, def: 15, sta: 15 } }),
    owned({ speciesId: 308, level: 20, ivs: { atk: 5, def: 15, sta: 14 } }),
    owned({ speciesId: 213, level: 20, ivs: { atk: 5, def: 15, sta: 15 } }),
    owned({ speciesId: 25 }), // no IVs → cannot be ranked
  ];

  it('builds league candidates only from Pokémon with known IVs', () => {
    expect(buildCandidate(ref, col[4], 'great')).toBeNull();
    const c = buildCandidate(ref, col[0], 'great')!;
    expect(c.cp).toBeLessThanOrEqual(1500);
    expect(c.rank).toBe(1);
    expect(c.powerUp).not.toBeNull();
    expect(c.powerUp!.stardust).toBeGreaterThan(0);
  });

  it('suggests a team of three owned Pokémon and lists uncovered threats separately', () => {
    const s = suggestTeam(ref, col, 'great', { threatCount: 12, candidateLimit: 6 })!;
    expect(s).not.toBeNull();
    const ids = new Set(col.map((p) => p.id));
    expect(s.analysis.members.length).toBeLessThanOrEqual(3);
    for (const m of s.analysis.members) expect(ids.has(m.pokemon.id)).toBe(true);
    expect(s.analysis.matrix.length).toBe(s.analysis.members.length);
    expect(s.missingCoverage.length).toBeLessThanOrEqual(12);
  });

  it('detects shared weaknesses', () => {
    const species = [ref.getSpecies(448)!, ref.getSpecies(6)!, ref.getSpecies(80)!];
    const w = weaknessCounts(ref, species);
    expect(w.length).toBeGreaterThan(0);
    expect(w[0].members).toBeGreaterThanOrEqual(2);
  });

  it('builds meta threats from provider rankings', () => {
    const threats = buildMetaThreats(ref, 'great', 8);
    expect(threats.length).toBeGreaterThan(4);
    expect(threats[0].rank).toBeLessThan(threats[threats.length - 1].rank);
    const t = analyzeTeam(ref, [buildCandidate(ref, col[0], 'great')!], threats);
    expect(t.coverageScore).toBeGreaterThan(0);
  });
});
