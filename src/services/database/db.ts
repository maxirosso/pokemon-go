import * as SQLite from 'expo-sqlite';
import { DB_NAME, LATEST_VERSION, MIGRATIONS } from './schema';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Applies pending migrations inside one transaction each; safe to call repeatedly. */
export async function migrate(db: SQLite.SQLiteDatabase): Promise<number> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  if (current > LATEST_VERSION) {
    throw new Error(`Database is from a newer app version (${current} > ${LATEST_VERSION}). Update the app.`);
  }
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    await db.withTransactionAsync(async () => {
      await db.execAsync(m.sql);
      await db.execAsync(`PRAGMA user_version = ${m.version}`);
    });
    current = m.version;
  }
  return current;
}

/** Singleton connection. Opened lazily and migrated once. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await migrate(db);
      return db;
    })().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

/** Closes and deletes the database — used by "Reset local data". */
export async function resetDatabase(): Promise<void> {
  const db = await getDb();
  await db.closeAsync();
  dbPromise = null;
  await SQLite.deleteDatabaseAsync(DB_NAME);
}

export const nowIso = () => new Date().toISOString();
