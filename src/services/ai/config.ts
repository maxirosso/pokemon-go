import Constants from 'expo-constants';
import { useAiKey } from '@/store/aiKey';

/**
 * Two ways to power the AI coach:
 *  1. (default) the user's own Gemini key, entered in Settings and kept only on the device (see store/aiKey.ts);
 *  2. optionally a Supabase Edge Function that holds the key server-side. Only the *public* Supabase URL and anon key
 *     live in the app for that (the anon key is designed to be public; Row Level Security protects data).
 */
interface Extra {
  supabaseUrl?: string | null;
  supabaseAnonKey?: string | null;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const asStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export const AI_CONFIG = {
  supabaseUrl: asStr(process.env.EXPO_PUBLIC_SUPABASE_URL) || asStr(extra.supabaseUrl),
  supabaseAnonKey: asStr(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) || asStr(extra.supabaseAnonKey),
  functionName: 'gemini-coach',
  /** Used when the user's own Gemini key is set on the device. The lite model is the default; Flash is the fallback. */
  geminiModel: 'gemini-2.5-flash-lite',
  geminiFallbackModel: 'gemini-2.5-flash',
  /** Client-side politeness limits (the server enforces the real quota). */
  minIntervalMs: 1500,
  maxToolRounds: 6,
  maxHistoryTurns: 8,
} as const;

export function isSupabaseConfigured(): boolean {
  return AI_CONFIG.supabaseUrl.startsWith('http') && AI_CONFIG.supabaseAnonKey.length > 20;
}

/** The AI coach is available with a Gemini key stored on this device, or (optionally) a Supabase backend. */
export function isAiConfigured(): boolean {
  return useAiKey.getState().hasKey || isSupabaseConfigured();
}
