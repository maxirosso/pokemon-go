import { executeTool, type ToolEnv } from '@/features/assistant/tools';
import { AI_CONFIG } from './config';
import { callCoach } from './gateway';
import { AiUnavailableError, coachReplySchema, sanitizeReply, type Content, type CoachReply, type Part } from './protocol';

export interface HistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface CoachResult {
  reply: CoachReply;
  toolTrace: { name: string; args: Record<string, unknown>; ok: boolean }[];
  model: string;
  quota?: { remainingHour: number | null; remainingDay: number | null };
}

const textOf = (c: Content | null): string => (c ? c.parts.map((p) => ('text' in p ? p.text : '')).join('').trim() : '');
const callsOf = (c: Content | null) => (c ? c.parts.flatMap((p) => ('functionCall' in p ? [p.functionCall] : [])) : []);

/** Tool results are capped so one huge answer cannot blow the model's context. */
function capResponse(result: unknown): Record<string, unknown> {
  const json = JSON.stringify(result);
  if (json.length <= 9000) return { result };
  return { truncated: true, partialJson: json.slice(0, 8500) };
}

/**
 * Grounded conversation loop:
 *   1. the model asks for tools; the app executes them locally (deterministic engine) and replies with the results;
 *   2. once the model has what it needs, a final call asks for a schema-validated JSON reply (answer + cards).
 * The player's collection never leaves the device except through the compact tool results the model requested.
 */
export async function askCoach(opts: {
  history: HistoryTurn[];
  question: string;
  env: ToolEnv;
  locale: 'en' | 'es';
  signal?: AbortSignal;
  onStep?: (label: string) => void;
}): Promise<CoachResult> {
  const { env, locale, question } = opts;
  const contents: Content[] = [];
  for (const t of opts.history.slice(-AI_CONFIG.maxHistoryTurns)) {
    contents.push({ role: t.role === 'user' ? 'user' : 'model', parts: [{ text: t.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: question }] });

  const trace: CoachResult['toolTrace'] = [];
  let model = '';
  let quota: CoachResult['quota'];
  let draft = '';

  for (let round = 0; round < AI_CONFIG.maxToolRounds; round += 1) {
    opts.onStep?.(round === 0 ? 'Thinking…' : 'Checking your data…');
    const res = await callCoach({ mode: 'chat', contents, locale }, opts.signal);
    model = res.model;
    quota = res.quota;
    if (!res.content) throw new AiUnavailableError('The AI returned an empty answer.', 'invalid-response');
    contents.push(res.content);
    const calls = callsOf(res.content);
    if (calls.length === 0) {
      draft = textOf(res.content);
      break;
    }
    const responses: Part[] = [];
    for (const call of calls) {
      opts.onStep?.(`Running ${call.name.replace(/_/g, ' ')}…`);
      const out = executeTool(env, call.name, call.args ?? {});
      trace.push({ name: call.name, args: call.args ?? {}, ok: out.ok });
      responses.push({ functionResponse: { name: call.name, response: out.ok ? capResponse(out.result) : { error: out.error } } });
    }
    contents.push({ role: 'user', parts: responses });
  }

  opts.onStep?.('Writing the answer…');
  contents.push({
    role: 'user',
    parts: [
      {
        text:
          'Now give the final reply as JSON only. Use ONLY facts and numbers from the tool results above (cite none you did not receive). ' +
          'Include pokemon cards only for ids that appeared in tool results, and link cards only to in-app routes such as /pokemon/<id>, /plans, /resources, /raids, /pvp/great. ' +
          (draft ? `Your draft answer was: ${draft}` : ''),
      },
    ],
  });
  const fin = await callCoach({ mode: 'format', contents, locale }, opts.signal);
  model = fin.model || model;
  quota = fin.quota ?? quota;
  const raw = textOf(fin.content);
  const known = new Set(env.ctx.collection.map((p) => p.id));
  let reply: CoachReply | null = null;
  try {
    const parsed = coachReplySchema.safeParse(JSON.parse(raw));
    if (parsed.success) reply = sanitizeReply(parsed.data, known);
  } catch {
    // fall through to the plain-text fallback
  }
  if (!reply) {
    const text = draft || raw;
    if (!text) throw new AiUnavailableError('The AI reply could not be understood.', 'invalid-response');
    reply = { answer: text.slice(0, 3000), cards: [], followUps: [], usedTools: [...new Set(trace.map((t) => t.name))], confidence: 'low' };
  }
  reply.usedTools = [...new Set([...reply.usedTools, ...trace.map((t) => t.name)])];
  return { reply, toolTrace: trace, model, quota };
}
