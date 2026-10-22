import { maxAffordableLevel, powerUpCost } from '../powerup/powerUp';
import { speciesDisplayName } from '../reference/referenceData';
import type { AccountAction, AccountAnalysis } from './account';
import { roleWeights } from './ratings';
import type { AnalysisContext } from './types';

/**
 * Budget planner. Objective functions and constraints are explicit:
 *
 *   maximise   Σ value(item)            over chosen items (one action per Pokémon)
 *   subject to Σ stardust(item) ≤ budget
 *              Σ candy(item)    ≤ candy balance of each family (when the balance is entered)
 *              Σ xlCandy(item)  ≤ Candy XL balance of each family (when entered)
 *
 * value = goal-weighted gain computed by the recommendation engine ("impact") — never invented.
 * The Stardust knapsack is solved exactly on a discretised grid; candy limits are enforced by a
 * deterministic repair pass that drops the least efficient conflicting item.
 */

export interface PlanItem {
  action: AccountAction;
  stardust: number;
  candy: number;
  xlCandy: number;
  familyId: number | null;
  gain: number;
  longTermGain: number;
  label: string;
  /** Pokémon id — at most one variant per Pokémon is ever chosen. */
  group: string;
  /** True when this is a partial power-up (stops short of the recommended level). */
  partial: boolean;
  stopLevel: number | null;
}

export type PlanId = 'cheapest' | 'balanced' | 'long-term';

export interface BudgetPlan {
  id: PlanId;
  title: string;
  summary: string;
  items: PlanItem[];
  totalStardust: number;
  totalGain: number;
  totalLongTerm: number;
  remaining: number;
  /** Items that were excluded only because of candy/XL shortage. */
  blockedByCandy: PlanItem[];
}

export interface BudgetInput {
  stardust: number;
  /** When true, candy/XL balances in ctx.resources are enforced; otherwise candy is ignored. */
  enforceCandy: boolean;
}

function toItem(ctx: AnalysisContext, a: AccountAction): PlanItem {
  const v = a.verdict;
  const weights = roleWeights(ctx.goals);
  const role = v.role;
  const potential = role ? a.analysis.ratings[role].potential ?? 0 : 0;
  const weighted = role ? potential * weights[role] : 0;
  return {
    action: a,
    stardust: v.cost.stardust,
    candy: v.cost.candy,
    xlCandy: v.cost.xlCandy,
    familyId: v.cost.familyId,
    gain: v.impact,
    longTermGain: v.impact + 0.25 * weighted,
    label: `${v.headline[0]}${v.headline.slice(1).toLowerCase()} ${speciesDisplayName(a.analysis.species)}`,
    group: a.id,
    partial: false,
    stopLevel: v.targetLevel,
  };
}

/**
 * A power-up that is too expensive for the budget can still be done in stages. Partial variants stop at
 * the highest level the budget affords (or at ~40 % of it); their gain is the full gain pro-rated by the
 * CP-multiplier progress made — an explicit, explainable approximation.
 */
function partialVariants(ctx: AnalysisContext, full: PlanItem, budget: number): PlanItem[] {
  const a = full.action;
  const v = a.verdict;
  const level = a.analysis.knowledge.level;
  const target = v.targetLevel;
  if ((v.action !== 'POWER_UP' && v.action !== 'SAVE_FOR_PVP') || level == null || target == null || target <= level) return [];
  const ref = ctx.ref;
  const mods = a.analysis.pokemon;
  const cpm0 = ref.cpm.get(level);
  const span = ref.cpm.get(target) - cpm0;
  if (span <= 0) return [];
  const out: PlanItem[] = [];
  const caps = [budget, Math.floor(budget * 0.4)];
  const seen = new Set<number>();
  for (const cap of caps) {
    const stop = maxAffordableLevel(ref, level, { stardust: cap, candy: Number.MAX_SAFE_INTEGER, xlCandy: Number.MAX_SAFE_INTEGER }, target, mods);
    if (stop <= level || stop >= target || seen.has(stop)) continue;
    seen.add(stop);
    const cost = powerUpCost(ref, level, stop, mods);
    const frac = (ref.cpm.get(stop) - cpm0) / span;
    out.push({
      ...full,
      stardust: cost.stardust,
      candy: cost.candy,
      xlCandy: cost.xlCandy,
      gain: full.gain * frac,
      longTermGain: full.longTermGain * frac,
      label: `Power up ${speciesDisplayName(a.analysis.species)} to L${stop}`,
      partial: true,
      stopLevel: stop,
    });
  }
  return out;
}

/** Exact multiple-choice knapsack: at most one item per group (Pokémon), Stardust discretised to a grid. */
function knapsack(items: PlanItem[], capacity: number, value: (i: PlanItem) => number): PlanItem[] {
  const groups = new Map<string, PlanItem[]>();
  for (const i of items) groups.set(i.group, [...(groups.get(i.group) ?? []), i]);
  const list = [...groups.values()];
  if (list.length === 0) return [];
  const unit = Math.max(500, Math.ceil(capacity / 2000 / 500) * 500);
  const cap = Math.max(0, Math.floor(capacity / unit));
  const n = list.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(cap + 1).fill(0));
  const pick: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(cap + 1).fill(-1));
  for (let g = 1; g <= n; g += 1) {
    for (let c = 0; c <= cap; c += 1) {
      dp[g][c] = dp[g - 1][c];
      list[g - 1].forEach((it, vi) => {
        const w = Math.ceil(it.stardust / unit);
        if (w <= c) {
          const cand = dp[g - 1][c - w] + value(it);
          if (cand > dp[g][c] + 1e-9) {
            dp[g][c] = cand;
            pick[g][c] = vi;
          }
        }
      });
    }
  }
  const chosen: PlanItem[] = [];
  let c = cap;
  for (let g = n; g >= 1; g -= 1) {
    const vi = pick[g][c];
    if (vi >= 0 && dp[g][c] !== dp[g - 1][c]) {
      const it = list[g - 1][vi];
      chosen.push(it);
      c -= Math.ceil(it.stardust / unit);
    }
  }
  return chosen.reverse();
}

function enforceCandy(ctx: AnalysisContext, items: PlanItem[], value: (i: PlanItem) => number): { kept: PlanItem[]; blocked: PlanItem[] } {
  const kept = [...items];
  const blocked: PlanItem[] = [];
  const over = (): PlanItem[] | null => {
    const candy = new Map<number, number>();
    const xl = new Map<number, number>();
    for (const i of kept) {
      if (i.familyId === null) continue;
      candy.set(i.familyId, (candy.get(i.familyId) ?? 0) + i.candy);
      xl.set(i.familyId, (xl.get(i.familyId) ?? 0) + i.xlCandy);
    }
    for (const [fam, used] of candy) {
      const bal = ctx.resources.candy(fam);
      if (bal !== null && used > bal + (ctx.resources.rareCandy ?? 0)) return kept.filter((i) => i.familyId === fam && i.candy > 0);
    }
    for (const [fam, used] of xl) {
      const bal = ctx.resources.xl(fam);
      if (bal !== null && used > bal + (ctx.resources.rareCandyXl ?? 0)) return kept.filter((i) => i.familyId === fam && i.xlCandy > 0);
    }
    return null;
  };
  for (let guard = 0; guard < 200; guard += 1) {
    const conflict = over();
    if (!conflict || conflict.length === 0) break;
    conflict.sort((a, b) => value(a) / (1 + a.stardust / 10000) - value(b) / (1 + b.stardust / 10000));
    const drop = conflict[0];
    kept.splice(kept.indexOf(drop), 1);
    blocked.push(drop);
  }
  return { kept, blocked };
}

function summarize(id: PlanId, title: string, items: PlanItem[], blocked: PlanItem[], budget: number, why: string): BudgetPlan {
  const totalStardust = items.reduce((s, i) => s + i.stardust, 0);
  const totalGain = items.reduce((s, i) => s + i.gain, 0);
  const totalLongTerm = items.reduce((s, i) => s + i.longTermGain, 0);
  const pct = budget > 0 ? Math.round((totalStardust / budget) * 100) : 0;
  return {
    id,
    title,
    summary: items.length
      ? `${items.length} action${items.length > 1 ? 's' : ''} · ${totalStardust.toLocaleString('en-US')} of ${budget.toLocaleString('en-US')} Stardust (${pct}%) · +${totalGain.toFixed(0)} impact. ${why}`
      : `No action fits this plan's rules. ${why}`,
    items,
    totalStardust,
    totalGain,
    totalLongTerm,
    remaining: Math.max(0, budget - totalStardust),
    blockedByCandy: blocked,
  };
}

export function buildBudgetPlans(ctx: AnalysisContext, account: AccountAnalysis, input: BudgetInput): BudgetPlan[] {
  const budget = Math.max(0, Math.floor(input.stardust));
  const base = account.actions.map((a) => toItem(ctx, a)).filter((i) => i.gain > 0);
  const all = base.flatMap((i) => [i, ...partialVariants(ctx, i, budget)]).filter((i) => i.stardust <= budget);

  const finish = (id: PlanId, title: string, picked: PlanItem[], value: (i: PlanItem) => number, why: string): BudgetPlan => {
    if (!input.enforceCandy) return summarize(id, title, picked, [], budget, why);
    const { kept, blocked } = enforceCandy(ctx, picked, value);
    return summarize(id, title, kept, blocked, budget, why);
  };

  // 1. Cheapest useful improvement: best gain per Stardust, small and safe.
  const eff = (i: PlanItem) => i.gain / (1 + i.stardust / 10000);
  const cheapPool = [...all].filter((i) => i.gain >= 5).sort((a, b) => eff(b) - eff(a));
  const cheapPicked: PlanItem[] = [];
  let cheapSpend = 0;
  for (const i of cheapPool) {
    if (cheapPicked.length >= 3) break;
    if (cheapPicked.some((p) => p.group === i.group)) continue;
    if (cheapSpend + i.stardust > budget * 0.25) continue;
    cheapPicked.push(i);
    cheapSpend += i.stardust;
  }
  const cheapest = finish('cheapest', 'Cheapest useful improvement', cheapPicked, (i) => i.gain, 'Highest gain per Stardust, capped at 25% of your budget.');

  // 2. Balanced: exact knapsack on gain with 70% of the budget kept in play, 1 action per Pokémon.
  const balancedPicked = knapsack(all, Math.floor(budget * 0.7), (i) => i.gain);
  const balanced = finish('balanced', 'Balanced investment', balancedPicked, (i) => i.gain, 'Maximises immediate gain while keeping 30% of your Stardust in reserve.');

  // 3. Maximum long-term: exact knapsack on long-term value with the full budget.
  const longPicked = knapsack(all, budget, (i) => i.longTermGain);
  const longTerm = finish('long-term', 'Maximum long-term potential', longPicked, (i) => i.longTermGain, 'Favours high-ceiling Pokémon and spends the full budget.');

  return [cheapest, balanced, longTerm];
}

/** One sentence that explains why a plan was ranked first (numbers come from the plans themselves). */
export function comparePlans(plans: BudgetPlan[]): string {
  const byGain = [...plans].sort((a, b) => b.totalGain - a.totalGain)[0];
  const cheapest = plans.find((p) => p.id === 'cheapest');
  if (!byGain || byGain.items.length === 0) return 'No investment in your collection clears the bar at this budget. Add more Pokémon details or raise the budget.';
  if (cheapest && cheapest.items.length && cheapest.totalGain >= byGain.totalGain * 0.6) {
    return `The cheapest plan already delivers ${Math.round((cheapest.totalGain / byGain.totalGain) * 100)}% of the best plan's immediate gain for ${cheapest.totalStardust.toLocaleString('en-US')} Stardust — consider stopping there.`;
  }
  return `"${byGain.title}" gives the highest immediate gain (+${byGain.totalGain.toFixed(0)} impact) for ${byGain.totalStardust.toLocaleString('en-US')} Stardust.`;
}
