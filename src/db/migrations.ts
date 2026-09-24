import type { SqlDatabase } from './types';

/**
 * Ordered list of schema migrations. Index + 1 is the schema version.
 * Never edit a shipped migration — append a new one instead.
 */
const MIGRATIONS: string[] = [
  // v1: training sessions
  `
  CREATE TABLE training_sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    date             TEXT    NOT NULL UNIQUE,  -- local calendar date, YYYY-MM-DD
    session_type     TEXT    NOT NULL CHECK (session_type IN
                       ('match', 'hiit_conditioning', 'technical_tactical', 'gym_strength', 'rest_day')),
    duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    rpe              INTEGER CHECK (rpe IS NULL OR rpe BETWEEN 1 AND 10),
    notes            TEXT,
    created_at       TEXT    NOT NULL,          -- ISO-8601 UTC timestamp
    updated_at       TEXT    NOT NULL,
    CHECK (session_type = 'rest_day' OR (duration_minutes IS NOT NULL AND rpe IS NOT NULL))
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Brings the database up to the latest schema version using PRAGMA user_version. */
export async function migrate(db: SqlDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.execAsync(`BEGIN; ${MIGRATIONS[version]} PRAGMA user_version = ${version + 1}; COMMIT;`);
  }
}
