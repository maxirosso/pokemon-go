import Constants from 'expo-constants';

/**
 * Only the *public* Supabase project URL and anon key live in the app (the anon key is designed to be public;
 * Row Level Security protects data). The Gemini API key exists ONLY as a secret of the Supabase Edge Function.
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
  /** Client-side politeness limits (the server enforces the real quota). */
  minIntervalMs: 1500,
  maxToolRounds: 6,
  maxHistoryTurns: 8,
} as const;

export function isAiConfigured(): boolean {
  return AI_CONFIG.supabaseUrl.startsWith('http') && AI_CONFIG.supabaseAnonKey.length > 20;
}
