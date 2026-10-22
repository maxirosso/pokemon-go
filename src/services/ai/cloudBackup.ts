import { backupSchema, parseBackup, serializeBackup, type BackupFile } from '@/engine/io/backup';
import { getDb } from '@/services/database/db';
import { buildBackupData } from '@/services/database/repositories';
import { getSupabase } from './supabase';

/**
 * Optional cross-device backup. Stores the same JSON as the file export in `collection_backups`
 * (one row per user, protected by Row Level Security). Cross-device restore needs a real sign-in
 * (email one-time code); guest sessions can only restore on the same device.
 */

export async function sendEmailCode(email: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud is not configured.');
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw new Error(error.message);
}

export async function verifyEmailCode(email: string, token: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud is not configured.');
  const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw new Error(error.message);
}

export async function currentUserEmail(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.email ?? null;
}

export async function uploadBackup(): Promise<{ count: number }> {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud is not configured.');
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error('Sign in first.');
  const payload = JSON.parse(serializeBackup(await buildBackupData(await getDb()))) as BackupFile;
  const { error } = await sb
    .from('collection_backups')
    .upsert({ user_id: u.user.id, payload, pokemon_count: payload.pokemon.length, schema_version: payload.schemaVersion, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { count: payload.pokemon.length };
}

export async function downloadBackup(): Promise<BackupFile | null> {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud is not configured.');
  const { data, error } = await sb.from('collection_backups').select('payload').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const parsed = backupSchema.safeParse(data.payload);
  if (!parsed.success) throw new Error('The cloud backup is not a valid GO Compass backup.');
  return parsed.data;
}

export async function deleteCloudBackup(): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud is not configured.');
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;
  const { error } = await sb.from('collection_backups').delete().eq('user_id', u.user.id);
  if (error) throw new Error(error.message);
}

export { parseBackup };
