import toolsJson from '../supabase/functions/_shared/tools.json';
import { AI_CONFIG } from '@/services/ai/config';
import { buildGeminiPayload, callGeminiDirect, testGeminiKey } from '@/services/ai/geminiDirect';
import { AiUnavailableError, type CoachRequest } from '@/services/ai/protocol';

interface Payload {
  tools?: { functionDeclarations: unknown }[];
  toolConfig?: { functionCallingConfig: { mode: string } };
  systemInstruction: { parts: { text: string }[] };
  generationConfig: { temperature: number; responseMimeType?: string; responseSchema?: { required: string[] } };
}
const build = (req: CoachRequest) => buildGeminiPayload(req) as unknown as Payload;

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));
const mockSupabaseToken = jest.fn();
jest.mock('@/services/ai/supabase', () => ({ getAccessToken: () => mockSupabaseToken() }));

// eslint-disable-next-line import/first
import { callCoach } from '@/services/ai/gateway';
// eslint-disable-next-line import/first
import { useAiKey } from '@/store/aiKey';

const KEY = 'AIzaSyA-1234567890abcdefghijklmnopqrstuv';
const chat: CoachRequest = { mode: 'chat', locale: 'en', contents: [{ role: 'user', parts: [{ text: 'What should I power up?' }] }] };
const okBody = { candidates: [{ content: { role: 'model', parts: [{ text: 'Power up Lucario.' }] }, finishReason: 'STOP' }] };

const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  ({ ok: status >= 200 && status < 300, status, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, json: async () => body }) as unknown as Response;

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  mockStore.clear();
  mockSupabaseToken.mockReset();
  useAiKey.setState({ loaded: true, key: null, hasKey: false });
});

describe('buildGeminiPayload', () => {
  it('chat mode exposes the local tools with automatic function calling', () => {
    const p = build(chat);
    expect(p.tools?.[0].functionDeclarations).toBe(toolsJson);
    expect(p.toolConfig?.functionCallingConfig.mode).toBe('AUTO');
    expect(p.systemInstruction.parts[0].text).toContain('GO Compass Coach');
    expect(p.systemInstruction.parts[0].text).toContain('User language: en');
    expect(p.generationConfig.responseSchema).toBeUndefined();
  });

  it('format mode demands schema-validated JSON and no tools', () => {
    const p = build({ ...chat, mode: 'format', locale: 'es' });
    expect(p.generationConfig.responseMimeType).toBe('application/json');
    expect(p.generationConfig.responseSchema?.required).toContain('answer');
    expect(p.tools).toBeUndefined();
    expect(p.systemInstruction.parts[0].text).toContain('User language: es');
    expect(p.systemInstruction.parts[0].text).toContain('Return ONLY JSON');
  });

  it('vision mode uses the extraction prompt at temperature 0', () => {
    const p = build({ ...chat, mode: 'vision' });
    expect(p.generationConfig.temperature).toBe(0);
    expect(p.generationConfig.responseSchema?.required).toContain('speciesName');
    expect(p.systemInstruction.parts[0].text).toContain('ONE Pokémon GO screenshot');
  });
});

describe('callGeminiDirect', () => {
  it('uses the Flash-Lite model first and sends the key in a header, never in the URL', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, okBody));
    const res = await callGeminiDirect(chat, KEY);
    expect(res.model).toBe(AI_CONFIG.geminiModel);
    expect(AI_CONFIG.geminiModel).toBe('gemini-2.5-flash-lite');
    expect(res.content?.parts[0]).toEqual({ text: 'Power up Lucario.' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent');
    expect(String(url)).not.toContain(KEY);
    expect(init.headers['x-goog-api-key']).toBe(KEY);
  });

  it('falls back to the second model when the first is unavailable', async () => {
    fetchMock.mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(200, okBody));
    const res = await callGeminiDirect(chat, KEY);
    expect(res.model).toBe('gemini-2.5-flash');
    expect(fetchMock.mock.calls[1][0]).toContain('gemini-2.5-flash:generateContent');
  });

  it('maps rate limiting to a friendly error with the retry delay', async () => {
    fetchMock.mockResolvedValueOnce(reply(429, {}, { 'retry-after': '42' }));
    await expect(callGeminiDirect(chat, KEY)).rejects.toMatchObject({ reason: 'rate-limited', retryAfterSec: 42 });
  });

  it.each([400, 401, 403])('maps a rejected key (HTTP %i) to not-configured without leaking the key', async (status) => {
    fetchMock.mockResolvedValueOnce(reply(status, { error: { message: 'API key not valid. Please pass a valid API key.' } }));
    const err = await callGeminiDirect(chat, KEY).catch((e) => e);
    expect(err).toBeInstanceOf(AiUnavailableError);
    expect(err.reason).toBe('not-configured');
    expect(err.message).not.toContain(KEY);
  });

  it('keeps a non-key 400 as a server error with Google’s explanation', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: { message: 'Request payload is malformed.' } }));
    await expect(callGeminiDirect(chat, KEY)).rejects.toMatchObject({ reason: 'server', message: expect.stringContaining('malformed') });
  });

  it('reports an unreachable network as offline', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(callGeminiDirect(chat, KEY)).rejects.toMatchObject({ reason: 'offline' });
  });

  it('reports a blocked prompt instead of returning empty content silently', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { promptFeedback: { blockReason: 'SAFETY' } }));
    await expect(callGeminiDirect(chat, KEY)).rejects.toMatchObject({ reason: 'invalid-response', message: expect.stringContaining('SAFETY') });
  });

  it('testGeminiKey resolves with the model that answered', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, okBody));
    await expect(testGeminiKey(KEY)).resolves.toBe('gemini-2.5-flash-lite');
  });
});

describe('callCoach routing', () => {
  it('uses the on-device key and talks to Google directly (no Supabase)', async () => {
    useAiKey.setState({ key: KEY, hasKey: true });
    fetchMock.mockResolvedValueOnce(reply(200, okBody));
    const res = await callCoach(chat);
    expect(res.content?.role).toBe('model');
    expect(String(fetchMock.mock.calls[0][0])).toContain('generativelanguage.googleapis.com');
    expect(mockSupabaseToken).not.toHaveBeenCalled();
  });

  it('with no key and no Supabase it says the coach is not set up, without any network call', async () => {
    await expect(callCoach(chat)).rejects.toMatchObject({ reason: 'not-configured', message: expect.stringContaining('Gemini API key') });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
