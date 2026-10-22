import type { DbLike } from '@/services/database/repositories';
import { applyMigrations } from '@/services/database/repositories';

/**
 * Test-only adapter that lets the real repositories/migrations run on Node's built-in SQLite
 * (same SQL engine family as expo-sqlite), so persistence logic is exercised for real.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

export async function createTestDb(): Promise<DbLike> {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  let depth = 0;
  const db: DbLike = {
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, ...params) {
      return raw.prepare(sql).run(...params);
    },
    async getAllAsync<T>(sql: string, ...params: (string | number | null)[]) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, ...params: (string | number | null)[]) {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async withTransactionAsync(task) {
      if (depth > 0) throw new Error('Nested transactions are not supported by expo-sqlite — do not nest.');
      depth += 1;
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        depth -= 1;
      }
    },
  };
  await applyMigrations(db);
  return db;
}
