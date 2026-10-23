const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

// eslint-disable-next-line import/first
import { getDeviceApiKey, isPlausibleApiKey, normalizeApiKey, useAiKey } from '@/store/aiKey';

const KEY = 'AIzaSyA-1234567890abcdefghijklmnopqrstuv';

describe('on-device Gemini key', () => {
  beforeEach(() => {
    mockStore.clear();
    useAiKey.setState({ loaded: false, key: null, hasKey: false });
  });

  it('normalises pasted keys (whitespace and surrounding quotes)', () => {
    expect(normalizeApiKey(`  ${KEY}\n`)).toBe(KEY);
    expect(normalizeApiKey(`"${KEY}"`)).toBe(KEY);
    expect(normalizeApiKey(`'${KEY}'`)).toBe(KEY);
  });

  it('rejects obviously wrong input but does not guess key formats', () => {
    expect(isPlausibleApiKey('')).toBe(false);
    expect(isPlausibleApiKey('short')).toBe(false);
    expect(isPlausibleApiKey('has a space in it which is not a key')).toBe(false);
    expect(isPlausibleApiKey(KEY)).toBe(true);
    expect(isPlausibleApiKey('x'.repeat(300))).toBe(false);
  });

  it('saves to secure storage, exposes hasKey, and survives a reload', async () => {
    await useAiKey.getState().save(`  ${KEY} `);
    expect(useAiKey.getState().hasKey).toBe(true);
    expect(getDeviceApiKey()).toBe(KEY);
    expect([...mockStore.values()]).toEqual([KEY]);

    useAiKey.setState({ loaded: false, key: null, hasKey: false }); // simulate an app restart
    await useAiKey.getState().load();
    expect(useAiKey.getState()).toMatchObject({ loaded: true, hasKey: true, key: KEY });
  });

  it('refuses to save an implausible key and stores nothing', async () => {
    await expect(useAiKey.getState().save('nope')).rejects.toThrow('does not look like');
    expect(mockStore.size).toBe(0);
    expect(useAiKey.getState().hasKey).toBe(false);
  });

  it('clear removes the key from storage and memory', async () => {
    await useAiKey.getState().save(KEY);
    await useAiKey.getState().clear();
    expect(mockStore.size).toBe(0);
    expect(getDeviceApiKey()).toBeNull();
    expect(useAiKey.getState().hasKey).toBe(false);
  });

  it('loading with nothing stored leaves the coach unconfigured', async () => {
    await useAiKey.getState().load();
    expect(useAiKey.getState()).toMatchObject({ loaded: true, hasKey: false, key: null });
  });
});
