import Database from 'better-sqlite3';

import { migrate } from '../db/migrations';
import type { SqlDatabase, SqlValue } from '../db/types';

/**
 * Wraps an in-memory better-sqlite3 database in the same async interface as
 * expo-sqlite, so repository tests run real SQL (constraints included) in Node.
 */
export async function createTestDatabase(): Promise<SqlDatabase & { close(): void }> {
  const raw = new Database(':memory:');
  const db = {
    async execAsync(source: string) {
      raw.exec(source);
    },
    async runAsync(source: string, params: SqlValue[]) {
      const r = raw.prepare(source).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: r.changes };
    },
    async getFirstAsync<T>(source: string, params: SqlValue[]) {
      return (raw.prepare(source).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, params: SqlValue[]) {
      return raw.prepare(source).all(...params) as T[];
    },
    close: () => raw.close(),
  };
  await migrate(db);
  return db;
}
