import type { CoachCard, CoachReply } from '@/services/ai/protocol';
import { normalizeName, speciesDisplayName } from '@/engine/reference/referenceData';
import { executeTool, type ToolEnv } from './tools';

/**
 * Offline fallback for the assistant. These are NOT scripted chatbot replies: each answer is composed from
 * the same deterministic tool results the AI would receive, using simple keyword intents. It covers the most
 * common questions so the coach screen stays useful with no internet or no AI backend.
 */

type Row = Record<string, unknown>;
const fmt = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('en-US') : '?');

function costText(c: Row | undefined): string {
  if (!c) return '';
  const p: string[] = [];
  if (c.stardust) p.push(`${fmt(c.stardust)} Stardust`);
  if (c.candy) p.push(`${fmt(c.candy)} Candy`);
  if (c.candyXl) p.push(`${fmt(c.candyXl)} Candy XL`);
  return p.join(' + ') || 'no resources';
}

function mentionedSpecies(env: ToolEnv, text: string): number | undefined {
  const words = text.replace(/[^\p{L}\p{N}\s'.-]/gu, ' ').split(/\s+/).filter(Boolean);
  let best: { id: number; len: number } | undefined;
  for (let n = 3; n >= 1; n -= 1) {
    for (let i = 0; i + n <= words.length; i += 1) {
      const phrase = words.slice(i, i + n).join(' ');
      const norm = normalizeName(phrase);
      if (norm.length < 4) continue;
      const id = env.ctx.ref.findSpeciesIdByName(phrase);
      if (id !== undefined && (!best || norm.length > best.len)) best = { id, len: norm.length };
    }
  }
  return best?.id;
}

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

export function answerLocally(question: string, env: ToolEnv): CoachReply | null {
  const q = question.toLowerCase();
  const speciesId = mentionedSpecies(env, question);
  const speciesName = speciesId !== undefined ? env.ctx.ref.getSpecies(speciesId)?.name : undefined;
  const budget = /(\d[\d,.]*)\s*(k|stardust|dust)?/.exec(q.replace(/(\d),(\d{3})/g, '$1$2'));
  const budgetValue = budget ? Number(budget[1].replace(/[,]/g, '')) * (budget[2] === 'k' ? 1000 : 1) : undefined;

  // --- raid team vs a boss
  if (speciesName && has(q, 'raid', 'team', 'counter', 'beat', 'against', 'use against', 'defeat')) {
    const r = executeTool(env, 'build_raid_team', { boss: speciesName });
    if (r.ok && !(r.result as Row).error) {
      const t = r.result as { boss: string; tier: string; verdict: { headline: string; details: string[] }; team: Row[]; estimate: Row; coverageGaps: string[] };
      const cards: CoachCard[] = t.team.slice(0, 6).map((m) => ({
        type: 'pokemon',
        title: `${m.species as string}${m.cp ? ` · CP ${m.cp}` : ''}`,
        detail: `${m.currentMoves as string}${m.changeMoves ? ` → better: ${m.bestMoves as string}` : ''}`,
        pokemonId: m.pokemonId as string,
      }));
      return {
        answer: t.team.length
          ? `${t.verdict.headline}. ${t.verdict.details.join(' ')} Your six best counters for ${t.boss} (${t.tier}) are below — an estimate, not a guarantee.`
          : `I couldn’t score any counters for ${t.boss}: your Pokémon need CP, level or IVs first.`,
        cards: [...cards, { type: 'link', title: `Open the ${t.boss} raid analysis`, route: `/raids/boss?speciesId=${speciesId}&tier=${t.tier.includes('Mega') ? 'mega' : '5'}` }],
        followUps: [],
        usedTools: ['build_raid_team'],
        confidence: t.team.length ? 'medium' : 'low',
      };
    }
  }

  // --- pvp-only
  if (has(q, 'useless for raid', 'valuable in pvp', 'pvp but', 'only for pvp', 'pvp-only')) {
    const r = executeTool(env, 'find_pvp_only_pokemon', {});
    const res = r.ok ? (r.result as { rows: Row[]; count: number }) : null;
    if (res) {
      return {
        answer: res.count ? `${res.count} Pokémon rate poorly for raids but well in a PvP league:` : 'None of your Pokémon fit that pattern (raid potential < 60 and league suitability ≥ 70) with the data entered.',
        cards: res.rows.slice(0, 6).map((p) => ({ type: 'pokemon', title: `${p.species as string} · CP ${(p.cp as number | null) ?? '?'}`, detail: `Best league: ${p.bestLeague as string}`, pokemonId: p.id as string })),
        followUps: [],
        usedTools: ['find_pvp_only_pokemon'],
        confidence: 'medium',
      };
    }
  }

  // --- budget
  if (budgetValue && budgetValue >= 1000 && has(q, 'stardust', 'dust', 'invest', 'budget', 'spend')) {
    const r = executeTool(env, 'plan_budget', { stardust: budgetValue });
    if (r.ok) {
      const res = r.result as { plans: { title: string; summary: string; items: Row[] }[] };
      const best = res.plans.find((p) => p.items.length) ?? res.plans[1];
      return {
        answer: best?.items.length
          ? `With ${fmt(budgetValue)} Stardust, the “${best.title}” plan fits best: ${best.summary}`
          : `Nothing in your collection clears the bar at ${fmt(budgetValue)} Stardust — consider saving it.`,
        cards: (best?.items ?? []).slice(0, 5).map((i) => ({
          type: 'pokemon',
          title: i.label as string,
          detail: `${fmt(i.stardust)} Stardust${i.candy ? ` · ${fmt(i.candy)} Candy` : ''}${i.staged ? ' (staged power-up)' : ''}`,
          pokemonId: i.pokemonId as string,
        })),
        followUps: [],
        usedTools: ['plan_budget'],
        confidence: 'medium',
      };
    }
  }

  // --- a specific owned species: evolve / power up / worth it
  if (speciesName && has(q, 'evolve', 'worth', 'power up', 'invest', 'should i', 'keep', 'transfer')) {
    const owned = env.ctx.collection.filter((p) => p.speciesId === speciesId);
    if (owned.length) {
      const best = owned
        .map((p) => env.account.analyses.find((a) => a.pokemon.id === p.id))
        .filter((a): a is NonNullable<typeof a> => !!a)
        .sort((a, b) => b.verdict.impact - a.verdict.impact)[0];
      if (best) {
        const v = best.verdict;
        return {
          answer: `${v.headline}. ${v.explanation}`,
          cards: [
            { type: 'pokemon', title: `${speciesDisplayName(best.species)}${best.pokemon.cp ? ` · CP ${best.pokemon.cp}` : ''}`, detail: v.expectedBenefit || v.headline, pokemonId: best.pokemon.id },
            ...(v.cost.stardust || v.cost.candy ? [{ type: 'cost' as const, title: 'Cost', stardust: v.cost.stardust, candy: v.cost.candy, xl: v.cost.xlCandy }] : []),
          ],
          followUps: [],
          usedTools: ['get_pokemon_analysis'],
          confidence: v.confidence,
        };
      }
    }
    const info = executeTool(env, 'get_species_info', { name: speciesName });
    if (info.ok && !(info.result as Row).error) {
      return { answer: `You don’t own a ${speciesName} yet. I can describe the species, but a personal verdict needs one in your collection.`, cards: [{ type: 'link', title: `Open the ${speciesName} dossier`, route: `/pokedex/${speciesId}` }], followUps: [], usedTools: ['get_species_info'], confidence: 'medium' };
    }
  }

  // --- league
  const league = has(q, 'great league') ? 'great' : has(q, 'ultra league') ? 'ultra' : has(q, 'master league') ? 'master' : null;
  if (league) {
    const r = executeTool(env, 'get_pvp_candidates', { league, limit: 5 });
    if (r.ok) {
      const res = r.result as { rows: Row[] };
      return {
        answer: res.rows.length ? `Your best ${league[0].toUpperCase()}${league.slice(1)} League options, ranked by IV stat-product rank and meta score:` : `No Pokémon with IVs can be ranked for ${league} league yet.`,
        cards: [
          ...res.rows.map((x) => ({ type: 'pokemon' as const, title: `${x.species as string} · suitability ${x.suitability as number}`, detail: `IV rank #${(x.ivRank as number | null) ?? '?'} · best at L${(x.targetLevel as number | null) ?? '?'}`, pokemonId: x.pokemonId as string })),
          { type: 'link' as const, title: 'Build a team', route: `/pvp/team?league=${league}` },
        ],
        followUps: [],
        usedTools: ['get_pvp_candidates'],
        confidence: 'medium',
      };
    }
  }

  // --- generic priorities / this week
  if (has(q, 'prioritize', 'priority', 'priorities', 'focus', 'this week', 'next', 'best investment', 'what should i', 'power up', 'stardust on', 'waste')) {
    const r = executeTool(env, 'get_top_priorities', { limit: 5 });
    if (r.ok) {
      const res = r.result as { priorities: Row[]; roadmap: { today: Row[] } };
      if (res.priorities.length === 0) return { answer: 'No investment stands out right now. Add CP/IVs to your Pokémon, or enter your Stardust, to unlock recommendations.', cards: [{ type: 'link', title: 'Add Pokémon details', route: '/import' }], followUps: [], usedTools: ['get_top_priorities'], confidence: 'low' };
      return {
        answer: `Your top ${res.priorities.length} priorities right now (goal-weighted impact):`,
        cards: res.priorities.map((p) => ({ type: 'pokemon', title: `${p.headline as string} — ${p.species as string}`, detail: `${p.benefit as string} · ${costText(p.cost as Row)}`, pokemonId: p.pokemonId as string })),
        followUps: [],
        usedTools: ['get_top_priorities'],
        confidence: 'medium',
      };
    }
  }

  return null;
}

export const SUGGESTED_QUESTIONS = [
  'Which five Pokémon should I prioritize?',
  'I have 100,000 Stardust. What is the best investment?',
  'What should I focus on this week?',
  'Which of my Pokémon are useless for raids but valuable in PvP?',
  'How can I improve my Great League team?',
  'Build my strongest raid team against Mewtwo.',
];
