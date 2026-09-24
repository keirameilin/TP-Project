/**
 * The subset of expo-sqlite's `SQLiteDatabase` API that the data layer uses.
 *
 * Repositories depend on this interface instead of expo-sqlite directly, so the
 * same code runs on-device (expo-sqlite) and in Jest (better-sqlite3 adapter).
 * expo-sqlite's `SQLiteDatabase` satisfies it structurally.
 */
export type SqlValue = string | number | null;

export interface RunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<RunResult>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
}
