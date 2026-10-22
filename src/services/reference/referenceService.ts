import { bundledManifest, bundledPvpoke, bundledRaw } from '@/data/bundledReference';
import { ReferenceData, type ReferenceMeta } from '@/engine/reference/referenceData';
import {
  RAW_DATASET_SCHEMAS,
  pvpokeRankingSchema,
  type PvpokeBundle,
  type RawDatasetName,
  type RawReferenceBundle,
} from '@/engine/reference/schemas';
import { fetchJson, fetchWithRetry } from '@/services/api/http';
import { z } from 'zod';
import { referenceCacheRepo, kvRepo, type DbLike } from '@/services/database/repositories';

/**
 * Reference-data update service.
 *
 *  1. First launch/offline: the snapshot bundled with the app (src/data/reference).
 *  2. After a successful update: datasets cached in SQLite (last-known-good) override the bundled ones.
 *  3. Updates compare provider hashes (PoGoAPI `api_hashes.json`) with the stored hashes, download only
 *     changed datasets, validate each with Zod, rebuild the normalised index as a sanity check and only
 *     then persist (atomic transaction). Any failure keeps the previous data and reports why.
 */

export const POGOAPI_BASE = 'https://pogoapi.net/api/v1';
export const PVPOKE_BASE = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall';
const PVPOKE_CAPS = ['500', '1500', '2500', '10000'] as const;
const PVPOKE_MAX_AGE_MS = 3 * 24 * 3600 * 1000;
const STALE_AFTER_MS = 21 * 24 * 3600 * 1000;

const POGOAPI_DATASETS = Object.keys(RAW_DATASET_SCHEMAS) as RawDatasetName[];

const hashesSchema = z.record(z.string(), z.object({ hash_sha256: z.string() }).passthrough());

export interface ReferenceStatus {
  source: ReferenceMeta['source'];
  /** When the datasets in use were generated/fetched. */
  dataTimestamp: string;
  stale: boolean;
  versions: Record<string, string | null>;
  lastCheckedAt: string | null;
  lastError: string | null;
  pvpokeFetchedAt: string | null;
  speciesCount: number;
}

export interface LoadedReference {
  ref: ReferenceData;
  raw: RawReferenceBundle;
  pvpoke: PvpokeBundle;
  status: ReferenceStatus;
}

function buildStatus(ref: ReferenceData, extra: Partial<ReferenceStatus>): ReferenceStatus {
  const ts = ref.meta.fetchedAt;
  const age = Date.now() - new Date(ts).getTime();
  return {
    source: ref.meta.source,
    dataTimestamp: ts,
    stale: Number.isFinite(age) && age > STALE_AFTER_MS,
    versions: ref.meta.versions,
    lastCheckedAt: null,
    lastError: null,
    pvpokeFetchedAt: null,
    speciesCount: ref.listSpecies().length,
    ...extra,
  };
}

export function loadBundled(): LoadedReference {
  const versions: Record<string, string | null> = { ...bundledManifest.pogoapi };
  const ref = new ReferenceData(bundledRaw, bundledPvpoke, {
    source: 'bundled',
    fetchedAt: bundledManifest.generatedAt,
    versions,
  });
  return { ref, raw: bundledRaw, pvpoke: bundledPvpoke, status: buildStatus(ref, {}) };
}

/** Bundled snapshot overlaid with any valid cached datasets. Falls back per-dataset on corruption. */
export async function loadInitial(db: DbLike | null): Promise<LoadedReference> {
  const bundled = loadBundled();
  if (!db) return bundled;
  try {
    const cached = await referenceCacheRepo.getAll(db, 'pogoapi');
    const versions = await referenceCacheRepo.versions(db);
    const overlay: Partial<RawReferenceBundle> = {};
    const usedVersions: Record<string, string | null> = { ...bundled.status.versions };
    let newest = bundledManifest.generatedAt;
    for (const row of cached) {
      const name = row.dataset as RawDatasetName;
      const schema = RAW_DATASET_SCHEMAS[name];
      if (!schema) continue;
      try {
        const parsed = schema.safeParse(JSON.parse(row.payload));
        if (!parsed.success) continue;
        (overlay as Record<string, unknown>)[name] = parsed.data;
        usedVersions[name] = versions.find((v) => v.provider === 'pogoapi' && v.dataset === name)?.version ?? null;
        if (row.fetchedAt > newest) newest = row.fetchedAt;
      } catch {
        // corrupt cache row → bundled copy is used for this dataset
      }
    }
    const pvpoke: PvpokeBundle = { ...bundledPvpoke };
    let pvpokeFetchedAt = null as string | null;
    for (const row of await referenceCacheRepo.getAll(db, 'pvpoke')) {
      try {
        const parsed = pvpokeRankingSchema.safeParse(JSON.parse(row.payload));
        if (parsed.success && (PVPOKE_CAPS as readonly string[]).includes(row.dataset)) {
          (pvpoke as Record<string, unknown>)[row.dataset] = parsed.data;
          pvpokeFetchedAt = !pvpokeFetchedAt || row.fetchedAt > pvpokeFetchedAt ? row.fetchedAt : pvpokeFetchedAt;
          if (row.fetchedAt > newest) newest = row.fetchedAt;
        }
      } catch {
        // ignore
      }
    }
    if (Object.keys(overlay).length === 0 && !pvpokeFetchedAt) {
      const lastChecked = await kvRepo.get(db, 'reference.lastCheckedAt');
      return { ...bundled, status: { ...bundled.status, lastCheckedAt: lastChecked } };
    }
    const raw = { ...bundledRaw, ...overlay } as RawReferenceBundle;
    const ref = new ReferenceData(raw, pvpoke, { source: 'cache', fetchedAt: newest, versions: usedVersions });
    const lastChecked = await kvRepo.get(db, 'reference.lastCheckedAt');
    return { ref, raw, pvpoke, status: buildStatus(ref, { lastCheckedAt: lastChecked, pvpokeFetchedAt }) };
  } catch {
    return bundled;
  }
}

export interface UpdateResult {
  updated: boolean;
  changedDatasets: string[];
  loaded: LoadedReference | null;
  status: ReferenceStatus;
  error: string | null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Sanity gate before a downloaded bundle replaces the current one. */
function sanityCheck(candidate: ReferenceData, current: ReferenceData) {
  const n = candidate.listSpecies().length;
  const base = current.listSpecies().length;
  if (n < base * 0.9) throw new Error(`Downloaded data lists only ${n} species (had ${base}) — rejected.`);
  if (candidate.cpm.levels.length < 80) throw new Error('Downloaded CP multiplier table is incomplete — rejected.');
  if (!candidate.getSpecies(150)) throw new Error('Downloaded species data is missing known Pokémon — rejected.');
}

async function sha256(text: string): Promise<string> {
  const Crypto = await import('expo-crypto');
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
}

/**
 * Check providers for newer data. Never throws: failures are returned as `error` and the previous
 * (last-known-good) data keeps being used.
 */
export async function checkAndUpdate(
  db: DbLike,
  current: LoadedReference,
  opts: { force?: boolean; onProgress?: (msg: string) => void } = {},
): Promise<UpdateResult> {
  const now = new Date().toISOString();
  const status0 = { ...current.status, lastCheckedAt: now };
  const changed: string[] = [];
  let error: string | null = null;
  try {
    opts.onProgress?.('Checking PoGoAPI versions…');
    const hashes = await fetchJson(`${POGOAPI_BASE}/api_hashes.json`, hashesSchema, { retries: 2, timeoutMs: 15000 });
    const known = current.status.versions;
    const toFetch = POGOAPI_DATASETS.filter((d) => {
      const remote = hashes[`${d}.json`]?.hash_sha256;
      return !!remote && (opts.force || remote !== known[d]);
    });
    const downloaded: Partial<RawReferenceBundle> = {};
    const rows: { provider: string; dataset: string; payload: string; version: string | null; checksum: string | null }[] = [];
    let done = 0;
    await mapLimit(toFetch, 3, async (name) => {
      opts.onProgress?.(`Downloading ${name} (${done + 1}/${toFetch.length})…`);
      const schema = RAW_DATASET_SCHEMAS[name] as z.ZodType<unknown>;
      let data = await fetchJson(`${POGOAPI_BASE}/${name}.json`, schema, { retries: 2, timeoutMs: 30000 });
      if (name === 'raid_bosses') data = { current: (data as { current: unknown }).current };
      (downloaded as Record<string, unknown>)[name] = data;
      const remote = hashes[`${name}.json`]?.hash_sha256 ?? null;
      rows.push({ provider: 'pogoapi', dataset: name, payload: JSON.stringify(data), version: remote, checksum: remote });
      changed.push(name);
      done += 1;
    });

    // PvPoke rankings (large) — refreshed at most every few days.
    const pvpoke: PvpokeBundle = { ...current.pvpoke };
    const pvpokeAge = current.status.pvpokeFetchedAt ? Date.now() - new Date(current.status.pvpokeFetchedAt).getTime() : Infinity;
    if (opts.force || pvpokeAge > PVPOKE_MAX_AGE_MS) {
      for (const cap of PVPOKE_CAPS) {
        try {
          opts.onProgress?.(`Downloading PvPoke ${cap} rankings…`);
          const res = await fetchWithRetry(`${PVPOKE_BASE}/rankings-${cap}.json`, { retries: 1, timeoutMs: 45000 });
          const full: unknown = await res.json();
          const slim = pvpokeRankingSchema.safeParse(
            (Array.isArray(full) ? full : []).map((r: { speciesId?: string; speciesName?: string; score?: number; moveset?: string[]; stats?: { product?: number } }) => ({
              id: r.speciesId,
              n: r.speciesName,
              s: r.score,
              m: r.moveset,
              p: r.stats?.product ?? null,
            })),
          );
          if (!slim.success || slim.data.length < 10) throw new Error(`PvPoke ${cap} ranking has an unexpected shape`);
          (pvpoke as Record<string, unknown>)[cap] = slim.data;
          const payload = JSON.stringify(slim.data);
          rows.push({ provider: 'pvpoke', dataset: cap, payload, version: await sha256(payload), checksum: null });
          changed.push(`pvpoke_${cap}`);
        } catch (e) {
          error = `PvPoke ${cap}: ${(e as Error).message}`;
        }
      }
    }

    if (rows.length === 0) {
      await kvRepo.set(db, 'reference.lastCheckedAt', now);
      return { updated: false, changedDatasets: [], loaded: null, status: { ...status0, lastError: error }, error };
    }

    const raw = { ...current.raw, ...downloaded } as RawReferenceBundle;
    const versions = { ...known };
    for (const r of rows) if (r.provider === 'pogoapi') versions[r.dataset] = r.version;
    const ref = new ReferenceData(raw, pvpoke, { source: 'network', fetchedAt: now, versions });
    sanityCheck(ref, current.ref);

    await referenceCacheRepo.putMany(db, rows);
    await kvRepo.set(db, 'reference.lastCheckedAt', now);
    const pvpokeFetchedAt = rows.some((r) => r.provider === 'pvpoke') ? now : current.status.pvpokeFetchedAt;
    const status = buildStatus(ref, { lastCheckedAt: now, lastError: error, pvpokeFetchedAt });
    return { updated: true, changedDatasets: changed, loaded: { ref, raw, pvpoke, status }, status, error };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    await kvRepo.set(db, 'reference.lastCheckedAt', now).catch(() => undefined);
    return { updated: false, changedDatasets: [], loaded: null, status: { ...status0, lastError: error }, error };
  }
}

export function describeFreshness(status: ReferenceStatus): { label: string; severity: 'ok' | 'warn' } {
  const d = new Date(status.dataTimestamp);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const when = Number.isNaN(d.getTime()) ? 'unknown date' : d.toISOString().slice(0, 10);
  if (status.stale) return { label: `Reference data is ${days} days old (${when}). Recommendations may miss recent balance changes.`, severity: 'warn' };
  return { label: `Reference data from ${when}${status.source === 'bundled' ? ' (bundled with the app)' : ''}.`, severity: 'ok' };
}
