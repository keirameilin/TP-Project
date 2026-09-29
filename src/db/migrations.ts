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
  // v2: food log (many entries per date)
  `
  CREATE TABLE food_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT    NOT NULL,                -- local calendar date, YYYY-MM-DD
    meal_type  TEXT    NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    food_name  TEXT    NOT NULL CHECK (length(trim(food_name)) > 0),
    calories   REAL    NOT NULL CHECK (calories >= 0),
    protein_g  REAL    NOT NULL CHECK (protein_g >= 0),
    carbs_g    REAL    NOT NULL CHECK (carbs_g >= 0),
    fat_g      REAL    NOT NULL CHECK (fat_g >= 0),
    created_at TEXT    NOT NULL,                -- ISO-8601 UTC timestamp
    updated_at TEXT    NOT NULL
  );
  CREATE INDEX idx_food_entries_date ON food_entries (date);
  `,
  // v3: body weight (one weigh-in per date)
  `
  CREATE TABLE body_weight_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT    NOT NULL UNIQUE,         -- local calendar date, YYYY-MM-DD
    weight_kg  REAL    NOT NULL CHECK (weight_kg > 0),
    created_at TEXT    NOT NULL,                -- ISO-8601 UTC timestamp
    updated_at TEXT    NOT NULL
  );
  `,
  // v4: per-day food log completeness (absent row = not marked)
  `
  CREATE TABLE food_log_days (
    date       TEXT NOT NULL PRIMARY KEY,       -- local calendar date, YYYY-MM-DD
    status     TEXT NOT NULL CHECK (status IN ('complete', 'incomplete')),
    updated_at TEXT NOT NULL                    -- ISO-8601 UTC timestamp
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
