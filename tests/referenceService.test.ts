import { bundledManifest, bundledRaw } from '@/data/bundledReference';
import { checkAndUpdate, describeFreshness, loadBundled, loadInitial, POGOAPI_BASE } from '@/services/reference/referenceService';
import { kvRepo, referenceCacheRepo, type DbLike } from '@/services/database/repositories';
import { createTestDb } from './sqliteAdapter';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_: string, s: string) => `hash-${s.length}`,
}));

let db: DbLike;
const realFetch = global.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function hashesWith(changed: Record<string, string>) {
  const out: Record<string, { hash_sha256: string }> = {};
  for (const [k, v] of Object.entries(bundledManifest.pogoapi)) out[`${k}.json`] = { hash_sha256: changed[k] ?? (v as string) };
  return out;
}

beforeEach(async () => {
  db = await createTestDb();
});
afterEach(() => {
  global.fetch = realFetch;
});

describe('reference data service', () => {
  it('starts from the bundled snapshot and reports provenance', async () => {
    const loaded = await loadInitial(db);
    expect(loaded.status.source).toBe('bundled');
    expect(loaded.status.speciesCount).toBeGreaterThan(1000);
    expect(describeFreshness(loaded.status).label).toContain('Reference data');
    expect(loadBundled().ref.getSpecies(448)).toBeDefined();
  });

  it('does nothing when provider hashes match (no excessive requests)', async () => {
    const calls: string[] = [];
    global.fetch = (async (url: string) => {
      calls.push(url);
      if (url.endsWith('api_hashes.json')) return jsonResponse(hashesWith({}));
      return jsonResponse([], 404);
    }) as unknown as typeof fetch;
    const loaded = await loadInitial(db);
    const r = await checkAndUpdate(db, { ...loaded, status: { ...loaded.status, pvpokeFetchedAt: new Date().toISOString() } });
    expect(r.updated).toBe(false);
    expect(calls).toEqual([`${POGOAPI_BASE}/api_hashes.json`]);
    expect(await kvRepo.get(db, 'reference.lastCheckedAt')).not.toBeNull();
  });

  it('downloads only changed datasets, validates, caches, and is used on the next launch', async () => {
    const modifiedMoves = (bundledRaw.fast_moves as { name: string; power: number }[]).map((m) => (m.name === 'Counter' ? { ...m, power: 99 } : m));
    global.fetch = (async (url: string) => {
      if (url.endsWith('api_hashes.json')) return jsonResponse(hashesWith({ fast_moves: 'NEWHASH' }));
      if (url.endsWith('/fast_moves.json')) return jsonResponse(modifiedMoves);
      return jsonResponse({}, 404);
    }) as unknown as typeof fetch;
    const loaded = await loadInitial(db);
    const progress: string[] = [];
    const r = await checkAndUpdate(db, { ...loaded, status: { ...loaded.status, pvpokeFetchedAt: new Date().toISOString() } }, { onProgress: (m) => progress.push(m) });
    expect(r.error).toBeNull();
    expect(r.updated).toBe(true);
    expect(r.changedDatasets).toEqual(['fast_moves']);
    expect(r.loaded!.ref.fastMove('Counter')!.power).toBe(99);
    expect(r.loaded!.status.source).toBe('network');
    expect(r.status.versions.fast_moves).toBe('NEWHASH');
    expect(progress.some((p) => p.includes('fast_moves'))).toBe(true);

    // next launch reads the cache
    const again = await loadInitial(db);
    expect(again.status.source).toBe('cache');
    expect(again.ref.fastMove('Counter')!.power).toBe(99);
    expect(again.status.versions.fast_moves).toBe('NEWHASH');
  });

  it('keeps the last-known-good data when a provider returns an unexpected shape', async () => {
    global.fetch = (async (url: string) => {
      if (url.endsWith('api_hashes.json')) return jsonResponse(hashesWith({ fast_moves: 'BAD' }));
      if (url.endsWith('/fast_moves.json')) return jsonResponse([{ nonsense: true }]);
      return jsonResponse({}, 404);
    }) as unknown as typeof fetch;
    const loaded = await loadInitial(db);
    const r = await checkAndUpdate(db, { ...loaded, status: { ...loaded.status, pvpokeFetchedAt: new Date().toISOString() } });
    expect(r.updated).toBe(false);
    expect(r.error).toContain('Unexpected response shape');
    expect(await referenceCacheRepo.getAll(db, 'pogoapi')).toHaveLength(0);
    expect((await loadInitial(db)).status.source).toBe('bundled');
  });

  it('rejects a bundle that fails the sanity gate (too few species)', async () => {
    const tiny = (bundledRaw.pokemon_stats as { pokemon_id: number }[]).filter((s) => s.pokemon_id < 100);
    global.fetch = (async (url: string) => {
      if (url.endsWith('api_hashes.json')) return jsonResponse(hashesWith({ pokemon_stats: 'TINY' }));
      if (url.endsWith('/pokemon_stats.json')) return jsonResponse(tiny);
      return jsonResponse({}, 404);
    }) as unknown as typeof fetch;
    const loaded = await loadInitial(db);
    const r = await checkAndUpdate(db, { ...loaded, status: { ...loaded.status, pvpokeFetchedAt: new Date().toISOString() } });
    expect(r.updated).toBe(false);
    expect(r.error).toMatch(/rejected/);
    expect(await referenceCacheRepo.getAll(db, 'pogoapi')).toHaveLength(0);
  });

  it('degrades gracefully when offline', async () => {
    global.fetch = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const loaded = await loadInitial(db);
    const r = await checkAndUpdate(db, loaded);
    expect(r.updated).toBe(false);
    expect(r.error).toBeTruthy();
    expect(r.status.source).toBe('bundled');
  });

  it('falls back to bundled data per dataset when a cache row is corrupt', async () => {
    await referenceCacheRepo.putMany(db, [{ provider: 'pogoapi', dataset: 'fast_moves', payload: '{not json', version: 'x', checksum: 'x' }]);
    const loaded = await loadInitial(db);
    expect(loaded.ref.fastMove('Counter')).toBeDefined();
  });

  it('warns when data is stale', () => {
    const loaded = loadBundled();
    const stale = { ...loaded.status, stale: true, dataTimestamp: '2020-01-01T00:00:00.000Z' };
    expect(describeFreshness(stale).severity).toBe('warn');
  });
});
