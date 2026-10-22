import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AI_CONFIG, isAiConfigured } from './config';

/** Session tokens are sensitive → SecureStore (Keychain/Keystore), not AsyncStorage. Values > 2 KB are chunked. */
const CHUNK = 1800;
const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (!count) return SecureStore.getItemAsync(key);
    let out = '';
    for (let i = 0; i < Number(count); i += 1) out += (await SecureStore.getItemAsync(`${key}.${i}`)) ?? '';
    return out;
  },
  async setItem(key: string, value: string): Promise<void> {
    const parts = Math.ceil(value.length / CHUNK);
    await SecureStore.setItemAsync(`${key}.n`, String(parts));
    for (let i = 0; i < parts; i += 1) await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
  },
  async removeItem(key: string): Promise<void> {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    for (let i = 0; i < Number(count ?? 0); i += 1) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
    await SecureStore.deleteItemAsync(key);
  },
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isAiConfigured()) return null;
  if (!client) {
    client = createClient(AI_CONFIG.supabaseUrl, AI_CONFIG.supabaseAnonKey, {
      auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    });
  }
  return client;
}

/** Guest mode: an anonymous Supabase session identifies the device for rate limiting — no email, no password. */
export async function getAccessToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.access_token;
  const { data: anon, error } = await sb.auth.signInAnonymously();
  if (error || !anon.session) return null;
  return anon.session.access_token;
}

export async function signOutCloud(): Promise<void> {
  await getSupabase()?.auth.signOut();
}
