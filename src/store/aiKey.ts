import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

/**
 * The user's own Gemini API key, kept ONLY on this device.
 *  - iOS / Android: the system keychain / keystore via expo-secure-store.
 *  - Web (development only): localStorage, because SecureStore is unavailable there.
 * It is deliberately never put in AsyncStorage/settings, the SQLite database, backups/exports, logs or the git repo.
 */
const KEY_NAME = 'gocompass.gemini.key';

const storage = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(KEY_NAME) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(KEY_NAME);
  },
  async set(value: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(KEY_NAME, value);
      return;
    }
    await SecureStore.setItemAsync(KEY_NAME, value);
  },
  async remove(): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(KEY_NAME);
      } catch {
        // ignore
      }
      return;
    }
    await SecureStore.deleteItemAsync(KEY_NAME);
  },
};

/** Trims whitespace and one pair of surrounding quotes (a common copy/paste artefact). */
export function normalizeApiKey(raw: string): string {
  return raw.trim().replace(/^(["'])(.*)\1$/, '$2').trim();
}

/** Loose sanity check only — Google decides whether a key is really valid. */
export function isPlausibleApiKey(key: string): boolean {
  return key.length >= 20 && key.length <= 200 && !/\s/.test(key);
}

interface AiKeyState {
  loaded: boolean;
  /** The key itself. Never render or log this; use `hasKey` for UI. */
  key: string | null;
  hasKey: boolean;
  load: () => Promise<void>;
  save: (raw: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useAiKey = create<AiKeyState>()((set) => ({
  loaded: false,
  key: null,
  hasKey: false,
  load: async () => {
    const key = await storage.get().catch(() => null);
    set({ loaded: true, key: key || null, hasKey: !!key });
  },
  save: async (raw) => {
    const key = normalizeApiKey(raw);
    if (!isPlausibleApiKey(key)) throw new Error('That does not look like a Gemini API key.');
    await storage.set(key);
    set({ loaded: true, key, hasKey: true });
  },
  clear: async () => {
    await storage.remove();
    set({ key: null, hasKey: false });
  },
}));

export const getDeviceApiKey = (): string | null => useAiKey.getState().key;
