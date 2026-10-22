// Supabase Edge Function: gemini-coach
//
// The ONLY place the Gemini API key exists (secret GEMINI_API_KEY). The mobile app never sees it.
//
//  - verifies the caller's Supabase JWT (guest = anonymous auth user)
//  - enforces per-user rate limits (hourly + daily) through the consume_ai_quota() SQL function
//  - validates and size-limits the request
//  - builds the Gemini request (system prompt, tool declarations, schema-constrained JSON for "format"/"vision")
//  - returns only the model content + quota info
//
// Deploy:  supabase functions deploy gemini-coach
// Secrets: supabase secrets set GEMINI_API_KEY=... [GEMINI_MODEL=gemini-2.5-flash] [AI_HOURLY_LIMIT=20] [AI_DAILY_LIMIT=120]

import { createClient } from 'jsr:@supabase/supabase-js@2';
import tools from '../_shared/tools.json' with { type: 'json' };

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
const FALLBACK_MODEL = Deno.env.get('GEMINI_FALLBACK_MODEL') ?? 'gemini-2.5-flash-lite';
const HOURLY = Number(Deno.env.get('AI_HOURLY_LIMIT') ?? '20');
const DAILY = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '120');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_CONTENTS = 40;
const MAX_TEXT_CHARS = 60_000;
const MAX_IMAGE_BASE64 = 4 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } });

// ---------------------------------------------------------------------------------------------------------
// prompts
// ---------------------------------------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are "GO Compass Coach", an expert Pokémon GO strategy coach inside a companion app.

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

const FORMAT_INSTRUCTION = `Return ONLY JSON matching the schema. "answer" = the concise coaching answer (markdown allowed, max ~900 chars). "cards": up to 6 helpful cards — type "pokemon" (pokemonId from tool results + title + detail), "cost" (title + stardust/candy/xl numbers from tool results), "link" (title + in-app route like /pokemon/<id>, /plans, /resources, /raids, /pvp/great), or "steps" (title + items[]). "followUps": up to 3 short suggested follow-up questions. "usedTools": names of tools whose results you used. "confidence": high only if everything is backed by tool results with exact (not ranged/estimated-IV) data.`;

const VISION_INSTRUCTION = `You are reading ONE Pokémon GO screenshot (Pokémon details, appraisal, or storage list item). Extract ONLY what is visibly present. Never guess hidden values.
- speciesName: the Pokémon species (English). nickname if the displayed name differs from the species.
- cp, hp (the max HP in "x/x HP"), level only if shown.
- ivs: only if the three appraisal bars are clearly readable as 0-15 each, or an IV overlay prints them; otherwise null. ivTotalRange from the overall appraisal text if present (wonder/breathtaking=37-45, certainly caught my attention/impressive=30-36, decent=23-29, doesn't look like much=0-22).
- fastMove, chargedMove1, chargedMove2 as displayed.
- shiny (sparkle icon), shadow (flame/aura icon or Shadow label), purified, lucky (gold background) true/false only if visibly indicated, else null.
- gender male/female/unknown only if shown.
- confidence: per-field 0..1 honestly (use <0.6 when unsure). notes: anything the user should double-check.
Return JSON only.`;

// ---------------------------------------------------------------------------------------------------------
// Gemini structured-output schemas (OpenAPI subset)
// ---------------------------------------------------------------------------------------------------------

const REPLY_SCHEMA = {
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
};

const nullableNum = { type: 'NUMBER', nullable: true };
const nullableStr = { type: 'STRING', nullable: true };
const nullableBool = { type: 'BOOLEAN', nullable: true };
const VISION_SCHEMA = {
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
};

// ---------------------------------------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------------------------------------

type Part = Record<string, unknown>;
interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

function validate(body: unknown): { mode: 'chat' | 'format' | 'vision'; contents: Content[]; locale: string } | string {
  if (!body || typeof body !== 'object') return 'Body must be an object';
  const b = body as { mode?: string; contents?: unknown; locale?: string };
  if (b.mode !== 'chat' && b.mode !== 'format' && b.mode !== 'vision') return 'Invalid mode';
  if (!Array.isArray(b.contents) || b.contents.length === 0 || b.contents.length > MAX_CONTENTS) return 'Invalid contents';
  let textChars = 0;
  const toolNames = new Set((tools as { name: string }[]).map((t) => t.name));
  for (const c of b.contents as Content[]) {
    if (!c || (c.role !== 'user' && c.role !== 'model') || !Array.isArray(c.parts) || c.parts.length === 0) return 'Invalid content entry';
    for (const p of c.parts) {
      if (typeof p.text === 'string') textChars += p.text.length;
      else if (p.functionCall) {
        const fc = p.functionCall as { name?: string };
        if (!fc.name || !toolNames.has(fc.name)) return 'Unknown tool in functionCall';
      } else if (p.functionResponse) {
        const fr = p.functionResponse as { name?: string };
        if (!fr.name || !toolNames.has(fr.name)) return 'Unknown tool in functionResponse';
        textChars += JSON.stringify(p.functionResponse).length;
      } else if (p.inlineData) {
        if (b.mode !== 'vision') return 'Images are only allowed in vision mode';
        const d = p.inlineData as { mimeType?: string; data?: string };
        if (!d.mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(d.mimeType)) return 'Unsupported image type';
        if (!d.data || d.data.length > MAX_IMAGE_BASE64) return 'Image too large';
      } else return 'Unsupported part';
    }
  }
  if (textChars > MAX_TEXT_CHARS) return 'Request too large';
  return { mode: b.mode, contents: b.contents as Content[], locale: b.locale === 'es' ? 'es' : 'en' };
}

// ---------------------------------------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------------------------------------

async function callGemini(model: string, payload: unknown): Promise<Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify(payload),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!GEMINI_API_KEY) return json({ error: 'AI backend is not configured (missing GEMINI_API_KEY secret).' }, 503);

  // ---- auth
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing bearer token' }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Invalid session' }, 401);
  const userId = userData.user.id;

  // ---- body
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Request too large' }, 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const v = validate(parsed);
  if (typeof v === 'string') return json({ error: v }, 400);

  // ---- rate limit (service role: the table has RLS enabled with no client policies)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: q, error: qErr } = await admin.rpc('consume_ai_quota', { p_user: userId, p_hour_limit: HOURLY, p_day_limit: DAILY });
  if (qErr) return json({ error: 'Quota check failed' }, 500);
  const quota = Array.isArray(q) ? q[0] : q;
  if (!quota?.allowed) {
    return json({ error: 'Rate limit reached', quota: { remainingHour: quota?.remaining_hour ?? 0, remainingDay: quota?.remaining_day ?? 0 } }, 429, {
      'Retry-After': String(quota?.retry_after ?? 600),
    });
  }

  // ---- Gemini request
  const generationConfig: Record<string, unknown> = { temperature: v.mode === 'vision' ? 0 : 0.3, maxOutputTokens: v.mode === 'chat' ? 1200 : 1500 };
  let systemText = `${SYSTEM_PROMPT}\nUser language: ${v.locale}.`;
  const payload: Record<string, unknown> = { contents: v.contents };
  if (v.mode === 'chat') {
    payload.tools = [{ functionDeclarations: tools }];
    payload.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
  } else if (v.mode === 'format') {
    systemText += `\n${FORMAT_INSTRUCTION}`;
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = REPLY_SCHEMA;
  } else {
    systemText = VISION_INSTRUCTION;
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = VISION_SCHEMA;
  }
  payload.systemInstruction = { parts: [{ text: systemText }] };
  payload.generationConfig = generationConfig;

  let model = MODEL;
  let res = await callGemini(model, payload);
  if ((res.status === 404 || res.status === 503) && FALLBACK_MODEL && FALLBACK_MODEL !== MODEL) {
    model = FALLBACK_MODEL;
    res = await callGemini(model, payload);
  }
  if (res.status === 429) {
    return json({ error: 'The Gemini free-tier quota is exhausted. Try again later.' }, 429, { 'Retry-After': res.headers.get('retry-after') ?? '60' });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('Gemini error', res.status, detail.slice(0, 500));
    return json({ error: `Gemini request failed (${res.status})` }, 502);
  }
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const content = candidate?.content ?? null;
  if (!content && data?.promptFeedback?.blockReason) return json({ error: `Blocked: ${data.promptFeedback.blockReason}` }, 422);
  return json({
    content,
    model,
    finishReason: candidate?.finishReason,
    quota: { remainingHour: quota.remaining_hour ?? null, remainingDay: quota.remaining_day ?? null },
  });
});
