import { create } from 'zustand';
import { analyzeCollection, type AccountAnalysis } from '@/engine/recommendations/account';
import { analyzePokemon, buildPeerIndexAsync, type PeerIndex } from '@/engine/recommendations/analysis';
import { ResourceView, type AnalysisContext, type PokemonAnalysis } from '@/engine/recommendations/types';
import { getDb } from '@/services/database/db';
import { recommendationRepo } from '@/services/database/repositories';
import { useData } from './data';
import { useReference } from './reference';
import { useSettings } from './settings';

export function buildAnalysisContext(): AnalysisContext {
  const d = useData.getState();
  const r = useReference.getState();
  const s = useSettings.getState();
  const date = r.status.dataTimestamp.slice(0, 10);
  return {
    ref: r.ref,
    trainerLevel: d.trainer?.trainerLevel ?? 40,
    goals: d.trainer?.goals ?? [],
    resources: new ResourceView(d.resources),
    collection: d.pokemon,
    datasetVersion: `PoGoAPI/PvPoke snapshot ${date} (${r.status.source})`,
    maxPvpLevel: s.hasXlCandy ? 50 : 40,
  };
}

interface AnalysisState {
  account: AccountAnalysis | null;
  running: boolean;
  progress: number;
  /** Collection version the current `account` was computed for. */
  computedFor: string | null;
  ctx: AnalysisContext | null;
  peers: PeerIndex | null;
  run: () => Promise<void>;
  /** Analysis for one Pokémon — cached result when fresh, otherwise computed on demand. */
  analysisFor: (id: string) => PokemonAnalysis | null;
}

let dirty = false;

export const useAnalysis = create<AnalysisState>((set, get) => ({
  account: null,
  running: false,
  progress: 0,
  computedFor: null,
  ctx: null,
  peers: null,

  async run() {
    if (get().running) {
      dirty = true;
      return;
    }
    set({ running: true, progress: 0 });
    try {
      do {
        dirty = false;
        const ctx = buildAnalysisContext();
        const key = `${useData.getState().version}|${useReference.getState().revision}|${useSettings.getState().hasXlCandy}`;
        const total = ctx.collection.length;
        const peers = await buildPeerIndexAsync(ctx, (done) => set({ progress: total ? done / total / 2 : 0 }));
        const account = await analyzeCollection(ctx, {
          peers,
          onProgress: (done, tot) => set({ progress: tot ? 0.5 + done / tot / 2 : 1 }),
        });
        set({ account, ctx, peers, computedFor: key });
        try {
          const db = await getDb();
          await recommendationRepo.replaceCurrent(
            db,
            account.actions.slice(0, 60).map((a) => ({
              pokemonId: a.id,
              action: a.verdict.action,
              priority: a.verdict.priority,
              impact: a.verdict.impact,
              costJson: JSON.stringify(a.verdict.cost),
              reason: a.verdict.explanation.slice(0, 600),
              confidence: a.verdict.confidence,
              datasetVersion: ctx.datasetVersion,
            })),
          );
        } catch {
          // history is best-effort
        }
      } while (dirty);
    } finally {
      set({ running: false, progress: 1 });
    }
  },

  analysisFor(id) {
    const { account, peers } = get();
    const fromAccount = account?.analyses.find((a) => a.pokemon.id === id);
    const current = useData.getState().pokemon.find((p) => p.id === id);
    if (fromAccount && current && fromAccount.pokemon === current) return fromAccount;
    if (!current) return null;
    const context = buildAnalysisContext();
    return analyzePokemon(context, current, peers ?? undefined);
  },
}));
