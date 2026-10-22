import { answerLocally } from '@/features/assistant/localAnswer';
import { executeTool, makeToolEnv, TOOLS } from '@/features/assistant/tools';
import { askCoach } from '@/services/ai/coach';
import { ALLOWED_ROUTE, coachReplySchema, sanitizeReply } from '@/services/ai/protocol';
import toolsJson from '../supabase/functions/_shared/tools.json';
import { ctxFor, owned } from './helpers';

jest.mock('@/services/ai/gateway', () => ({ callCoach: jest.fn() }));
// eslint-disable-next-line import/first
import { callCoach } from '@/services/ai/gateway';

const P = { atk: 15, def: 15, sta: 15 };
const col = [
  owned({ speciesId: 448, level: 30, ivs: P, fastMove: 'Counter', chargedMove1: 'Aura Sphere' }),
  owned({ speciesId: 4, level: 20, ivs: P }),
  owned({ speciesId: 184, level: 20, ivs: { atk: 0, def: 15, sta: 15 } }),
  owned({ speciesId: 68, level: 30, ivs: { atk: 12, def: 12, sta: 12 }, fastMove: 'Counter', chargedMove1: 'Dynamic Punch' }),
  owned({ speciesId: 376, level: 35, ivs: { atk: 8, def: 8, sta: 8 }, fastMove: 'Bullet Punch', chargedMove1: 'Meteor Mash' }),
  owned({ speciesId: 150, level: 35, ivs: { atk: 14, def: 13, sta: 13 }, fastMove: 'Confusion', chargedMove1: 'Psystrike' }),
  owned({ speciesId: 25 }),
];
const ctx = ctxFor(col, { balances: [{ type: 'stardust', scope: null, amount: 200000 }] });

describe('AI tools (deterministic, grounded)', () => {
  const env = makeToolEnv(ctx);

  it('declares exactly the tools the app implements (edge function ↔ client in sync)', () => {
    const declared = (toolsJson as { name: string }[]).map((t) => t.name).sort();
    expect(declared).toEqual(Object.keys(TOOLS).sort());
  });

  it('summarises the account without inventing resources', () => {
    const r = executeTool(env, 'get_account_summary', {});
    expect(r.ok).toBe(true);
    const s = (r as { ok: true; result: { resources: { stardust: number; rareCandy: null }; collection: { total: number } } }).result;
    expect(s.resources.stardust).toBe(200000);
    expect(s.resources.rareCandy).toBeNull(); // unknown stays unknown
    expect(s.collection.total).toBe(col.length);
  });

  it('lists Pokémon with search expressions and caps the row count', () => {
    const r = executeTool(env, 'list_pokemon', { query: 'fighting', limit: 100 }) as { ok: true; result: { rows: { species: string }[]; total: number } };
    expect(r.result.rows.map((x) => x.species)).toEqual(expect.arrayContaining(['Lucario', 'Machamp']));
    expect(r.result.rows.length).toBeLessThanOrEqual(25);
    const bad = executeTool(env, 'list_pokemon', { query: 'fire&' }) as { ok: true; result: { syntaxErrors: string[] } };
    expect(bad.result.syntaxErrors.length).toBeGreaterThan(0);
  });

  it('returns a full analysis for a Pokémon id and rejects unknown ids', () => {
    const ok = executeTool(env, 'get_pokemon_analysis', { pokemon_id: col[1].id }) as { ok: true; result: { verdict: { action: string } } };
    expect(ok.result.verdict.action).toBe('EVOLVE');
    const bad = executeTool(env, 'get_pokemon_analysis', { pokemon_id: 'nope' }) as { ok: true; result: { error: string } };
    expect(bad.result.error).toContain('Unknown');
    expect(executeTool(env, 'not_a_tool', {}).ok).toBe(false);
  });

  it('builds a raid team for a named boss from owned Pokémon only', () => {
    const r = executeTool(env, 'build_raid_team', { boss: 'Snorlax', tier: '5' }) as { ok: true; result: { team: { pokemonId: string; species: string }[]; verdict: { headline: string } } };
    const ids = new Set(col.map((p) => p.id));
    expect(r.result.team.length).toBeGreaterThan(0);
    for (const m of r.result.team) expect(ids.has(m.pokemonId)).toBe(true);
    expect(r.result.verdict.headline).not.toMatch(/solo/i);
    const unknown = executeTool(env, 'build_raid_team', { boss: 'Notamon' }) as { ok: true; result: { error: string } };
    expect(unknown.result.error).toContain('Unknown boss');
  });

  it('plans budgets, ranks PvP candidates and finds PvP-only Pokémon', () => {
    const budget = executeTool(env, 'plan_budget', { stardust: 100000 }) as { ok: true; result: { plans: { totalStardust: number }[] } };
    expect(budget.result.plans).toHaveLength(3);
    for (const p of budget.result.plans) expect(p.totalStardust).toBeLessThanOrEqual(100000);
    const pvp = executeTool(env, 'get_pvp_candidates', { league: 'great', limit: 3 }) as { ok: true; result: { rows: { species: string }[] } };
    expect(pvp.result.rows[0].species).toBe('Azumarill');
    expect(executeTool(env, 'get_pvp_candidates', { league: 'nope' }).ok).toBe(true);
    const only = executeTool(env, 'find_pvp_only_pokemon', {}) as { ok: true; result: { count: number } };
    expect(typeof only.result.count).toBe('number');
  });

  it('describes species facts from validated reference data', () => {
    const r = executeTool(env, 'get_species_info', { name: 'Charmander' }) as { ok: true; result: { baseStats: { atk: number }; evolutions: { to: string; candy: number }[]; owned: number } };
    expect(r.result.baseStats.atk).toBe(116);
    expect(r.result.evolutions[0]).toMatchObject({ to: 'Charmeleon', candy: 25 });
    expect(r.result.owned).toBe(1);
  });
});

describe('offline assistant (local answers from the same tools)', () => {
  const env = makeToolEnv(ctx);
  it('answers priority questions', () => {
    const a = answerLocally('Which five Pokémon should I prioritize?', env)!;
    expect(a.usedTools).toContain('get_top_priorities');
    expect(a.cards.length).toBeGreaterThan(0);
    expect(a.cards.every((c) => c.type !== 'pokemon' || col.some((p) => p.id === c.pokemonId))).toBe(true);
  });
  it('answers budget questions', () => {
    const a = answerLocally('I have 100,000 Stardust. What is the best investment?', env)!;
    expect(a.usedTools).toContain('plan_budget');
  });
  it('answers raid-team questions for a named boss', () => {
    const a = answerLocally('Build my strongest raid team against Snorlax.', env)!;
    expect(a.usedTools).toContain('build_raid_team');
    expect(a.answer).toMatch(/Snorlax/);
  });
  it('answers species questions and league questions', () => {
    expect(answerLocally('Should I evolve my Charmander?', env)!.cards[0].type).toBe('pokemon');
    expect(answerLocally('How can I improve my Great League team?', env)!.usedTools).toContain('get_pvp_candidates');
  });
  it('declines to invent answers it cannot compute', () => {
    expect(answerLocally('Tell me a joke about Pikachu', env)).toBeNull();
  });
});

describe('coach protocol', () => {
  it('validates structured replies and strips unsafe cards', () => {
    const raw = {
      answer: 'Power up Lucario.',
      cards: [
        { type: 'pokemon', title: 'Lucario', pokemonId: col[0].id },
        { type: 'pokemon', title: 'Ghost', pokemonId: 'hallucinated-id' },
        { type: 'link', title: 'Plans', route: '/plans' },
        { type: 'link', title: 'Evil', route: 'https://evil.example.com' },
        { type: 'cost', title: 'Cost', stardust: 1000 },
      ],
      followUps: ['What next?'],
      usedTools: ['get_top_priorities'],
      confidence: 'high',
    };
    const parsed = coachReplySchema.parse(raw);
    const clean = sanitizeReply(parsed, new Set(col.map((p) => p.id)));
    expect(clean.cards.map((c) => c.title)).toEqual(['Lucario', 'Plans', 'Cost']);
    expect(ALLOWED_ROUTE.test('/pokemon/abc-123')).toBe(true);
    expect(ALLOWED_ROUTE.test('/pvp/great')).toBe(true);
    expect(ALLOWED_ROUTE.test('/settings/data')).toBe(false);
    expect(coachReplySchema.safeParse({ answer: '' }).success).toBe(false);
  });

  it('runs the tool loop: model → local tool execution → grounded final reply', async () => {
    const env = makeToolEnv(ctx);
    const mocked = callCoach as jest.Mock;
    mocked.mockReset();
    mocked
      .mockResolvedValueOnce({ model: 'm', content: { role: 'model', parts: [{ functionCall: { name: 'get_top_priorities', args: { limit: 2 } } }] } })
      .mockResolvedValueOnce({ model: 'm', content: { role: 'model', parts: [{ text: 'Evolve Charmander first.' }] }, quota: { remainingHour: 9, remainingDay: 50 } })
      .mockResolvedValueOnce({
        model: 'm',
        content: { role: 'model', parts: [{ text: JSON.stringify({ answer: 'Evolve Charmander first.', cards: [{ type: 'pokemon', title: 'Charmander', pokemonId: col[1].id }, { type: 'pokemon', title: 'Fake', pokemonId: 'zzz' }], followUps: [], usedTools: [], confidence: 'medium' }) }] },
        quota: { remainingHour: 8, remainingDay: 49 },
      });
    const steps: string[] = [];
    const res = await askCoach({ history: [], question: 'What should I do?', env, locale: 'en', onStep: (s) => steps.push(s) });
    expect(mocked).toHaveBeenCalledTimes(3);
    // the second call must contain the REAL tool output from the engine
    const secondCall = mocked.mock.calls[1][0];
    const fr = secondCall.contents.flatMap((c: { parts: Record<string, unknown>[] }) => c.parts).find((p: Record<string, unknown>) => p.functionResponse);
    expect(JSON.stringify(fr)).toContain('priorities');
    expect(res.reply.cards.map((c) => c.title)).toEqual(['Charmander']); // hallucinated card removed
    expect(res.reply.usedTools).toContain('get_top_priorities');
    expect(res.quota?.remainingHour).toBe(8);
    expect(steps.some((s) => s.includes('get top priorities'))).toBe(true);
  });

  it('falls back to plain text when the final JSON is invalid, and surfaces gateway errors', async () => {
    const env = makeToolEnv(ctx);
    const mocked = callCoach as jest.Mock;
    mocked.mockReset();
    mocked
      .mockResolvedValueOnce({ model: 'm', content: { role: 'model', parts: [{ text: 'Plain answer.' }] } })
      .mockResolvedValueOnce({ model: 'm', content: { role: 'model', parts: [{ text: 'not json' }] } });
    const res = await askCoach({ history: [], question: 'hi', env, locale: 'en' });
    expect(res.reply.answer).toBe('Plain answer.');
    expect(res.reply.confidence).toBe('low');
    mocked.mockReset();
    mocked.mockRejectedValueOnce(Object.assign(new Error('quota'), { reason: 'rate-limited' }));
    await expect(askCoach({ history: [], question: 'hi', env, locale: 'en' })).rejects.toThrow('quota');
  });
});
