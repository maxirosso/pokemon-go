import { create } from 'zustand';
import type { ReferenceData } from '@/engine/reference/referenceData';
import { getDb } from '@/services/database/db';
import {
  checkAndUpdate,
  loadBundled,
  loadInitial,
  type LoadedReference,
  type ReferenceStatus,
} from '@/services/reference/referenceService';

interface ReferenceState {
  /** Always defined — starts as the bundled snapshot so the app is usable immediately and offline. */
  ref: ReferenceData;
  status: ReferenceStatus;
  loaded: LoadedReference;
  /** Bumped whenever datasets change so analysis can be recomputed. */
  revision: number;
  checking: boolean;
  progress: string | null;
  /** Human-readable result of the last refresh attempt. */
  lastResult: { ok: boolean; message: string } | null;
  init: () => Promise<void>;
  refresh: (opts?: { force?: boolean; silent?: boolean }) => Promise<void>;
}

const bundled = loadBundled();

export const useReference = create<ReferenceState>((set, get) => ({
  ref: bundled.ref,
  status: bundled.status,
  loaded: bundled,
  revision: 0,
  checking: false,
  progress: null,
  lastResult: null,

  async init() {
    try {
      const db = await getDb();
      const loaded = await loadInitial(db);
      set((s) => ({ ref: loaded.ref, status: loaded.status, loaded, revision: s.revision + 1 }));
    } catch {
      // keep the bundled snapshot
    }
  },

  async refresh(opts = {}) {
    if (get().checking) return;
    set({ checking: true, progress: 'Starting…' });
    try {
      const db = await getDb();
      const result = await checkAndUpdate(db, get().loaded, {
        force: opts.force,
        onProgress: (m) => set({ progress: m }),
      });
      if (result.updated && result.loaded) {
        const l = result.loaded;
        set((s) => ({
          ref: l.ref,
          loaded: l,
          status: l.status,
          revision: s.revision + 1,
          lastResult: { ok: true, message: `Updated ${result.changedDatasets.length} dataset(s): ${result.changedDatasets.slice(0, 4).join(', ')}${result.changedDatasets.length > 4 ? '…' : ''}` },
        }));
      } else {
        set({
          status: result.status,
          lastResult: result.error
            ? { ok: false, message: `Could not refresh: ${result.error}. Using last-known-good data.` }
            : { ok: true, message: 'Already up to date.' },
        });
      }
    } finally {
      set({ checking: false, progress: null });
    }
  },
}));
