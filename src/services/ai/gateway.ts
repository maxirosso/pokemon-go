import { getDeviceApiKey } from '@/store/aiKey';
import { AI_CONFIG, isAiConfigured, isSupabaseConfigured } from './config';
import { callGeminiDirect } from './geminiDirect';
import { AiUnavailableError, type CoachRequest, type CoachResponse } from './protocol';
import { getAccessToken } from './supabase';

let lastCall = 0;

/**
 * Single choke point to the AI service (Gemini directly with the on-device key, or the optional Supabase function). Maps every failure mode to an `AiUnavailableError` with a friendly
 * reason so the UI can show an informative fallback instead of a stack trace.
 */
export async function callCoach(req: CoachRequest, signal?: AbortSignal): Promise<CoachResponse> {
  if (!isAiConfigured()) {
    throw new AiUnavailableError('The AI coach is not set up. Add your Gemini API key in Settings → AI coach.', 'not-configured');
  }
  const wait = lastCall + AI_CONFIG.minIntervalMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  // Preferred path: the user's own key on this device, calling Gemini directly.
  const deviceKey = getDeviceApiKey();
  if (deviceKey) return callGeminiDirect(req, deviceKey, signal);
  if (!isSupabaseConfigured()) throw new AiUnavailableError('The AI coach is not set up. Add your Gemini API key in Settings → AI coach.', 'not-configured');

  const token = await getAccessToken().catch(() => null);
  if (!token) throw new AiUnavailableError('Could not start a guest session with the backend.', 'server');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await fetch(`${AI_CONFIG.supabaseUrl}/functions/v1/${AI_CONFIG.functionName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: AI_CONFIG.supabaseAnonKey },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? '60');
      throw new AiUnavailableError('AI quota reached. The free tier has strict limits — try again shortly.', 'rate-limited', Number.isFinite(retry) ? retry : 60);
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = ((await res.json()) as { error?: string }).error ?? '';
      } catch {
        // ignore
      }
      throw new AiUnavailableError(`The AI service returned an error (${res.status}). ${detail}`.trim(), 'server');
    }
    const json = (await res.json()) as CoachResponse;
    return json;
  } catch (e) {
    if (e instanceof AiUnavailableError) throw e;
    if ((e as Error).name === 'AbortError') throw new AiUnavailableError('The AI service took too long to respond.', 'server');
    throw new AiUnavailableError('You appear to be offline or the AI service is unreachable.', 'offline');
  } finally {
    clearTimeout(timer);
  }
}
