/**
 * SQLite schema + forward-only migrations (PRAGMA user_version).
 *
 * Design notes
 *  - Reference data (species/stats/moves) is NOT stored in user tables; owned Pokémon only reference a
 *    species id + form. Reference datasets are cached as blobs in `reference_cache`.
 *  - IVs are all-or-nothing (CHECK) and nullable: unknown IVs are never stored as 0 or 15.
 *  - Soft deletion (`deleted_at`) on Pokémon so accidental deletes can be undone; hard purge is explicit.
 *  - Foreign keys cascade from trainer → data; tags are plain strings with ON UPDATE/DELETE CASCADE.
 *  - Every imported row remembers its provenance (`source`, `import_batch_id`).
 */

export const DB_NAME = 'gocompass.db';

export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE trainer_profile (
  id TEXT PRIMARY KEY NOT NULL,
  nickname TEXT NOT NULL,
  trainer_level INTEGER NOT NULL CHECK (trainer_level BETWEEN 1 AND 80),
  play_style TEXT,
  goals_json TEXT NOT NULL DEFAULT '[]',
  preferred_language TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE import_batch (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  file_name TEXT,
  imported_at TEXT NOT NULL,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE owned_pokemon (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL REFERENCES trainer_profile(id) ON DELETE CASCADE,
  species_id INTEGER NOT NULL,
  form TEXT NOT NULL DEFAULT 'Normal',
  nickname TEXT,
  cp INTEGER CHECK (cp IS NULL OR cp BETWEEN 10 AND 99999),
  hp INTEGER CHECK (hp IS NULL OR hp BETWEEN 1 AND 9999),
  level REAL CHECK (level IS NULL OR level BETWEEN 1 AND 51),
  atk_iv INTEGER CHECK (atk_iv IS NULL OR atk_iv BETWEEN 0 AND 15),
  def_iv INTEGER CHECK (def_iv IS NULL OR def_iv BETWEEN 0 AND 15),
  sta_iv INTEGER CHECK (sta_iv IS NULL OR sta_iv BETWEEN 0 AND 15),
  fast_move TEXT,
  charged_move_1 TEXT,
  charged_move_2 TEXT,
  shiny INTEGER NOT NULL DEFAULT 0,
  shadow INTEGER NOT NULL DEFAULT 0,
  purified INTEGER NOT NULL DEFAULT 0,
  lucky INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0,
  gender TEXT NOT NULL DEFAULT 'unknown',
  size TEXT,
  notes TEXT,
  date_caught TEXT,
  dynamax INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  import_batch_id TEXT REFERENCES import_batch(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK ((atk_iv IS NULL AND def_iv IS NULL AND sta_iv IS NULL) OR (atk_iv IS NOT NULL AND def_iv IS NOT NULL AND sta_iv IS NOT NULL)),
  CHECK (NOT (shadow = 1 AND purified = 1))
);
CREATE INDEX idx_owned_species ON owned_pokemon(species_id, form);
CREATE INDEX idx_owned_active ON owned_pokemon(trainer_id, deleted_at);
CREATE INDEX idx_owned_created ON owned_pokemon(created_at);
CREATE INDEX idx_owned_batch ON owned_pokemon(import_batch_id);

CREATE TABLE tag (
  name TEXT PRIMARY KEY NOT NULL,
  color TEXT
);
CREATE TABLE pokemon_tag (
  pokemon_id TEXT NOT NULL REFERENCES owned_pokemon(id) ON DELETE CASCADE,
  tag TEXT NOT NULL REFERENCES tag(name) ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (pokemon_id, tag)
);
CREATE INDEX idx_pokemon_tag_tag ON pokemon_tag(tag);

CREATE TABLE resource_balance (
  trainer_id TEXT NOT NULL REFERENCES trainer_profile(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL CHECK (amount >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trainer_id, resource_type, scope)
);

CREATE TABLE saved_team (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL REFERENCES trainer_profile(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  battle_mode TEXT NOT NULL,
  boss_key TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE saved_team_member (
  team_id TEXT NOT NULL REFERENCES saved_team(id) ON DELETE CASCADE,
  owned_pokemon_id TEXT NOT NULL REFERENCES owned_pokemon(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (team_id, position)
);

CREATE TABLE investment_action (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL REFERENCES trainer_profile(id) ON DELETE CASCADE,
  owned_pokemon_id TEXT REFERENCES owned_pokemon(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  target_level REAL,
  target_species_key TEXT,
  est_stardust INTEGER NOT NULL DEFAULT 0,
  est_candy INTEGER NOT NULL DEFAULT 0,
  est_xl INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'planned',
  depends_on TEXT REFERENCES investment_action(id) ON DELETE SET NULL,
  note TEXT,
  reminder_at TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_action_status ON investment_action(trainer_id, status);

CREATE TABLE recommendation (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL REFERENCES trainer_profile(id) ON DELETE CASCADE,
  owned_pokemon_id TEXT REFERENCES owned_pokemon(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  priority INTEGER NOT NULL,
  expected_impact REAL NOT NULL DEFAULT 0,
  resource_cost_json TEXT NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL,
  confidence TEXT NOT NULL,
  dataset_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_recommendation_pokemon ON recommendation(owned_pokemon_id);

CREATE TABLE reference_version (
  provider TEXT NOT NULL,
  dataset TEXT NOT NULL,
  version TEXT,
  fetched_at TEXT NOT NULL,
  checksum TEXT,
  PRIMARY KEY (provider, dataset)
);
CREATE TABLE reference_cache (
  provider TEXT NOT NULL,
  dataset TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (provider, dataset)
);
CREATE TABLE species_info_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE chat_conversation (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE chat_message (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES chat_conversation(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_chat_message_conv ON chat_message(conversation_id, created_at);

CREATE TABLE app_kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`,
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
