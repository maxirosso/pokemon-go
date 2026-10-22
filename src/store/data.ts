import { create } from 'zustand';
import type { NewPokemon } from '@/engine/io/importers';
import type { SavedTeamRecord } from '@/engine/io/backup';
import type { GoalWeight, OwnedPokemon, PokemonSource, ResourceBalance, ResourceType } from '@/engine/types';
import { getDb } from '@/services/database/db';
import {
  importBatchRepo,
  planRepo,
  pokemonRepo,
  resourceRepo,
  tagRepo,
  teamRepo,
  trainerRepo,
  wipeUserData,
  type PlanAction,
  type TagRecord,
  type TrainerProfile,
} from '@/services/database/repositories';

interface DataState {
  ready: boolean;
  error: string | null;
  trainer: TrainerProfile | null;
  pokemon: OwnedPokemon[];
  resources: ResourceBalance[];
  tags: TagRecord[];
  teams: SavedTeamRecord[];
  plan: PlanAction[];
  /** Bumped on every mutation that can change recommendations (collection, resources, goals). */
  version: number;

  init: () => Promise<void>;
  reload: () => Promise<void>;
  saveTrainer: (p: { nickname: string; trainerLevel: number; playStyle?: string | null; goals?: GoalWeight[]; language?: 'en' | 'es' }) => Promise<void>;
  addPokemon: (draft: NewPokemon, source?: PokemonSource) => Promise<OwnedPokemon>;
  addMany: (drafts: NewPokemon[], source: PokemonSource, fileName?: string | null, rejected?: number) => Promise<OwnedPokemon[]>;
  updatePokemon: (id: string, patch: Partial<NewPokemon>) => Promise<void>;
  deletePokemon: (id: string) => Promise<void>;
  restorePokemon: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  setResource: (type: ResourceType, scope: string | null, amount: number | null) => Promise<void>;
  saveTeam: (team: Omit<SavedTeamRecord, 'id' | 'createdAt'> & { id?: string }) => Promise<string>;
  removeTeam: (id: string) => Promise<void>;
  reloadPlan: () => Promise<void>;
  reloadTags: () => Promise<void>;
  wipe: () => Promise<void>;
}

export const useData = create<DataState>((set, get) => ({
  ready: false,
  error: null,
  trainer: null,
  pokemon: [],
  resources: [],
  tags: [],
  teams: [],
  plan: [],
  version: 0,

  async init() {
    try {
      await get().reload();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), ready: true });
    }
  },

  async reload() {
    const db = await getDb();
    // Sequential on purpose: expo-sqlite's web worker rejects overlapping statements on one connection
    // ("Error code 21: bad parameter or other API misuse").
    const trainer = await trainerRepo.get(db);
    const pokemon = await pokemonRepo.listActive(db);
    const resources = await resourceRepo.list(db);
    const tags = await tagRepo.list(db);
    const teams = await teamRepo.list(db);
    const plan = await planRepo.list(db);
    set((s) => ({ trainer, pokemon, resources, tags, teams, plan, ready: true, error: null, version: s.version + 1 }));
  },

  async saveTrainer(p) {
    const db = await getDb();
    const trainer = await trainerRepo.upsert(db, p);
    set((s) => ({ trainer, version: s.version + 1 }));
  },

  async addPokemon(draft, source = 'manual') {
    const db = await getDb();
    const created = await pokemonRepo.insert(db, draft, { source });
    const tags = await tagRepo.list(db);
    set((s) => ({ pokemon: [created, ...s.pokemon], tags, version: s.version + 1 }));
    return created;
  },

  async addMany(drafts, source, fileName = null, rejected = 0) {
    const db = await getDb();
    const batchId = await importBatchRepo.create(db, source, fileName, drafts.length, rejected);
    const created = await pokemonRepo.insertMany(db, drafts, { source, importBatchId: batchId });
    const tags = await tagRepo.list(db);
    set((s) => ({ pokemon: [...created.slice().reverse(), ...s.pokemon], tags, version: s.version + 1 }));
    return created;
  },

  async updatePokemon(id, patch) {
    const db = await getDb();
    const next = await pokemonRepo.update(db, id, patch);
    if (!next) return;
    const tags = patch.tags ? await tagRepo.list(db) : get().tags;
    set((s) => ({ pokemon: s.pokemon.map((p) => (p.id === id ? next : p)), tags, version: s.version + 1 }));
  },

  async deletePokemon(id) {
    const db = await getDb();
    await pokemonRepo.softDelete(db, id);
    set((s) => ({ pokemon: s.pokemon.filter((p) => p.id !== id), version: s.version + 1 }));
  },

  async restorePokemon(id) {
    const db = await getDb();
    await pokemonRepo.restore(db, id);
    const restored = await pokemonRepo.get(db, id);
    if (restored) set((s) => ({ pokemon: [restored, ...s.pokemon], version: s.version + 1 }));
  },

  async toggleFavorite(id) {
    const p = get().pokemon.find((x) => x.id === id);
    if (p) await get().updatePokemon(id, { favorite: !p.favorite });
  },

  async setResource(type, scope, amount) {
    const db = await getDb();
    await resourceRepo.set(db, type, scope, amount);
    const resources = await resourceRepo.list(db);
    set((s) => ({ resources, version: s.version + 1 }));
  },

  async saveTeam(team) {
    const db = await getDb();
    const id = await teamRepo.save(db, team);
    set({ teams: await teamRepo.list(db) });
    return id;
  },

  async removeTeam(id) {
    const db = await getDb();
    await teamRepo.remove(db, id);
    set({ teams: await teamRepo.list(db) });
  },

  async reloadPlan() {
    const db = await getDb();
    set({ plan: await planRepo.list(db) });
  },

  async reloadTags() {
    const db = await getDb();
    set({ tags: await tagRepo.list(db) });
  },

  async wipe() {
    const db = await getDb();
    await wipeUserData(db);
    set((s) => ({ trainer: null, pokemon: [], resources: [], tags: [], teams: [], plan: [], version: s.version + 1 }));
  },
}));

export const usePokemonById = (id: string | undefined) => useData((s) => (id ? s.pokemon.find((p) => p.id === id) : undefined));
