import * as SQLite from 'expo-sqlite';

import { migrate } from './migrations';
import type { SqlDatabase } from './types';

const DATABASE_NAME = 'training.db';

let dbPromise: Promise<SqlDatabase> | null = null;

/** Opens (once) the on-device SQLite database and applies pending migrations. */
export function getDatabase(): Promise<SqlDatabase> {
  if (dbPromise) return dbPromise;

  const opening = (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await migrate(db);
    return db;
  })();
  // Allow a retry if opening failed.
  opening.catch(() => {
    dbPromise = null;
  });
  dbPromise = opening;
  return opening;
}
