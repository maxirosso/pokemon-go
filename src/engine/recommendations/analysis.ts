import { ivPercent, ivStars, maxLevelForTrainer } from '../combat/cp';
import { resolveKnowledge, type Knowledge } from '../combat/knowledge';
import { describeRequirements } from '../evolution/evolution';
import { powerUpCost } from '../powerup/powerUp';
import { rankIvs } from '../pvp/pvp';
import type { LeagueAssessment } from '../pvp/pvp';
import { getRaidIndex } from '../raids/raidIndex';
import { speciesDisplayName, type ReferenceData } from '../reference/referenceData';
import type { EvolutionEdge, GoSpecies, OwnedPokemon } from '../types';
import {
  headlineValue,
  leagueOf,
  ratingsFor,
  roleWeights,
  type RaidDetail,
} from './ratings';
import {
  ROLE_LABEL,
  ZERO_COST,
  type AnalysisContext,
  type Cost,
  type LineEntry,
  type PokemonAnalysis,
  type RoleId,
  type RoleRating,
  type Verdict,
  type When,
} from './types';

export interface PeerRecord {
  pokemon: OwnedPokemon;
  species: GoSpecies;
  ratings: Record<RoleId, RoleRating>;
  raidType: string | null;
  /** Cached so analyzePokemon does not recompute the current species' ratings. */
  knowledge: Knowledge;
  rated: ReturnType<typeof ratingsFor>;
}

export type PeerIndex = Map<string, PeerRecord>;

/** Rate every owned Pokémon once (current species only) so peers can be compared cheaply. */
export function buildPeerIndex(ctx: AnalysisContext): PeerIndex {
  const out: PeerIndex = new Map();
  for (const p of ctx.collection) {
    const species = ctx.ref.getSpecies(p.speciesId, p.form);
    if (!species) continue;
    const k = resolveKnowledge(ctx.ref, species, p);
    const r = ratingsFor(ctx, species, k, p);
    out.set(p.id, { pokemon: p, species, ratings: r.ratings, raidType: r.raidDetail.typeRank?.type ?? null, knowledge: k, rated: r });
  }
  return out;
}

/**
 * Same as buildPeerIndex but cooperative: yields to the event loop whenever ~12 ms have passed, so a
 * 1,000-Pokémon collection never freezes the UI while ratings are computed.
 */
export async function buildPeerIndexAsync(ctx: AnalysisContext, onProgress?: (done: number, total: number) => void): Promise<PeerIndex> {
  const out: PeerIndex = new Map();
  let last = Date.now();
  let i = 0;
  for (const p of ctx.collection) {
    const species = ctx.ref.getSpecies(p.speciesId, p.form);
    if (species) {
      const k = resolveKnowledge(ctx.ref, species, p);
      const r = ratingsFor(ctx, species, k, p);
      out.set(p.id, { pokemon: p, species, ratings: r.ratings, raidType: r.raidDetail.typeRank?.type ?? null, knowledge: k, rated: r });
    }
    i += 1;
    if (Date.now() - last > 12) {
      onProgress?.(i, ctx.collection.length);
      await new Promise<void>((r) => setTimeout(r, 0));
      last = Date.now();
    }
  }
  return out;
}

// ---- helpers ------------------------------------------------------------------------------------

const fmt = (n: number) => n.toLocaleString('en-US');
const pctTxt = (n: number) => `${Math.round(n)}`;

/** Path of evolution edges from `fromKey` to `toKey` (DFS, shortest by edge count). */
export function evolutionPath(ref: ReferenceData, fromKey: string, toKey: string): EvolutionEdge[] | null {
  if (fromKey === toKey) return [];
  let best: EvolutionEdge[] | null = null;
  const walk = (k: string, acc: EvolutionEdge[], depth: number) => {
    if (depth > 5) return;
    for (const e of ref.evolutionsFrom(k)) {
      const next = [...acc, e];
      if (e.toKey === toKey) {
        if (!best || next.length < best.length) best = next;
      } else walk(e.toKey, next, depth + 1);
    }
  };
  walk(fromKey, [], 0);
  return best;
}

function ivLabel(k: Knowledge): string {
  return k.ivs ? `${k.ivs.atk}/${k.ivs.def}/${k.ivs.sta} (${pctTxt(ivPercent(k.ivs))}%)` : 'unknown IVs';
}

function tierWord(r: RoleRating): string {
  return r.tier ? `${r.tier}-tier` : 'unrated';
}

function priorityFromImpact(impact: number): 1 | 2 | 3 | 4 | 5 {
  if (impact >= 22) return 1;
  if (impact >= 13) return 2;
  if (impact >= 7) return 3;
  if (impact >= 2.5) return 4;
  return 5;
}

function affordability(ctx: AnalysisContext, cost: Cost): boolean | null {
  const r = ctx.resources;
  let known = false;
  if (cost.stardust > 0) {
    if (r.stardust === null) return null;
    known = true;
    if (r.stardust < cost.stardust) return false;
  }
  if (cost.familyId !== null) {
    if (cost.candy > 0) {
      const c = r.candy(cost.familyId);
      if (c === null) return null;
      known = true;
      if (c + (r.rareCandy ?? 0) < cost.candy) return false;
    }
    if (cost.xlCandy > 0) {
      const x = r.xl(cost.familyId);
      if (x === null) return null;
      known = true;
      if (x + (r.rareCandyXl ?? 0) < cost.xlCandy) return false;
    }
  }
  return known ? true : cost.stardust === 0 && cost.candy === 0 && cost.xlCandy === 0 ? true : null;
}

function shortfallText(ctx: AnalysisContext, cost: Cost): string {
  const r = ctx.resources;
  const parts: string[] = [];
  if (cost.stardust > 0 && r.stardust !== null && r.stardust < cost.stardust)
    parts.push(`${fmt(cost.stardust - r.stardust)} more Stardust`);
  if (cost.familyId !== null) {
    const c = r.candy(cost.familyId);
    if (cost.candy > 0 && c !== null && c + (r.rareCandy ?? 0) < cost.candy) parts.push(`${fmt(cost.candy - c - (r.rareCandy ?? 0))} more Candy`);
    const x = r.xl(cost.familyId);
    if (cost.xlCandy > 0 && x !== null && x + (r.rareCandyXl ?? 0) < cost.xlCandy)
      parts.push(`${fmt(cost.xlCandy - x - (r.rareCandyXl ?? 0))} more Candy XL`);
  }
  return parts.join(', ');
}

function costText(c: Cost): string {
  const parts: string[] = [];
  if (c.stardust) parts.push(`${fmt(c.stardust)} Stardust`);
  if (c.candy) parts.push(`${fmt(c.candy)} Candy`);
  if (c.xlCandy) parts.push(`${fmt(c.xlCandy)} Candy XL`);
  parts.push(...c.extras);
  return parts.length ? parts.join(' + ') : 'no resources';
}

// ---- main ---------------------------------------------------------------------------------------

export function analyzePokemon(ctx: AnalysisContext, p: OwnedPokemon, peers?: PeerIndex): PokemonAnalysis | null {
  const { ref } = ctx;
  const species = ref.getSpecies(p.speciesId, p.form);
  if (!species) return null;
  const cached = peers?.get(p.id);
  const reuse = cached && cached.pokemon === p ? cached : null;
  const k = reuse ? reuse.knowledge : resolveKnowledge(ref, species, p);
  const weights = roleWeights(ctx.goals);

  // --- ratings for the current species and each evolution ---
  const currentRatings = reuse ? reuse.rated : ratingsFor(ctx, species, k, p);
  const lineEntries: LineEntry[] = [];
  const mkEntry = (s: GoSpecies, ratings: LineEntry['ratings']): LineEntry => {
    const h = headlineValue(ratings, weights);
    return { species: s, ratings, value: h.value, bestRole: h.role };
  };
  lineEntries.push(mkEntry(species, currentRatings.ratings));
  const raidDetails = new Map<string, RaidDetail>([[species.key, currentRatings.raidDetail]]);
  for (const d of ref.descendantsOf(species.key)) {
    const r = ratingsFor(ctx, d, k, { shadow: p.shadow, fastMove: null, chargedMove1: null });
    lineEntries.push(mkEntry(d, r.ratings));
    raidDetails.set(d.key, r.raidDetail);
  }
  const cur = lineEntries[0];
  let bestInLine: LineEntry | null = null;
  for (const e of lineEntries) if (e.value !== null && (!bestInLine || (e.value ?? 0) > (bestInLine.value ?? 0))) bestInLine = e;

  const analysis: PokemonAnalysis = {
    pokemon: p,
    species,
    knowledge: k,
    ivPercent: k.ivs ? ivPercent(k.ivs) : null,
    ratings: currentRatings.ratings,
    line: lineEntries,
    bestInLine,
    evidence: [],
    verdict: placeholderVerdict(),
    betterOwned: [],
    datasetVersion: ctx.datasetVersion,
  };

  decide(ctx, analysis, weights, cur, bestInLine, raidDetails, peers, currentRatings.assessments);
  return analysis;
}

function placeholderVerdict(): Verdict {
  return {
    action: 'MORE_INFO',
    headline: 'MORE INFORMATION NEEDED',
    priority: 5,
    impact: 0,
    efficiency: 0,
    when: 'needs-data',
    expectedBenefit: '',
    cost: { ...ZERO_COST },
    affordable: null,
    explanation: '',
    alternative: null,
    confidence: 'low',
    role: null,
    targetSpeciesKey: null,
    targetLevel: null,
  };
}

function setVerdict(
  a: PokemonAnalysis,
  ctx: AnalysisContext,
  v: Partial<Verdict> & Pick<Verdict, 'action' | 'headline' | 'explanation'>,
) {
  const base = placeholderVerdict();
  const cost = v.cost ?? base.cost;
  const impact = v.impact ?? 0;
  const merged: Verdict = {
    ...base,
    ...v,
    cost,
    impact,
    efficiency: Math.round((impact / (1 + cost.stardust / 50000)) * 10) / 10,
    priority: v.priority ?? priorityFromImpact(impact),
    affordable: v.affordable !== undefined ? v.affordable : affordability(ctx, cost),
  };
  if (merged.confidence !== 'high' && a.knowledge.note && merged.action !== 'MORE_INFO') {
    merged.explanation = `${merged.explanation.trim()} Confidence ${merged.confidence}: ${a.knowledge.note}`;
  }
  a.verdict = merged;
}

function pickConfidence(a: PokemonAnalysis, role: RoleId | null): Verdict['confidence'] {
  if (!role) return 'low';
  const r = a.ratings[role];
  if (a.knowledge.status === 'exact' && !r.uncertain && r.basis !== 'estimate') return 'high';
  if (a.knowledge.status === 'exact' || (a.knowledge.ivsKnown && r.basis !== 'estimate')) return 'medium';
  return 'low';
}

function decide(
  ctx: AnalysisContext,
  a: PokemonAnalysis,
  weights: Record<RoleId, number>,
  cur: LineEntry,
  best: LineEntry | null,
  raidDetails: Map<string, RaidDetail>,
  peers: PeerIndex | undefined,
  assessments: Record<"great" | "ultra" | "master", LeagueAssessment>,
) {
  const { ref } = ctx;
  const p = a.pokemon;
  const k = a.knowledge;
  const species = a.species;
  const name = speciesDisplayName(species);
  const evidence: string[] = [];
  a.evidence = evidence;

  // ---------- not enough information -------------------------------------------------------------
  if (k.status === 'inconsistent') {
    evidence.push(k.note ?? 'Entered values are inconsistent.');
    setVerdict(a, ctx, {
      action: 'MORE_INFO',
      headline: 'CHECK THE ENTERED VALUES',
      explanation: `${k.note} Fix the CP/HP/IV values and the recommendation will update.`,
      when: 'needs-data',
      confidence: 'low',
    });
    return;
  }
  if (k.candidates.length === 0 || !best) {
    const idx = bestSpeciesCeiling(ref, species);
    evidence.push(k.note ?? 'No CP, level or IVs entered.');
    setVerdict(a, ctx, {
      action: 'MORE_INFO',
      headline: 'MORE INFORMATION NEEDED',
      explanation:
        `I can't judge this ${name} without its CP or IVs.` +
        (idx ? ` For reference, a maxed (15/15/15, L40) ${idx.name} ranks about #${idx.rank} of ${idx.total} species for raids by the damage model.` : '') +
        ' Add CP and the appraisal IVs (or import a screenshot) for a personalised verdict.',
      when: 'needs-data',
      confidence: 'low',
    });
    return;
  }

  // ---------- evidence ---------------------------------------------------------------------------
  evidence.push(
    k.ivs
      ? `IVs ${ivLabel(k)} — ${ivStars(k.ivs)}★ appraisal. IV% measures stat luck, not how useful the species is.`
      : `IVs unknown — ${k.candidates.length} (IV, level) combinations fit the entered CP.`,
  );
  if (k.level != null) evidence.push(`Level ${k.level}${p.cp ? `, CP ${p.cp}` : ''}.`);
  else if (k.note) evidence.push(k.note);

  const raidRow = cur.ratings.raid;
  if (raidRow.potential !== null) evidence.push(`Raid: ${raidRow.detail} → ${tierWord(raidRow)} (potential ${pctTxt(raidRow.potential)}/100${raidRow.now !== null ? `, now ${pctTxt(raidRow.now)}` : ''}).`);
  (['great', 'ultra', 'master'] as const).forEach((r) => {
    const row = cur.ratings[r];
    if (row.potential !== null) evidence.push(`${ROLE_LABEL[r]}: ${pctTxt(row.potential)}/100 (${row.detail}).`);
  });

  // ---------- better alternatives already owned ---------------------------------------------------
  const bestRole: RoleId | null = best.bestRole;
  const bestRoleRating = bestRole ? best.ratings[bestRole] : null;
  const raw = bestRoleRating?.potential ?? 0;
  if (peers && bestRole) {
    const mine = a.ratings[bestRole].potential ?? 0;
    const myRaidType = raidDetails.get(species.key)?.typeRank?.type ?? null;
    const better: PokemonAnalysis['betterOwned'] = [];
    for (const peer of peers.values()) {
      if (peer.pokemon.id === p.id) continue;
      const pp = peer.ratings[bestRole].potential;
      if (pp === null) continue;
      const sameSlot =
        bestRole === 'raid' ? myRaidType !== null && peer.raidType === myRaidType : peer.species.speciesId === species.speciesId;
      if (sameSlot && pp >= mine + (bestRole === 'raid' ? 2 : 4)) better.push({ pokemon: peer.pokemon, species: peer.species, score: pp });
    }
    better.sort((x, y) => y.score - x.score);
    a.betterOwned = better.slice(0, 5);
  }

  // ---------- resources/cost helpers -------------------------------------------------------------
  const level = k.level;
  const maxLvl = maxLevelForTrainer(ctx.trainerLevel);
  const familyId = species.familyId;
  const powerCost = (toLevel: number): Cost => {
    if (level == null || level >= toLevel) return { ...ZERO_COST, familyId };
    const c = powerUpCost(ref, level, Math.min(toLevel, 50), p);
    return { stardust: c.stardust, candy: c.candy, xlCandy: c.xlCandy, familyId, extras: [] };
  };
  const stardustBal = ctx.resources.stardust;

  // ---------- evolution decision ----------------------------------------------------------------
  const evolveGain = best.species.key !== species.key ? (best.value ?? 0) - (cur.value ?? 0) : 0;
  const path = best.species.key !== species.key ? evolutionPath(ref, species.key, best.species.key) : null;
  const stepEdge = path && path.length ? path[0] : null;
  const rawBestLine = headlineValue(best.ratings, { raid: 1, gymAttack: 1, gymDefense: 1, great: 1, ultra: 1, master: 1 }).raw ?? 0;
  const rawCur = headlineValue(cur.ratings, { raid: 1, gymAttack: 1, gymDefense: 1, great: 1, ultra: 1, master: 1 }).raw ?? 0;

  // ---------- redundancy -------------------------------------------------------------------------
  const redundant = a.betterOwned.length >= (bestRole === 'raid' ? 3 : 1);
  if (a.betterOwned.length > 0 && bestRole) {
    const names = a.betterOwned.slice(0, 3).map((b) => `${speciesDisplayName(b.species)}${b.pokemon.cp ? ` (CP ${b.pokemon.cp})` : ''}`);
    evidence.push(`You already own ${a.betterOwned.length} stronger option${a.betterOwned.length > 1 ? 's' : ''} for ${ROLE_LABEL[bestRole]}: ${names.join(', ')}.`);
  }

  const confidence = pickConfidence(a, bestRole);

  // ====== 1. EVOLVE =====================================================================================
  if (stepEdge && evolveGain >= 8 && rawBestLine >= 55 && best.bestRole) {
    const target = ref.getByKey(stepEdge.toKey);
    const candyCostPath = (path ?? []).reduce((s, e) => s + e.candy, 0);
    const candyBal = ctx.resources.candy(familyId);
    const cost: Cost = { stardust: 0, candy: stepEdge.candy, xlCandy: 0, familyId, extras: [] };
    const conditions = describeRequirements(stepEdge).slice(1);
    cost.extras = conditions;
    const finalName = speciesDisplayName(best.species);
    const finalRole = best.bestRole;
    const detail = raidDetails.get(best.species.key);
    const eliteUplift = detail && detail.potentialWithElite !== null && detail.potentialNonElite !== null ? detail.potentialWithElite - detail.potentialNonElite : 0;
    const eliteNeeded = finalRole === 'raid' && eliteUplift >= 12 && detail?.bestMoveset?.elite;
    const ownsEliteTm = (ctx.resources.get('elite_charged_tm') ?? 0) + (ctx.resources.get('elite_fast_tm') ?? 0) > 0;
    evidence.push(
      `${finalName} potential for ${ROLE_LABEL[finalRole]} is ${pctTxt(best.ratings[finalRole].potential ?? 0)}/100 vs ${pctTxt(cur.ratings[finalRole].potential ?? 0)}/100 for ${name} (same IVs).`,
    );
    if (path && path.length > 1) evidence.push(`Full path to ${finalName}: ${path.length} evolutions, ${fmt(candyCostPath)} Candy total.`);
    const impact = evolveGain * weights[finalRole];

    if (eliteNeeded && !ownsEliteTm) {
      setVerdict(a, ctx, {
        action: 'WAIT_FOR_EVENT',
        headline: 'WAIT FOR AN EVENT, THEN EVOLVE',
        explanation:
          `${finalName}'s best raid moveset (${detail?.bestMoveset?.fast} + ${detail?.bestMoveset?.charged}) includes an Elite/legacy move that the data lists as not freely learnable, ` +
          `worth about +${Math.round(eliteUplift)} raid points over its best regular moveset. Evolving ${name} during a limited-time event that teaches it (or with an Elite TM) is far cheaper than doing it later. ` +
          `I can't see live event schedules — check the in-game news before you evolve.`,
        expectedBenefit: `${tierWord(best.ratings[finalRole])} ${finalName} instead of ${tierWord(cur.ratings[finalRole])}`,
        cost,
        impact: impact * 0.8,
        when: 'later',
        role: finalRole,
        targetSpeciesKey: target?.key ?? null,
        alternative: `Evolve now for ${costText(cost)} and use an Elite Charged TM later.`,
        confidence,
      });
      return;
    }

    const afford = affordability(ctx, cost);
    const short = shortfallText(ctx, cost);
    const timing: When = afford === false ? 'later' : 'now';
    setVerdict(a, ctx, {
      action: 'EVOLVE',
      headline: afford === false ? 'EVOLVE — SAVE CANDY FIRST' : 'EVOLVE NOW',
      explanation:
        `${name} itself rates ${tierWord(cur.ratings[finalRole])} for ${ROLE_LABEL[finalRole]}, but its evolution ${finalName} reaches ${tierWord(best.ratings[finalRole])} with these IVs. ` +
        `${afford === false ? `You need ${short} before evolving. ` : ''}` +
        `${conditions.length ? `Requirements: ${conditions.join(', ')}. ` : ''}` +
        `${candyBal !== null ? `You have ${fmt(candyBal)} ${species.name} Candy. ` : 'Enter your Candy to check affordability. '}` +
        `Evolve before powering up so Stardust only goes into the stronger form.`,
      expectedBenefit: `${finalRole === 'raid' ? 'Raid' : ROLE_LABEL[finalRole]} potential ${pctTxt(cur.ratings[finalRole].potential ?? 0)} → ${pctTxt(best.ratings[finalRole].potential ?? 0)}`,
      cost,
      impact,
      when: timing,
      role: finalRole,
      targetSpeciesKey: target?.key ?? null,
      alternative: afford === false ? `Keep ${name} and gather Candy (walk it as a buddy, catch more ${species.name}).` : redundant ? 'You already own comparable options — consider skipping.' : null,
      confidence,
    });
    return;
  }

  // From here the current species is the right form to build (or no evolution gain).
  // Choose the role to build for. Highest goal-weighted potential wins, but expensive builds are
  // penalised (up to 20 points at ~300k Stardust) so a nearly-as-good, already-built role is preferred.
  const stardustPenalty = (r: RoleId): number => {
    const row = a.ratings[r];
    const tl = row.targetLevel;
    if (level == null || tl == null || r === 'gymAttack' || r === 'gymDefense') return 0;
    const target = r === 'raid' ? Math.min(40, maxLvl) : r === 'master' ? Math.min(50, maxLvl) : tl;
    return Math.min(20, powerCost(target).stardust / 15000);
  };
  let role: RoleId | null = bestRole;
  if (bestRole) {
    let bestAdj = -Infinity;
    for (const r of ['raid', 'great', 'ultra', 'master'] as const) {
      const pot = a.ratings[r].potential;
      if (pot === null) continue;
      const adj = pot * weights[r] - stardustPenalty(r);
      if (adj > bestAdj) {
        bestAdj = adj;
        role = r;
      }
    }
  }
  if (!role || !bestRoleRating) {
    setVerdict(a, ctx, {
      action: 'MORE_INFO',
      headline: 'MORE INFORMATION NEEDED',
      explanation: 'Not enough data to rate this Pokémon for any role yet.',
      when: 'needs-data',
      confidence: 'low',
    });
    return;
  }
  if (role !== bestRole && bestRole) evidence.push(`Chose ${ROLE_LABEL[role]} over ${ROLE_LABEL[bestRole]}: nearly as strong and far cheaper to build.`);
  const roleRow = a.ratings[role];
  const potential = roleRow.potential ?? 0;
  const nowScore = roleRow.now;
  const league = leagueOf(role);
  const targetLevel = roleRow.targetLevel;
  const rawAny = Math.max(rawCur, raw);

  // ====== 2. weak across the board ================================================================
  if (rawAny < 45 && potential < 45) {
    const duplicates = ctx.collection.filter(
      (o) => o.id !== p.id && o.speciesId === p.speciesId && o.form === p.form && !o.deletedAt,
    ).length;
    const protectedMon = p.favorite || p.shiny || p.lucky || p.shadow || p.purified || species.rarity !== 'standard';
    const ivHigh = k.ivs ? ivPercent(k.ivs) >= 93 : false;
    evidence.push(`Best role score ${pctTxt(rawAny)}/100 — below the threshold where Stardust pays off.`);
    if (ivHigh) evidence.push('Its IVs are excellent, but IVs cannot make up for the species/moveset — a high IV% on a weak species is still a weak investment.');
    if (!protectedMon && duplicates > 0 && !ivHigh && (k.ivs ? ivPercent(k.ivs) < 80 : false)) {
      setVerdict(a, ctx, {
        action: 'CONSIDER_TRANSFER',
        headline: 'CONSIDER TRANSFER',
        explanation: `Not competitive in raids or PvP (${pctTxt(rawAny)}/100 at best), IVs are below average, and you own ${duplicates} other ${name}. Keep one for the Pokédex/Candy; transferring spares also gives Candy.`,
        expectedBenefit: 'Frees storage and earns Candy',
        when: 'now',
        impact: 0,
        priority: 5,
        confidence,
        role,
      });
      return;
    }
    setVerdict(a, ctx, {
      action: 'DONT_INVEST',
      headline: "DON'T SPEND STARDUST YET",
      explanation: `${name} tops out at ${pctTxt(rawAny)}/100 for ${ROLE_LABEL[role]}. ${ivHigh ? 'Perfect-looking IVs do not change that. ' : ''}Spend Stardust on a Pokémon that rates B-tier or higher for your goals instead.`,
      expectedBenefit: 'Saves Stardust for a stronger target',
      when: 'never',
      impact: 0,
      priority: 5,
      confidence,
      role,
      alternative: 'Use it as a placeholder/for Pokédex and Candy farming.',
    });
    return;
  }

  // ====== 3. change moves ========================================================================
  const rd = raidDetails.get(species.key);
  if (role === 'raid' && rd && rd.currentMoveset && !rd.movesAssumed && rd.bestNonElite && potential >= 60) {
    const cm = rd.currentMoveset;
    const bm = rd.bestNonElite;
    const sameMoves = cm.fast === bm.fast && cm.charged === bm.charged;
    const bestEliteGain = (rd.potentialWithElite ?? 0) - (a.ratings.raid.potential ?? 0);
    const regularGain = (rd.potentialNonElite ?? 0) - (a.ratings.raid.potential ?? 0);
    if (!sameMoves && regularGain >= 4) {
      const needFast = cm.fast !== bm.fast;
      const needCharged = cm.charged !== bm.charged;
      const extras = [needFast ? 'Fast TM' : null, needCharged ? 'Charged TM' : null].filter((x): x is string => !!x);
      const cost: Cost = { ...ZERO_COST, familyId, extras };
      const impact = regularGain * weights.raid;
      evidence.push(`Current moves ${cm.fast} + ${cm.charged}; best regular moves ${bm.fast} + ${bm.charged}.`);
      setVerdict(a, ctx, {
        action: 'CHANGE_MOVES',
        headline: 'CHANGE MOVES',
        explanation: `${name} is already a strong ${ROLE_LABEL.raid.toLowerCase()} candidate, but ${bm.fast} + ${bm.charged} would raise its estimated raid score by ~${Math.round(regularGain)} points over ${cm.fast} + ${cm.charged}. ${bestEliteGain - regularGain >= 5 && rd.bestMoveset?.elite ? `An Elite TM move (${rd.bestMoveset.fast} + ${rd.bestMoveset.charged}) would add roughly ${Math.round(bestEliteGain - regularGain)} more.` : ''}`,
        expectedBenefit: `Raid potential ${pctTxt(a.ratings.raid.potential ?? 0)} → ${pctTxt(rd.potentialNonElite ?? 0)}`,
        cost,
        impact,
        affordable: ctx.resources.get(needCharged ? 'charged_tm' : 'fast_tm') === null ? null : (ctx.resources.get(needCharged ? 'charged_tm' : 'fast_tm') ?? 0) > 0,
        when: 'now',
        role: 'raid',
        confidence,
        alternative: 'Skip the TM if you already own a better counter of this type.',
      });
      return;
    }
  }

  // ====== 4. PvP-specialised =====================================================================
  if (league) {
    const lr = a.ratings[role];
    const assess = assessments[league];
    const raidPot = a.ratings.raid.potential ?? 0;
    const rankLine = assess?.entry ? `IV rank #${assess.entry.rank} of 4096` : assess?.rankRange ? `IV rank #${assess.rankRange.min}–#${assess.rankRange.max}` : 'IV rank unknown';
    const cost = powerCost(targetLevel ?? 0);
    const built = nowScore !== null && potential - nowScore < 4;
    const gain = Math.max(0, potential - (nowScore ?? potential * 0.5));
    const otherPvp = raidPot >= 70 ? ` It also rates ${pctTxt(raidPot)}/100 for raids, so choose one build.` : '';
    if (potential >= 55) {
      if (built) {
        setVerdict(a, ctx, {
          action: 'KEEP',
          headline: `READY FOR ${ROLE_LABEL[role].toUpperCase()}`,
          explanation: `${name} is already at its ${ROLE_LABEL[role]} level (${rankLine}). No further Stardust needed — use it as is.${otherPvp}`,
          expectedBenefit: `${ROLE_LABEL[role]} suitability ${pctTxt(potential)}/100`,
          when: 'never',
          impact: 0,
          priority: 4,
          role,
          confidence,
        });
        return;
      }
      const better = a.betterOwned[0];
      if (better && better.score >= potential + 4) {
        setVerdict(a, ctx, {
          action: 'KEEP',
          headline: `KEEP — A BETTER ${species.name.toUpperCase()} IS OWNED`,
          explanation: `${name} would rate ${tierWord(lr)} for ${ROLE_LABEL[role]} (${rankLine}), but you already own ${/^[aeiou]/i.test(species.name) ? 'an' : 'a'} ${species.name} that rates ${pctTxt(better.score)}/100 for the same league. Build that one instead and keep this as a backup.`,
          expectedBenefit: 'Avoids duplicate investment',
          when: 'never',
          impact: 0,
          priority: 5,
          role,
          confidence,
          alternative: 'Only invest here if you want a second specimen for a second team.',
        });
        return;
      }
      const afford = affordability(ctx, cost);
      const heavy = stardustBal !== null && cost.stardust > stardustBal * 0.5;
      // Cheaper option: stop at level 40 (no Candy XL needed) when the league level is above 40.
      let level40Note = '';
      if (assess?.entry && assess.entry.level > 40 && assess.best) {
        const e40 = rankIvs(ref, species, assess.cap, 40).lookup(assess.entry.ivs);
        if (e40) {
          const keep = (e40.product / assess.entry.product) * 100;
          const c40 = powerCost(40);
          level40Note = ` Stopping at level 40 (CP ${e40.cp}) keeps ${keep.toFixed(1)}% of the stat product and avoids ${fmt(Math.max(0, cost.xlCandy - c40.xlCandy))} Candy XL.`;
        }
      }
      setVerdict(a, ctx, {
        action: 'SAVE_FOR_PVP',
        headline: heavy || afford === false ? 'SAVE FOR PVP — INVEST LATER' : `BUILD FOR ${ROLE_LABEL[role].toUpperCase()}`,
        explanation:
          `${name} rates ${tierWord(lr)} for ${ROLE_LABEL[role]} (${lr.detail}). ` +
          `Power it to level ${targetLevel} (CP cap) — ${costText(cost)}. ` +
          `${afford === false ? `You still need ${shortfallText(ctx, cost)}. ` : heavy ? 'That is over half of your current Stardust, so wait unless this is your main team. ' : ''}` +
          `Do not power it past the CP cap.${level40Note}${otherPvp}`,
        expectedBenefit: `${ROLE_LABEL[role]} suitability ${nowScore !== null ? pctTxt(nowScore) : '?'} → ${pctTxt(potential)}/100`,
        cost,
        impact: gain * weights[role],
        when: afford === false || heavy ? 'later' : 'now',
        role,
        targetLevel,
        confidence,
        alternative: 'Use a cheaper PvP specimen if you own one with a better IV rank.',
      });
      return;
    }
  }

  // ====== 5. raid / gym development ==============================================================
  if (role === 'raid' || role === 'master') {
    const target = Math.min(role === 'master' ? 50 : 40, maxLvl);
    const cost = powerCost(target);
    const gain = Math.max(0, potential - (nowScore ?? potential * 0.5));
    const strong = potential >= 80;
    if (redundant && potential < 90) {
      setVerdict(a, ctx, {
        action: 'KEEP',
        headline: 'KEEP — BETTER OPTIONS OWNED',
        explanation: `${name} is a decent ${ROLE_LABEL[role].toLowerCase()} (${tierWord(roleRow)}), but you already own stronger Pokémon for the same job. Put Stardust into those first.`,
        expectedBenefit: 'Avoids duplicate investment',
        when: 'never',
        impact: 0,
        priority: 5,
        role,
        confidence,
        alternative: a.betterOwned[0] ? `Power up your ${speciesDisplayName(a.betterOwned[0].species)} instead.` : null,
      });
      return;
    }
    if (level != null && level >= target - 1e-9) {
      setVerdict(a, ctx, {
        action: 'KEEP',
        headline: 'KEEP — ALREADY BUILT',
        explanation: `${name} is at level ${level} (target ${target}) and rates ${tierWord(roleRow)} for ${ROLE_LABEL[role]}. Use it; extra levels need Candy XL and give diminishing returns.`,
        expectedBenefit: `${ROLE_LABEL[role]} score ${pctTxt(nowScore ?? potential)}/100`,
        when: 'never',
        impact: 0,
        priority: 4,
        role,
        confidence,
      });
      return;
    }
    if (level == null) {
      setVerdict(a, ctx, {
        action: 'MORE_INFO',
        headline: strong ? 'PROMISING — ADD ITS LEVEL' : 'MORE INFORMATION NEEDED',
        explanation: `${name} could rate ${tierWord(roleRow)} for ${ROLE_LABEL[role]} once developed, but its current level is unknown${k.levelOptions.length ? ` (could be ${k.levelOptions.join(' or ')})` : ''}, so I can't price the power-up. Add its HP or level.`,
        expectedBenefit: `Potential ${pctTxt(potential)}/100`,
        when: 'needs-data',
        impact: potential * 0.1 * weights[role],
        role,
        confidence: 'low',
      });
      return;
    }
    const afford = affordability(ctx, cost);
    const heavy = stardustBal !== null && cost.stardust > stardustBal * 0.5;
    const iv = k.ivs ? ivPercent(k.ivs) : null;
    // Relative improvement of the raw model score (more meaningful than percentile points near the top).
    const relGain =
      roleRow.rawNow != null && roleRow.rawPotential != null && roleRow.rawNow > 0
        ? (roleRow.rawPotential / roleRow.rawNow - 1) * 100
        : null;
    const tierRank = roleRow.tier ? 'SABCD'.indexOf(roleRow.tier) : 4;
    // Worth the Stardust: S/A-tier needs ≥ 8 % score gain, B-tier ≥ 25 %, anything lower needs a huge jump.
    const minRel = tierRank <= 1 ? 8 : tierRank === 2 ? 25 : 60;
    const adjGain = gain + 0.25 * Math.min(relGain ?? 0, 100);
    if (role === 'raid' && relGain !== null && relGain < minRel && nowScore !== null) {
      setVerdict(a, ctx, {
        action: 'KEEP',
        headline: 'KEEP — DIMINISHING RETURNS',
        explanation: `${name} already rates ${tierWord(roleRow)} for ${ROLE_LABEL[role]} (${pctTxt(nowScore)}/100 now). Powering it from level ${level} to ${target} would raise its estimated raid score by only ~${relGain.toFixed(0)}% for ${costText(cost)} — not worth the Stardust.`,
        expectedBenefit: `+${relGain.toFixed(0)}% estimated raid score`,
        when: 'never',
        impact: 0,
        priority: 5,
        role,
        confidence,
        cost,
      });
      return;
    }
    if (potential < 60) {
      evidence.push(`Potential ${pctTxt(potential)}/100 for ${ROLE_LABEL[role]} — moderate at best.`);
      setVerdict(a, ctx, {
        action: 'KEEP',
        headline: 'KEEP, DON\'T POWER UP YET',
        explanation: `${name} reaches only ${pctTxt(potential)}/100 for ${ROLE_LABEL[role]} at level ${target}. Powering it to ${target} costs ${costText(cost)}${iv !== null ? ` for ${pctTxt(iv)}% IVs` : ''}. Only invest if you lack better options for this type.`,
        expectedBenefit: `+${pctTxt(gain)} points (est.)`,
        cost,
        impact: adjGain * weights[role] * 0.4,
        when: 'later',
        role,
        confidence,
        targetLevel: target,
      });
      return;
    }
    const nowNote = nowScore !== null ? `${pctTxt(nowScore)} now` : 'unknown now';
    setVerdict(a, ctx, {
      action: 'POWER_UP',
      headline: heavy ? 'KEEP AND INVEST LATER' : afford === false ? 'POWER UP — SAVE RESOURCES' : strong ? 'POWER UP NOW' : 'POWER UP WHEN CONVENIENT',
      explanation:
        `${name} rates ${tierWord(roleRow)} for ${ROLE_LABEL[role]} (${roleRow.detail}); it is ${nowNote} and reaches ${pctTxt(potential)}/100 at level ${target}. ` +
        `Cost from level ${level}: ${costText(cost)}. ` +
        `${afford === false ? `You still need ${shortfallText(ctx, cost)}. ` : ''}` +
        `${heavy ? 'This would use a large share of your Stardust — save it until your raid team needs this type. ' : ''}` +
        `${level + 10 < target ? 'Because it is far below target, power it in stages and re-check after each milestone. ' : ''}`,
      expectedBenefit: `${ROLE_LABEL[role]} score ${nowScore !== null ? pctTxt(nowScore) : '?'} → ${pctTxt(potential)}/100${relGain !== null ? ` (+${relGain.toFixed(0)}% est. raid score)` : ''}`,
      cost,
      impact: adjGain * weights[role],
      when: afford === false || heavy ? 'later' : 'now',
      role,
      targetLevel: target,
      confidence,
      alternative: redundant ? 'You already own comparable attackers.' : stardustBal === null ? 'Enter your Stardust in Resources to check affordability.' : null,
    });
    return;
  }

  // ====== 6. everything else: keep =================================================================
  setVerdict(a, ctx, {
    action: 'KEEP',
    headline: 'KEEP',
    explanation: `${name} is a usable ${ROLE_LABEL[role]} option (${pctTxt(potential)}/100) but no investment stands out right now.`,
    expectedBenefit: '',
    when: 'never',
    impact: 0,
    priority: 5,
    role,
    confidence,
  });
}

function bestSpeciesCeiling(ref: ReferenceData, species: GoSpecies) {
  const r = getRaidIndex(ref).rankOf(species.key);
  return r ? { name: species.name, rank: r.overall, total: r.overallTotal } : null;
}
