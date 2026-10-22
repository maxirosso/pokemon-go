import { create } from 'zustand';
import { extractedToReview, parseOcrText, type ExtractedPokemon, type ReviewDraft } from '@/engine/io/extraction';
import type { ReferenceData } from '@/engine/reference/referenceData';
import { OcrUnavailableError, recognizeLines } from '@/services/ocr/ocr';

export type ImportItemStatus = 'queued' | 'processing' | 'done' | 'error';

export interface ImportItem {
  id: string;
  uri: string;
  name: string;
  status: ImportItemStatus;
  backend: 'ocr' | 'gemini' | null;
  review: ReviewDraft | null;
  error: string | null;
  /** User chose to skip this entry on the review screen. */
  skipped: boolean;
}

interface QueueState {
  items: ImportItem[];
  running: boolean;
  add: (assets: { uri: string; name: string }[]) => void;
  clear: () => void;
  update: (id: string, patch: Partial<ImportItem>) => void;
  remove: (id: string) => void;
  /** Process queued items sequentially with the chosen backend. `cloud` is only used with explicit consent. */
  process: (ref: ReferenceData, opts: { backend: 'ocr' | 'gemini'; cloud?: (uri: string) => Promise<ExtractedPokemon> }) => Promise<void>;
}

let seq = 0;

export const useImportQueue = create<QueueState>((set, get) => ({
  items: [],
  running: false,
  add(assets) {
    set((s) => ({
      items: [
        ...s.items,
        ...assets
          .filter((a) => !s.items.some((i) => i.uri === a.uri)) // same screenshot picked twice
          .map((a) => {
            seq += 1;
            return { id: `imp-${Date.now()}-${seq}`, uri: a.uri, name: a.name, status: 'queued' as const, backend: null, review: null, error: null, skipped: false };
          }),
      ],
    }));
  },
  clear: () => set({ items: [], running: false }),
  update: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

  async process(ref, opts) {
    if (get().running) return;
    set({ running: true });
    try {
      for (const item of get().items) {
        if (item.status !== 'queued' && item.status !== 'error') continue;
        get().update(item.id, { status: 'processing', error: null, backend: opts.backend });
        try {
          let extracted: ExtractedPokemon;
          if (opts.backend === 'gemini' && opts.cloud) extracted = await opts.cloud(item.uri);
          else extracted = parseOcrText(ref, await recognizeLines(item.uri));
          get().update(item.id, { status: 'done', review: extractedToReview(ref, extracted, opts.backend) });
        } catch (e) {
          const msg = e instanceof OcrUnavailableError ? e.message : e instanceof Error ? e.message : 'Could not read this screenshot.';
          get().update(item.id, { status: 'error', error: msg });
          if (e instanceof OcrUnavailableError) break; // no point trying the rest
        }
      }
    } finally {
      set({ running: false });
    }
  },
}));
