import toolDeclarations from '../../../supabase/functions/_shared/tools.json';
import { AI_CONFIG } from './config';
import { FORMAT_INSTRUCTION, REPLY_SCHEMA, SYSTEM_PROMPT, VISION_INSTRUCTION, VISION_SCHEMA } from './geminiPrompts';
import { AiUnavailableError, type CoachRequest, type CoachResponse, type Content } from './protocol';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 60_000;

/** Builds the `generateContent` body for one coach request (same behaviour as the optional Supabase function). */
export function buildGeminiPayload(req: CoachRequest): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    temperature: req.mode === 'vision' ? 0 : 0.3,
    maxOutputTokens: req.mode === 'chat' ? 1200 : 1500,
  };
  let systemText = `${SYSTEM_PROMPT}\nUser language: ${req.locale}.`;
  const payload: Record<string, unknown> = { contents: req.contents };
  if (req.mode === 'chat') {
    payload.tools = [{ functionDeclarations: toolDeclarations }];
    payload.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
  } else if (req.mode === 'format') {
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
  return payload;
}

async function post(model: string, apiKey: string, payload: unknown, signal: AbortSignal): Promise<Response> {
  // The key travels in a header, never in the URL, so it cannot end up in logs or error messages.
  return fetch(`${ENDPOINT}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(payload),
    signal,
  });
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? '';
  } catch {
    return '';
  }
}

/**
 * Calls Gemini directly from the device with the user's own API key. Every failure becomes an `AiUnavailableError`
 * with a friendly message so the UI shows a useful fallback instead of a stack trace. The key is never included in
 * messages.
 */
export async function callGeminiDirect(req: CoachRequest, apiKey: string, signal?: AbortSignal): Promise<CoachResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  const payload = buildGeminiPayload(req);
  try {
    let model: string = AI_CONFIG.geminiModel;
    let res = await post(model, apiKey, payload, controller.signal);
    if ((res.status === 404 || res.status === 503) && AI_CONFIG.geminiFallbackModel !== model) {
      model = AI_CONFIG.geminiFallbackModel;
      res = await post(model, apiKey, payload, controller.signal);
    }
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? '60');
      throw new AiUnavailableError(
        'Gemini quota reached. The free tier has strict per-minute and per-day limits — try again shortly.',
        'rate-limited',
        Number.isFinite(retry) ? retry : 60,
      );
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const detail = await errorDetail(res);
      if (/api key|API_KEY|permission|unauthenticated|not valid/i.test(detail) || res.status !== 400) {
        throw new AiUnavailableError('Google rejected your Gemini API key. Check it in Settings → AI coach.', 'not-configured');
      }
      throw new AiUnavailableError(`Gemini could not handle this request. ${detail}`.trim(), 'server');
    }
    if (!res.ok) throw new AiUnavailableError(`Gemini returned an error (${res.status}). ${await errorDetail(res)}`.trim(), 'server');

    const data = (await res.json()) as {
      candidates?: { content?: Content; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    const candidate = data.candidates?.[0];
    if (!candidate?.content && data.promptFeedback?.blockReason) {
      throw new AiUnavailableError(`Gemini declined this request (${data.promptFeedback.blockReason}).`, 'invalid-response');
    }
    return { content: candidate?.content ?? null, model, finishReason: candidate?.finishReason };
  } catch (e) {
    if (e instanceof AiUnavailableError) throw e;
    if ((e as Error).name === 'AbortError') throw new AiUnavailableError('Gemini took too long to respond.', 'server');
    throw new AiUnavailableError('You appear to be offline or Gemini is unreachable.', 'offline');
  } finally {
    clearTimeout(timer);
  }
}

/** Sends a tiny request to confirm a key works. Resolves with the model that answered; rejects with an `AiUnavailableError`. */
export async function testGeminiKey(apiKey: string): Promise<string> {
  const res = await callGeminiDirect(
    { mode: 'format', locale: 'en', contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }] },
    apiKey,
  );
  return res.model;
}
