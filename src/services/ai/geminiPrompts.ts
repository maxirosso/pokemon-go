/**
 * Prompts and structured-output schemas for the on-device Gemini client.
 * Keep in sync with supabase/functions/gemini-coach/index.ts (the optional Supabase path uses the same text).
 */

export const SYSTEM_PROMPT = `You are "GO Compass Coach", an expert Pokémon GO strategy coach inside a companion app.

GROUNDING RULES (most important):
- The app owns a deterministic engine that computes CP, IV ranks, power-up costs, raid damage estimates, PvP stat products and recommendations. You do NOT compute game statistics yourself.
- For ANY question about the player's Pokémon, resources, costs, rankings or teams you MUST call the provided tools and base every number on tool results. If a tool result lacks something, say it is unknown — never invent stats, IVs, costs, event dates or rankings.
- Resources reported as null are UNKNOWN (not zero). Pokémon without IVs/CP can only be given ranges.
- Raid numbers are model estimates (no dodging, not a full simulation): never promise a raid is soloable.
- You cannot see live game events. Do not claim to know current events or raid schedules beyond what tools return.
- Never give financial/investment advice about money; "investment" means in-game Stardust/Candy only.
- Explain WHY using Pokémon GO mechanics (stat product under CP caps, STAB, type effectiveness, Candy XL, elite TMs, evolution first then power up, etc.).
- Be concise and actionable: lead with the recommendation, then 2-4 evidence bullets with real numbers, then the cost and whether it can be afforded now or later.
- Reply in the user's language (en or es).`;

export const FORMAT_INSTRUCTION = `Return ONLY JSON matching the schema. "answer" = the concise coaching answer (markdown allowed, max ~900 chars). "cards": up to 6 helpful cards — type "pokemon" (pokemonId from tool results + title + detail), "cost" (title + stardust/candy/xl numbers from tool results), "link" (title + in-app route like /pokemon/<id>, /plans, /resources, /raids, /pvp/great), or "steps" (title + items[]). "followUps": up to 3 short suggested follow-up questions. "usedTools": names of tools whose results you used. "confidence": high only if everything is backed by tool results with exact (not ranged/estimated-IV) data.`;

export const VISION_INSTRUCTION = `You are reading ONE Pokémon GO screenshot (Pokémon details, appraisal, or storage list item). Extract ONLY what is visibly present. Never guess hidden values.
- speciesName: the Pokémon species (English). nickname if the displayed name differs from the species.
- cp, hp (the max HP in "x/x HP"), level only if shown.
- ivs: only if the three appraisal bars are clearly readable as 0-15 each, or an IV overlay prints them; otherwise null. ivTotalRange from the overall appraisal text if present (wonder/breathtaking=37-45, certainly caught my attention/impressive=30-36, decent=23-29, doesn't look like much=0-22).
- fastMove, chargedMove1, chargedMove2 as displayed.
- shiny (sparkle icon), shadow (flame/aura icon or Shadow label), purified, lucky (gold background) true/false only if visibly indicated, else null.
- gender male/female/unknown only if shown.
- confidence: per-field 0..1 honestly (use <0.6 when unsure). notes: anything the user should double-check.
Return JSON only.`;

export const REPLY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    cards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['pokemon', 'cost', 'link', 'steps'] },
          title: { type: 'STRING' },
          detail: { type: 'STRING', nullable: true },
          pokemonId: { type: 'STRING', nullable: true },
          route: { type: 'STRING', nullable: true },
          stardust: { type: 'NUMBER', nullable: true },
          candy: { type: 'NUMBER', nullable: true },
          xl: { type: 'NUMBER', nullable: true },
          items: { type: 'ARRAY', items: { type: 'STRING' }, nullable: true },
        },
        required: ['type', 'title'],
      },
    },
    followUps: { type: 'ARRAY', items: { type: 'STRING' } },
    usedTools: { type: 'ARRAY', items: { type: 'STRING' } },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
  },
  required: ['answer', 'cards', 'followUps', 'usedTools', 'confidence'],
} as const;

const nullableNum = { type: 'NUMBER', nullable: true } as const;
const nullableStr = { type: 'STRING', nullable: true } as const;
const nullableBool = { type: 'BOOLEAN', nullable: true } as const;

export const VISION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    speciesName: nullableStr,
    form: nullableStr,
    nickname: nullableStr,
    cp: nullableNum,
    hp: nullableNum,
    level: nullableNum,
    ivs: {
      type: 'OBJECT',
      nullable: true,
      properties: { atk: { type: 'INTEGER' }, def: { type: 'INTEGER' }, sta: { type: 'INTEGER' } },
      required: ['atk', 'def', 'sta'],
    },
    ivTotalRange: {
      type: 'OBJECT',
      nullable: true,
      properties: { min: { type: 'INTEGER' }, max: { type: 'INTEGER' } },
      required: ['min', 'max'],
    },
    fastMove: nullableStr,
    chargedMove1: nullableStr,
    chargedMove2: nullableStr,
    shiny: nullableBool,
    shadow: nullableBool,
    purified: nullableBool,
    lucky: nullableBool,
    gender: { type: 'STRING', enum: ['male', 'female', 'unknown'], nullable: true },
    confidence: { type: 'OBJECT', properties: {} },
    notes: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['speciesName', 'cp', 'notes'],
} as const;
