import type { BackupFile, PlanActionRecord, SavedTeamRecord } from '@/engine/io/backup';
import type { NewPokemon } from '@/engine/io/importers';
import type { GoalWeight, OwnedPokemon, PokemonSource, ResourceBalance, ResourceType } from '@/engine/types';
import { MIGRATIONS } from './schema';

/** The slice of expo-sqlite's SQLiteDatabase that the repositories use (lets tests run on node:sqlite). */
export interface DbLike {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export const LOCAL_TRAINER_ID = 'local';
const nowIso = () => new Date().toISOString();

let counter = 0;
/** RFC4122-ish v4 id. expo-crypto is used in the app; this fallback keeps the data layer dependency-free for tests. */
export function newId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  counter += 1;
  return `id-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------------------------
// trainer
// ---------------------------------------------------------------------------------------------

export interface TrainerProfile {
  id: string;
  nickname: string;
  trainerLevel: number;
  playStyle: string | null;
  goals: GoalWeight[];
  language: 'en' | 'es';
  createdAt: string;
  updatedAt: string;
}

interface TrainerRow {
  id: string;
  nickname: string;
  trainer_level: number;
  play_style: string | null;
  goals_json: string;
  preferred_language: string;
  created_at: string;
  updated_at: string;
}

const mapTrainer = (r: TrainerRow): TrainerProfile => ({
  id: r.id,
  nickname: r.nickname,
  trainerLevel: r.trainer_level,
  playStyle: r.play_style,
  goals: safeJson<GoalWeight[]>(r.goals_json, []),
  language: r.preferred_language === 'es' ? 'es' : 'en',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function safeJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export const trainerRepo = {
  async get(db: DbLike): Promise<TrainerProfile | null> {
    const r = await db.getFirstAsync<TrainerRow>('SELECT * FROM trainer_profile WHERE id = ?', LOCAL_TRAINER_ID);
    return r ? mapTrainer(r) : null;
  },
  async upsert(
    db: DbLike,
    p: { nickname: string; trainerLevel: number; playStyle?: string | null; goals?: GoalWeight[]; language?: 'en' | 'es' },
  ): Promise<TrainerProfile> {
    const now = nowIso();
    const existing = await trainerRepo.get(db);
    if (existing) {
      await db.runAsync(
        'UPDATE trainer_profile SET nickname = ?, trainer_level = ?, play_style = ?, goals_json = ?, preferred_language = ?, updated_at = ? WHERE id = ?',
        p.nickname,
        p.trainerLevel,
        p.playStyle ?? existing.playStyle,
        JSON.stringify(p.goals ?? existing.goals),
        p.language ?? existing.language,
        now,
        LOCAL_TRAINER_ID,
      );
    } else {
      await db.runAsync(
        'INSERT INTO trainer_profile (id, nickname, trainer_level, play_style, goals_json, preferred_language, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        LOCAL_TRAINER_ID,
        p.nickname,
        p.trainerLevel,
        p.playStyle ?? null,
        JSON.stringify(p.goals ?? []),
        p.language ?? 'en',
        now,
        now,
      );
    }
    return (await trainerRepo.get(db)) as TrainerProfile;
  },
};

// ---------------------------------------------------------------------------------------------
// pokémon
// ---------------------------------------------------------------------------------------------

interface PokemonRow {
  id: string;
  species_id: number;
  form: string;
  nickname: string | null;
  cp: number | null;
  hp: number | null;
  level: number | null;
  atk_iv: number | null;
  def_iv: number | null;
  sta_iv: number | null;
  fast_move: string | null;
  charged_move_1: string | null;
  charged_move_2: string | null;
  shiny: number;
  shadow: number;
  purified: number;
  lucky: number;
  favorite: number;
  gender: string;
  size: string | null;
  notes: string | null;
  date_caught: string | null;
  dynamax: number;
  source: string;
  import_batch_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  tags: string | null;
}

const TAG_SEP = '\u001f';
const SELECT_POKEMON = `SELECT p.*, (SELECT GROUP_CONCAT(pt.tag, char(31)) FROM pokemon_tag pt WHERE pt.pokemon_id = p.id) AS tags FROM owned_pokemon p`;

function mapPokemon(r: PokemonRow): OwnedPokemon {
  return {
    id: r.id,
    speciesId: r.species_id,
    form: r.form,
    nickname: r.nickname,
    cp: r.cp,
    hp: r.hp,
    level: r.level,
    ivs: r.atk_iv === null || r.def_iv === null || r.sta_iv === null ? null : { atk: r.atk_iv, def: r.def_iv, sta: r.sta_iv },
    fastMove: r.fast_move,
    chargedMove1: r.charged_move_1,
    chargedMove2: r.charged_move_2,
    shiny: !!r.shiny,
    shadow: !!r.shadow,
    purified: !!r.purified,
    lucky: !!r.lucky,
    favorite: !!r.favorite,
    gender: r.gender === 'male' || r.gender === 'female' ? r.gender : 'unknown',
    size: (r.size as OwnedPokemon['size']) ?? null,
    tags: r.tags ? r.tags.split(TAG_SEP) : [],
    notes: r.notes,
    dateCaught: r.date_caught,
    dynamaxEligible: !!r.dynamax,
    source: r.source as PokemonSource,
    importBatchId: r.import_batch_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

const INSERT_POKEMON = `INSERT INTO owned_pokemon (id, trainer_id, species_id, form, nickname, cp, hp, level, atk_iv, def_iv, sta_iv,
  fast_move, charged_move_1, charged_move_2, shiny, shadow, purified, lucky, favorite, gender, size, notes, date_caught, dynamax,
  source, import_batch_id, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

function pokemonParams(p: OwnedPokemon): (string | number | null)[] {
  return [
    p.id,
    LOCAL_TRAINER_ID,
    p.speciesId,
    p.form,
    p.nickname,
    p.cp,
    p.hp,
    p.level,
    p.ivs?.atk ?? null,
    p.ivs?.def ?? null,
    p.ivs?.sta ?? null,
    p.fastMove,
    p.chargedMove1,
    p.chargedMove2,
    p.shiny ? 1 : 0,
    p.shadow ? 1 : 0,
    p.purified ? 1 : 0,
    p.lucky ? 1 : 0,
    p.favorite ? 1 : 0,
    p.gender,
    p.size,
    p.notes,
    p.dateCaught,
    p.dynamaxEligible ? 1 : 0,
    p.source,
    p.importBatchId,
    p.createdAt,
    p.updatedAt,
    p.deletedAt,
  ];
}

async function setTagsInner(db: DbLike, pokemonId: string, tags: string[]) {
  await db.runAsync('DELETE FROM pokemon_tag WHERE pokemon_id = ?', pokemonId);
  for (const tag of new Set(tags.map((t) => t.trim()).filter(Boolean))) {
    await db.runAsync('INSERT OR IGNORE INTO tag (name, color) VALUES (?, NULL)', tag);
    await db.runAsync('INSERT OR IGNORE INTO pokemon_tag (pokemon_id, tag) VALUES (?, ?)', pokemonId, tag);
  }
}

export interface InsertMeta {
  source: PokemonSource;
  importBatchId?: string | null;
  /** Use when restoring: keep ids/timestamps from the backup. */
  preserve?: boolean;
}

export const pokemonRepo = {
  async listActive(db: DbLike): Promise<OwnedPokemon[]> {
    const rows = await db.getAllAsync<PokemonRow>(`${SELECT_POKEMON} WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC, p.rowid DESC`);
    return rows.map(mapPokemon);
  },
  async listDeleted(db: DbLike): Promise<OwnedPokemon[]> {
    const rows = await db.getAllAsync<PokemonRow>(`${SELECT_POKEMON} WHERE p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC`);
    return rows.map(mapPokemon);
  },
  async get(db: DbLike, id: string): Promise<OwnedPokemon | null> {
    const r = await db.getFirstAsync<PokemonRow>(`${SELECT_POKEMON} WHERE p.id = ?`, id);
    return r ? mapPokemon(r) : null;
  },
  async count(db: DbLike): Promise<number> {
    const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM owned_pokemon WHERE deleted_at IS NULL');
    return r?.n ?? 0;
  },
  async insert(db: DbLike, p: NewPokemon, meta: InsertMeta): Promise<OwnedPokemon> {
    const [created] = await pokemonRepo.insertMany(db, [p], meta);
    return created;
  },
  async insertMany(db: DbLike, list: NewPokemon[], meta: InsertMeta): Promise<OwnedPokemon[]> {
    const created: OwnedPokemon[] = [];
    await db.withTransactionAsync(async () => {
      const base = Date.now();
      let i = 0;
      for (const p of list) {
        const ts = new Date(base + i).toISOString(); // monotonically increasing so "recently added" sorts stably
        i += 1;
        const full: OwnedPokemon = {
          ...p,
          id: newId(),
          source: meta.source,
          importBatchId: meta.importBatchId ?? null,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
        };
        await db.runAsync(INSERT_POKEMON, ...pokemonParams(full));
        await setTagsInner(db, full.id, full.tags);
        created.push(full);
      }
    });
    return created;
  },
  /** Restore full records (keeps ids/timestamps) — used by backup restore. */
  async upsertRecords(db: DbLike, list: OwnedPokemon[]): Promise<void> {
    await db.withTransactionAsync(async () => {
      for (const p of list) {
        await db.runAsync('DELETE FROM owned_pokemon WHERE id = ?', p.id);
        await db.runAsync(INSERT_POKEMON, ...pokemonParams(p));
        await setTagsInner(db, p.id, p.tags);
      }
    });
  },
  async update(db: DbLike, id: string, patch: Partial<NewPokemon>): Promise<OwnedPokemon | null> {
    const existing = await pokemonRepo.get(db, id);
    if (!existing) return null;
    const next: OwnedPokemon = { ...existing, ...patch, updatedAt: nowIso() };
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE owned_pokemon SET species_id=?, form=?, nickname=?, cp=?, hp=?, level=?, atk_iv=?, def_iv=?, sta_iv=?, fast_move=?, charged_move_1=?, charged_move_2=?,
         shiny=?, shadow=?, purified=?, lucky=?, favorite=?, gender=?, size=?, notes=?, date_caught=?, dynamax=?, updated_at=? WHERE id=?`,
        next.speciesId,
        next.form,
        next.nickname,
        next.cp,
        next.hp,
        next.level,
        next.ivs?.atk ?? null,
        next.ivs?.def ?? null,
        next.ivs?.sta ?? null,
        next.fastMove,
        next.chargedMove1,
        next.chargedMove2,
        next.shiny ? 1 : 0,
        next.shadow ? 1 : 0,
        next.purified ? 1 : 0,
        next.lucky ? 1 : 0,
        next.favorite ? 1 : 0,
        next.gender,
        next.size,
        next.notes,
        next.dateCaught,
        next.dynamaxEligible ? 1 : 0,
        next.updatedAt,
        id,
      );
      if (patch.tags) await setTagsInner(db, id, patch.tags);
    });
    return next;
  },
  async softDelete(db: DbLike, id: string): Promise<void> {
    await db.runAsync('UPDATE owned_pokemon SET deleted_at = ?, updated_at = ? WHERE id = ?', nowIso(), nowIso(), id);
  },
  async restore(db: DbLike, id: string): Promise<void> {
    await db.runAsync('UPDATE owned_pokemon SET deleted_at = NULL, updated_at = ? WHERE id = ?', nowIso(), id);
  },
  async purgeDeleted(db: DbLike): Promise<void> {
    await db.runAsync('DELETE FROM owned_pokemon WHERE deleted_at IS NOT NULL');
  },
  async deleteAll(db: DbLike): Promise<void> {
    await db.runAsync('DELETE FROM owned_pokemon');
  },
  async deleteByBatch(db: DbLike, batchId: string): Promise<void> {
    await db.runAsync('DELETE FROM owned_pokemon WHERE import_batch_id = ?', batchId);
  },
  async deleteBySource(db: DbLike, source: PokemonSource): Promise<void> {
    await db.runAsync('DELETE FROM owned_pokemon WHERE source = ?', source);
  },
};

// ---------------------------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------------------------

export interface TagRecord {
  name: string;
  color: string | null;
  count: number;
}

export const tagRepo = {
  async list(db: DbLike): Promise<TagRecord[]> {
    const rows = await db.getAllAsync<{ name: string; color: string | null; n: number }>(
      `SELECT t.name, t.color, (SELECT COUNT(*) FROM pokemon_tag pt JOIN owned_pokemon p ON p.id = pt.pokemon_id WHERE pt.tag = t.name AND p.deleted_at IS NULL) AS n
       FROM tag t ORDER BY t.name COLLATE NOCASE`,
    );
    return rows.map((r) => ({ name: r.name, color: r.color, count: r.n }));
  },
  async create(db: DbLike, name: string, color: string | null = null): Promise<void> {
    await db.runAsync('INSERT OR IGNORE INTO tag (name, color) VALUES (?, ?)', name.trim(), color);
  },
  async rename(db: DbLike, from: string, to: string): Promise<void> {
    await db.runAsync('UPDATE tag SET name = ? WHERE name = ?', to.trim(), from);
  },
  async setColor(db: DbLike, name: string, color: string | null): Promise<void> {
    await db.runAsync('UPDATE tag SET color = ? WHERE name = ?', color, name);
  },
  async remove(db: DbLike, name: string): Promise<void> {
    await db.runAsync('DELETE FROM tag WHERE name = ?', name);
  },
};

// ---------------------------------------------------------------------------------------------
// resources
// ---------------------------------------------------------------------------------------------

export const resourceRepo = {
  async list(db: DbLike): Promise<ResourceBalance[]> {
    const rows = await db.getAllAsync<{ resource_type: string; scope: string; amount: number }>(
      'SELECT resource_type, scope, amount FROM resource_balance WHERE trainer_id = ?',
      LOCAL_TRAINER_ID,
    );
    return rows.map((r) => ({ type: r.resource_type as ResourceType, scope: r.scope === '' ? null : r.scope, amount: r.amount }));
  },
  async set(db: DbLike, type: ResourceType, scope: string | null, amount: number | null): Promise<void> {
    if (amount === null) {
      await db.runAsync('DELETE FROM resource_balance WHERE trainer_id = ? AND resource_type = ? AND scope = ?', LOCAL_TRAINER_ID, type, scope ?? '');
      return;
    }
    await db.runAsync(
      `INSERT INTO resource_balance (trainer_id, resource_type, scope, amount, updated_at) VALUES (?,?,?,?,?)
       ON CONFLICT(trainer_id, resource_type, scope) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`,
      LOCAL_TRAINER_ID,
      type,
      scope ?? '',
      Math.max(0, Math.round(amount)),
      nowIso(),
    );
  },
  async replaceAll(db: DbLike, list: ResourceBalance[]): Promise<void> {
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM resource_balance WHERE trainer_id = ?', LOCAL_TRAINER_ID);
      for (const r of list) await resourceRepo.set(db, r.type, r.scope, r.amount);
    });
  },
};

// ---------------------------------------------------------------------------------------------
// teams
// ---------------------------------------------------------------------------------------------

export const teamRepo = {
  async list(db: DbLike): Promise<SavedTeamRecord[]> {
    const teams = await db.getAllAsync<{ id: string; name: string; battle_mode: string; boss_key: string | null; created_at: string }>(
      'SELECT id, name, battle_mode, boss_key, created_at FROM saved_team WHERE trainer_id = ? ORDER BY created_at DESC',
      LOCAL_TRAINER_ID,
    );
    const out: SavedTeamRecord[] = [];
    for (const t of teams) {
      const members = await db.getAllAsync<{ owned_pokemon_id: string }>(
        `SELECT m.owned_pokemon_id FROM saved_team_member m JOIN owned_pokemon p ON p.id = m.owned_pokemon_id
         WHERE m.team_id = ? AND p.deleted_at IS NULL ORDER BY m.position`,
        t.id,
      );
      out.push({
        id: t.id,
        name: t.name,
        mode: t.battle_mode as SavedTeamRecord['mode'],
        bossKey: t.boss_key,
        memberIds: members.map((m) => m.owned_pokemon_id),
        createdAt: t.created_at,
      });
    }
    return out;
  },
  async save(db: DbLike, team: Omit<SavedTeamRecord, 'id' | 'createdAt'> & { id?: string }): Promise<string> {
    const id = team.id ?? newId();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM saved_team WHERE id = ?', id);
      await db.runAsync('INSERT INTO saved_team (id, trainer_id, name, battle_mode, boss_key, created_at) VALUES (?,?,?,?,?,?)', id, LOCAL_TRAINER_ID, team.name, team.mode, team.bossKey, nowIso());
      let pos = 0;
      for (const pid of team.memberIds) {
        await db.runAsync('INSERT INTO saved_team_member (team_id, owned_pokemon_id, position) VALUES (?,?,?)', id, pid, pos);
        pos += 1;
      }
    });
    return id;
  },
  async remove(db: DbLike, id: string): Promise<void> {
    await db.runAsync('DELETE FROM saved_team WHERE id = ?', id);
  },
};

// ---------------------------------------------------------------------------------------------
// investment plan
// ---------------------------------------------------------------------------------------------

interface ActionRow {
  id: string;
  owned_pokemon_id: string | null;
  action_type: string;
  title: string;
  target_level: number | null;
  target_species_key: string | null;
  est_stardust: number;
  est_candy: number;
  est_xl: number;
  priority: number;
  status: string;
  depends_on: string | null;
  note: string | null;
  reminder_at: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface PlanAction extends PlanActionRecord {
  dependsOn: string | null;
  reminderAt: string | null;
  completedAt: string | null;
}

const mapAction = (r: ActionRow): PlanAction => ({
  id: r.id,
  pokemonId: r.owned_pokemon_id,
  actionType: r.action_type,
  title: r.title,
  targetLevel: r.target_level,
  targetSpeciesKey: r.target_species_key,
  estimatedStardust: r.est_stardust,
  estimatedCandy: r.est_candy,
  estimatedXl: r.est_xl,
  priority: r.priority,
  status: r.status as PlanActionRecord['status'],
  note: r.note,
  createdAt: r.created_at,
  dependsOn: r.depends_on,
  reminderAt: r.reminder_at,
  completedAt: r.completed_at,
});

export const planRepo = {
  async list(db: DbLike): Promise<PlanAction[]> {
    const rows = await db.getAllAsync<ActionRow>(
      "SELECT * FROM investment_action WHERE trainer_id = ? ORDER BY CASE status WHEN 'planned' THEN 0 WHEN 'done' THEN 1 ELSE 2 END, priority, created_at",
      LOCAL_TRAINER_ID,
    );
    return rows.map(mapAction);
  },
  async add(db: DbLike, a: Omit<PlanAction, 'id' | 'createdAt' | 'completedAt' | 'status'> & { status?: PlanAction['status'] }): Promise<PlanAction> {
    const id = newId();
    const created = nowIso();
    await db.runAsync(
      `INSERT INTO investment_action (id, trainer_id, owned_pokemon_id, action_type, title, target_level, target_species_key, est_stardust, est_candy, est_xl, priority, status, depends_on, note, reminder_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      LOCAL_TRAINER_ID,
      a.pokemonId,
      a.actionType,
      a.title,
      a.targetLevel,
      a.targetSpeciesKey,
      a.estimatedStardust,
      a.estimatedCandy,
      a.estimatedXl,
      a.priority,
      a.status ?? 'planned',
      a.dependsOn,
      a.note,
      a.reminderAt,
      created,
    );
    return { ...a, id, createdAt: created, completedAt: null, status: a.status ?? 'planned' };
  },
  async setStatus(db: DbLike, id: string, status: PlanAction['status']): Promise<void> {
    await db.runAsync('UPDATE investment_action SET status = ?, completed_at = ? WHERE id = ?', status, status === 'done' ? nowIso() : null, id);
  },
  async setReminder(db: DbLike, id: string, at: string | null): Promise<void> {
    await db.runAsync('UPDATE investment_action SET reminder_at = ? WHERE id = ?', at, id);
  },
  async remove(db: DbLike, id: string): Promise<void> {
    await db.runAsync('DELETE FROM investment_action WHERE id = ?', id);
  },
  async replaceAll(db: DbLike, list: PlanActionRecord[]): Promise<void> {
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM investment_action WHERE trainer_id = ?', LOCAL_TRAINER_ID);
      for (const a of list) {
        let pokemonId = a.pokemonId;
        if (pokemonId) {
          const exists = await db.getFirstAsync<{ id: string }>('SELECT id FROM owned_pokemon WHERE id = ?', pokemonId);
          if (!exists) pokemonId = null;
        }
        await db.runAsync(
          `INSERT INTO investment_action (id, trainer_id, owned_pokemon_id, action_type, title, target_level, target_species_key, est_stardust, est_candy, est_xl, priority, status, note, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          a.id,
          LOCAL_TRAINER_ID,
          pokemonId,
          a.actionType,
          a.title,
          a.targetLevel,
          a.targetSpeciesKey,
          a.estimatedStardust,
          a.estimatedCandy,
          a.estimatedXl,
          a.priority,
          a.status,
          a.note,
          a.createdAt,
        );
      }
    });
  },
};

// ---------------------------------------------------------------------------------------------
// recommendation history
// ---------------------------------------------------------------------------------------------

export interface RecommendationRecord {
  pokemonId: string;
  action: string;
  priority: number;
  impact: number;
  costJson: string;
  reason: string;
  confidence: string;
  datasetVersion: string;
}

export const recommendationRepo = {
  async replaceCurrent(db: DbLike, list: RecommendationRecord[]): Promise<void> {
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM recommendation WHERE trainer_id = ?', LOCAL_TRAINER_ID);
      const now = nowIso();
      for (const r of list) {
        await db.runAsync(
          `INSERT INTO recommendation (id, trainer_id, owned_pokemon_id, action, priority, expected_impact, resource_cost_json, reason, confidence, dataset_version, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          newId(),
          LOCAL_TRAINER_ID,
          r.pokemonId,
          r.action,
          r.priority,
          r.impact,
          r.costJson,
          r.reason,
          r.confidence,
          r.datasetVersion,
          now,
        );
      }
    });
  },
};

// ---------------------------------------------------------------------------------------------
// import batches
// ---------------------------------------------------------------------------------------------

export const importBatchRepo = {
  async create(db: DbLike, source: string, fileName: string | null, accepted: number, rejected: number): Promise<string> {
    const id = newId();
    await db.runAsync('INSERT INTO import_batch (id, source, file_name, imported_at, accepted_count, rejected_count) VALUES (?,?,?,?,?,?)', id, source, fileName, nowIso(), accepted, rejected);
    return id;
  },
};

// ---------------------------------------------------------------------------------------------
// reference cache (last-known-good datasets + versions)
// ---------------------------------------------------------------------------------------------

export interface CachedDataset {
  provider: string;
  dataset: string;
  payload: string;
  fetchedAt: string;
}

export interface VersionRow {
  provider: string;
  dataset: string;
  version: string | null;
  fetchedAt: string;
  checksum: string | null;
}

export const referenceCacheRepo = {
  async getAll(db: DbLike, provider: string): Promise<CachedDataset[]> {
    const rows = await db.getAllAsync<{ provider: string; dataset: string; payload: string; fetched_at: string }>(
      'SELECT provider, dataset, payload, fetched_at FROM reference_cache WHERE provider = ?',
      provider,
    );
    return rows.map((r) => ({ provider: r.provider, dataset: r.dataset, payload: r.payload, fetchedAt: r.fetched_at }));
  },
  /** Atomically replaces datasets and their version rows (a failed refresh keeps the previous cache). */
  async putMany(db: DbLike, rows: { provider: string; dataset: string; payload: string; version: string | null; checksum: string | null }[]): Promise<void> {
    const now = nowIso();
    await db.withTransactionAsync(async () => {
      for (const r of rows) {
        await db.runAsync(
          `INSERT INTO reference_cache (provider, dataset, payload, fetched_at) VALUES (?,?,?,?)
           ON CONFLICT(provider, dataset) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
          r.provider,
          r.dataset,
          r.payload,
          now,
        );
        await db.runAsync(
          `INSERT INTO reference_version (provider, dataset, version, fetched_at, checksum) VALUES (?,?,?,?,?)
           ON CONFLICT(provider, dataset) DO UPDATE SET version = excluded.version, fetched_at = excluded.fetched_at, checksum = excluded.checksum`,
          r.provider,
          r.dataset,
          r.version,
          now,
          r.checksum,
        );
      }
    });
  },
  async versions(db: DbLike): Promise<VersionRow[]> {
    const rows = await db.getAllAsync<{ provider: string; dataset: string; version: string | null; fetched_at: string; checksum: string | null }>(
      'SELECT provider, dataset, version, fetched_at, checksum FROM reference_version',
    );
    return rows.map((r) => ({ provider: r.provider, dataset: r.dataset, version: r.version, fetchedAt: r.fetched_at, checksum: r.checksum }));
  },
  async clear(db: DbLike): Promise<void> {
    await db.runAsync('DELETE FROM reference_cache');
    await db.runAsync('DELETE FROM reference_version');
  },
};

export const speciesInfoCacheRepo = {
  async get(db: DbLike, key: string): Promise<{ payload: string; fetchedAt: string } | null> {
    const r = await db.getFirstAsync<{ payload: string; fetched_at: string }>('SELECT payload, fetched_at FROM species_info_cache WHERE cache_key = ?', key);
    return r ? { payload: r.payload, fetchedAt: r.fetched_at } : null;
  },
  async put(db: DbLike, key: string, payload: string): Promise<void> {
    await db.runAsync(
      'INSERT INTO species_info_cache (cache_key, payload, fetched_at) VALUES (?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at',
      key,
      payload,
      nowIso(),
    );
  },
  async clear(db: DbLike): Promise<void> {
    await db.runAsync('DELETE FROM species_info_cache');
  },
};

// ---------------------------------------------------------------------------------------------
// chat history
// ---------------------------------------------------------------------------------------------

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRow {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  contentJson: string;
  createdAt: string;
}

export const chatRepo = {
  async listConversations(db: DbLike): Promise<ChatConversation[]> {
    const rows = await db.getAllAsync<{ id: string; title: string; created_at: string; updated_at: string }>(
      'SELECT * FROM chat_conversation ORDER BY updated_at DESC',
    );
    return rows.map((r) => ({ id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at }));
  },
  async createConversation(db: DbLike, title: string): Promise<ChatConversation> {
    const id = newId();
    const now = nowIso();
    await db.runAsync('INSERT INTO chat_conversation (id, title, created_at, updated_at) VALUES (?,?,?,?)', id, title, now, now);
    return { id, title, createdAt: now, updatedAt: now };
  },
  async messages(db: DbLike, conversationId: string): Promise<ChatMessageRow[]> {
    const rows = await db.getAllAsync<{ id: string; conversation_id: string; role: string; content_json: string; created_at: string }>(
      'SELECT * FROM chat_message WHERE conversation_id = ? ORDER BY created_at, rowid',
      conversationId,
    );
    return rows.map((r) => ({ id: r.id, conversationId: r.conversation_id, role: r.role as 'user' | 'assistant', contentJson: r.content_json, createdAt: r.created_at }));
  },
  async addMessage(db: DbLike, conversationId: string, role: 'user' | 'assistant', content: unknown): Promise<ChatMessageRow> {
    const id = newId();
    const now = nowIso();
    const json = JSON.stringify(content);
    await db.runAsync('INSERT INTO chat_message (id, conversation_id, role, content_json, created_at) VALUES (?,?,?,?,?)', id, conversationId, role, json, now);
    await db.runAsync('UPDATE chat_conversation SET updated_at = ? WHERE id = ?', now, conversationId);
    return { id, conversationId, role, contentJson: json, createdAt: now };
  },
  async renameConversation(db: DbLike, id: string, title: string): Promise<void> {
    await db.runAsync('UPDATE chat_conversation SET title = ? WHERE id = ?', title, id);
  },
  async deleteConversation(db: DbLike, id: string): Promise<void> {
    await db.runAsync('DELETE FROM chat_conversation WHERE id = ?', id);
  },
  async clearAll(db: DbLike): Promise<void> {
    await db.runAsync('DELETE FROM chat_conversation');
  },
};

// ---------------------------------------------------------------------------------------------
// kv
// ---------------------------------------------------------------------------------------------

export const kvRepo = {
  async get(db: DbLike, key: string): Promise<string | null> {
    const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_kv WHERE key = ?', key);
    return r?.value ?? null;
  },
  async set(db: DbLike, key: string, value: string): Promise<void> {
    await db.runAsync('INSERT INTO app_kv (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  },
  async remove(db: DbLike, key: string): Promise<void> {
    await db.runAsync('DELETE FROM app_kv WHERE key = ?', key);
  },
};

// ---------------------------------------------------------------------------------------------
// backup / restore (whole-database snapshot in the public export format)
// ---------------------------------------------------------------------------------------------

export async function buildBackupData(db: DbLike): Promise<Omit<BackupFile, 'app' | 'schemaVersion' | 'exportedAt'>> {
  const trainer = await trainerRepo.get(db);
  const active = await pokemonRepo.listActive(db);
  const tags = await tagRepo.list(db);
  const resources = await resourceRepo.list(db);
  const teams = await teamRepo.list(db);
  const plan = await planRepo.list(db);
  return {
    trainer: trainer
      ? { nickname: trainer.nickname, trainerLevel: trainer.trainerLevel, goals: trainer.goals, playStyle: trainer.playStyle, language: trainer.language }
      : null,
    pokemon: active.map((p) => ({ ...p })),
    resources: resources.map((r) => ({ type: r.type, scope: r.scope, amount: r.amount })),
    teams: teams.map((t) => ({ ...t })),
    plan: plan.map((a) => ({
      id: a.id,
      pokemonId: a.pokemonId,
      actionType: a.actionType,
      title: a.title,
      targetLevel: a.targetLevel,
      targetSpeciesKey: a.targetSpeciesKey,
      estimatedStardust: a.estimatedStardust,
      estimatedCandy: a.estimatedCandy,
      estimatedXl: a.estimatedXl,
      priority: a.priority,
      status: a.status,
      note: a.note,
      createdAt: a.createdAt,
    })),
    tags: tags.map((t) => ({ id: t.name, name: t.name, color: t.color })),
  };
}

export type RestoreMode = 'replace' | 'merge';

export interface RestoreSummary {
  pokemonAdded: number;
  pokemonSkipped: number;
  teams: number;
  planActions: number;
}

/**
 * Restore a validated backup. `replace` wipes local data first; `merge` keeps what is there and only adds
 * Pokémon whose ids are not present yet (so restoring the same file twice never duplicates).
 */
export async function restoreBackup(db: DbLike, backup: BackupFile, mode: RestoreMode): Promise<RestoreSummary> {
  const summary: RestoreSummary = { pokemonAdded: 0, pokemonSkipped: 0, teams: 0, planActions: 0 };
  const existingTrainer = await trainerRepo.get(db);
  if (!existingTrainer) {
    await trainerRepo.upsert(db, {
      nickname: backup.trainer?.nickname ?? 'Trainer',
      trainerLevel: backup.trainer?.trainerLevel ?? 1,
      goals: (backup.trainer?.goals ?? []) as GoalWeight[],
      playStyle: backup.trainer?.playStyle ?? null,
      language: backup.trainer?.language ?? 'en',
    });
  } else if (mode === 'replace' && backup.trainer) {
    await trainerRepo.upsert(db, {
      nickname: backup.trainer.nickname,
      trainerLevel: backup.trainer.trainerLevel,
      goals: backup.trainer.goals as GoalWeight[],
      playStyle: backup.trainer.playStyle,
      language: backup.trainer.language,
    });
  }
  if (mode === 'replace') {
    await pokemonRepo.deleteAll(db);
    await db.runAsync('DELETE FROM tag');
  }
  const existingIds = new Set<string>();
  if (mode === 'merge') {
    const all = await db.getAllAsync<{ id: string }>('SELECT id FROM owned_pokemon');
    for (const r of all) existingIds.add(r.id);
  }
  const toInsert = backup.pokemon.filter((p) => !existingIds.has(p.id));
  summary.pokemonSkipped = backup.pokemon.length - toInsert.length;
  await pokemonRepo.upsertRecords(db, toInsert as OwnedPokemon[]);
  summary.pokemonAdded = toInsert.length;
  for (const t of backup.tags) if (t.color) await tagRepo.setColor(db, t.name, t.color);

  if (mode === 'replace') {
    await resourceRepo.replaceAll(db, backup.resources.map((r) => ({ type: r.type as ResourceType, scope: r.scope, amount: r.amount })));
    await planRepo.replaceAll(db, backup.plan);
    summary.planActions = backup.plan.length;
  } else {
    for (const r of backup.resources) await resourceRepo.set(db, r.type as ResourceType, r.scope, r.amount);
  }
  const knownIds = new Set((await db.getAllAsync<{ id: string }>('SELECT id FROM owned_pokemon')).map((r) => r.id));
  for (const team of backup.teams) {
    const members = team.memberIds.filter((id) => knownIds.has(id));
    await teamRepo.save(db, { id: team.id, name: team.name, mode: team.mode, bossKey: team.bossKey, memberIds: members });
    summary.teams += 1;
  }
  return summary;
}

/** Wipes all user data but keeps the schema (used by "Reset local data" so no app restart is needed). */
export async function wipeUserData(db: DbLike): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const table of [
      'pokemon_tag',
      'tag',
      'saved_team_member',
      'saved_team',
      'investment_action',
      'recommendation',
      'owned_pokemon',
      'import_batch',
      'resource_balance',
      'chat_message',
      'chat_conversation',
      'trainer_profile',
      'species_info_cache',
    ]) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
  });
}

/** Applies all migrations to a DbLike (used by tests and by `migrate`). */
export async function applyMigrations(db: DbLike): Promise<void> {
  for (const m of MIGRATIONS) await db.execAsync(m.sql);
}
