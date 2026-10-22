import { z } from 'zod';
import type { OwnedPokemon } from '../types';

/** Backup/export file format. `schemaVersion` is bumped on any breaking change; older versions stay importable. */
export const BACKUP_APP = 'go-compass';
export const BACKUP_SCHEMA_VERSION = 1;

const ivSchema = z.object({
  atk: z.number().int().min(0).max(15),
  def: z.number().int().min(0).max(15),
  sta: z.number().int().min(0).max(15),
});

export const ownedPokemonSchema = z.object({
  id: z.string().min(1),
  speciesId: z.number().int().positive(),
  form: z.string().default('Normal'),
  nickname: z.string().nullable().default(null),
  cp: z.number().int().min(10).max(99999).nullable().default(null),
  hp: z.number().int().min(1).max(9999).nullable().default(null),
  level: z.number().min(1).max(51).nullable().default(null),
  ivs: ivSchema.nullable().default(null),
  fastMove: z.string().nullable().default(null),
  chargedMove1: z.string().nullable().default(null),
  chargedMove2: z.string().nullable().default(null),
  shiny: z.boolean().default(false),
  shadow: z.boolean().default(false),
  purified: z.boolean().default(false),
  lucky: z.boolean().default(false),
  favorite: z.boolean().default(false),
  gender: z.enum(['male', 'female', 'unknown']).default('unknown'),
  size: z.enum(['XXS', 'XS', 'M', 'XL', 'XXL']).nullable().default(null),
  tags: z.array(z.string()).default([]),
  notes: z.string().nullable().default(null),
  dateCaught: z.string().nullable().default(null),
  dynamaxEligible: z.boolean().default(false),
  source: z.enum(['manual', 'screenshot', 'csv', 'json', 'backup', 'demo', 'ai-screenshot']).default('backup'),
  importBatchId: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().default(null),
});

export const resourceSchema = z.object({
  type: z.string(),
  scope: z.string().nullable(),
  amount: z.number().int().min(0),
});

export const trainerSchema = z.object({
  nickname: z.string(),
  trainerLevel: z.number().int().min(1).max(80),
  goals: z.array(z.object({ goal: z.string(), weight: z.number().min(0).max(1) })).default([]),
  playStyle: z.string().nullable().default(null),
  language: z.enum(['en', 'es']).default('en'),
});

export const savedTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  mode: z.enum(['raid', 'great', 'ultra', 'master', 'little']),
  bossKey: z.string().nullable().default(null),
  memberIds: z.array(z.string()),
  createdAt: z.string(),
});

export const planActionSchema = z.object({
  id: z.string(),
  pokemonId: z.string().nullable(),
  actionType: z.string(),
  title: z.string(),
  targetLevel: z.number().nullable().default(null),
  targetSpeciesKey: z.string().nullable().default(null),
  estimatedStardust: z.number().default(0),
  estimatedCandy: z.number().default(0),
  estimatedXl: z.number().default(0),
  priority: z.number().int().default(3),
  status: z.enum(['planned', 'done', 'skipped']).default('planned'),
  note: z.string().nullable().default(null),
  createdAt: z.string(),
});

export const backupSchema = z.object({
  app: z.literal(BACKUP_APP),
  schemaVersion: z.number().int().min(1).max(BACKUP_SCHEMA_VERSION),
  exportedAt: z.string(),
  trainer: trainerSchema.nullable().default(null),
  pokemon: z.array(ownedPokemonSchema),
  resources: z.array(resourceSchema).default([]),
  teams: z.array(savedTeamSchema).default([]),
  plan: z.array(planActionSchema).default([]),
  tags: z.array(z.object({ id: z.string(), name: z.string(), color: z.string().nullable().default(null) })).default([]),
});

export type BackupFile = z.infer<typeof backupSchema>;
export type BackupPokemon = z.infer<typeof ownedPokemonSchema>;
export type SavedTeamRecord = z.infer<typeof savedTeamSchema>;
export type PlanActionRecord = z.infer<typeof planActionSchema>;

export function serializeBackup(b: Omit<BackupFile, 'app' | 'schemaVersion' | 'exportedAt'>, now = new Date()): string {
  const file: BackupFile = { app: BACKUP_APP, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: now.toISOString(), ...b };
  return JSON.stringify(file, null, 2);
}

export type ParseBackupResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; error: string; issues: string[] };

export function parseBackup(text: string): ParseBackupResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.', issues: [] };
  }
  const r = backupSchema.safeParse(json);
  if (!r.success) {
    return {
      ok: false,
      error: 'The file is not a valid GO Compass backup.',
      issues: r.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  return { ok: true, backup: r.data };
}

export function pokemonToBackup(p: OwnedPokemon): BackupPokemon {
  return ownedPokemonSchema.parse(p);
}
