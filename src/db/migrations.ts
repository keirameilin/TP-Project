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
  // v5: the player's profile (single row), used for heart-rate zones
  `
  CREATE TABLE player_profile (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    age            INTEGER NOT NULL CHECK (age BETWEEN 10 AND 100),
    max_heart_rate INTEGER CHECK (max_heart_rate IS NULL OR max_heart_rate BETWEEN 120 AND 230),
    updated_at     TEXT    NOT NULL             -- ISO-8601 UTC timestamp
  );
  `,
  // v6: heart-rate and calorie metrics imported from a watch (one row per date)
  `
  CREATE TABLE workout_metrics (
    date               TEXT    NOT NULL PRIMARY KEY,  -- local calendar date, YYYY-MM-DD
    source             TEXT    NOT NULL CHECK (source IN ('apple_health', 'health_connect')),
    workout_count      INTEGER NOT NULL CHECK (workout_count > 0),
    start_time         TEXT    NOT NULL,              -- ISO-8601 UTC timestamps
    end_time           TEXT    NOT NULL,
    duration_minutes   REAL    NOT NULL CHECK (duration_minutes >= 0),
    active_kcal        REAL    CHECK (active_kcal IS NULL OR active_kcal >= 0),
    avg_heart_rate     REAL,
    peak_heart_rate    REAL,
    heart_rate_minutes REAL    NOT NULL CHECK (heart_rate_minutes >= 0),
    zone1_minutes      REAL    NOT NULL,
    zone2_minutes      REAL    NOT NULL,
    zone3_minutes      REAL    NOT NULL,
    zone4_minutes      REAL    NOT NULL,
    zone5_minutes      REAL    NOT NULL,
    trimp              REAL    NOT NULL CHECK (trimp >= 0),
    max_heart_rate     INTEGER NOT NULL,              -- the max HR the zones were computed with
    imported_at        TEXT    NOT NULL
  );
  `,
  // v7: profile details for the baseline calorie/macro targets (all optional)
  `
  ALTER TABLE player_profile ADD COLUMN sex TEXT
    CHECK (sex IS NULL OR sex IN ('male', 'female'));
  ALTER TABLE player_profile ADD COLUMN height_cm REAL
    CHECK (height_cm IS NULL OR height_cm BETWEEN 100 AND 250);
  ALTER TABLE player_profile ADD COLUMN level TEXT
    CHECK (level IS NULL OR level IN ('recreational', 'competitive', 'professional'));
  `,
  // v8: planned (upcoming) sessions — what the player intends to do, separate from what was logged
  `
  CREATE TABLE planned_sessions (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    date                      TEXT    NOT NULL UNIQUE,  -- local calendar date, YYYY-MM-DD
    session_type              TEXT    NOT NULL CHECK (session_type IN
                                ('match', 'hiit_conditioning', 'technical_tactical', 'gym_strength', 'rest_day')),
    expected_duration_minutes INTEGER CHECK (expected_duration_minutes IS NULL OR expected_duration_minutes > 0),
    notes                     TEXT,
    created_at                TEXT    NOT NULL,          -- ISO-8601 UTC timestamp
    updated_at                TEXT    NOT NULL
  );
  `,
  // v9: numbers from the player's watch, typed in by hand for a session (all optional)
  `
  ALTER TABLE training_sessions ADD COLUMN avg_heart_rate INTEGER
    CHECK (avg_heart_rate IS NULL OR avg_heart_rate BETWEEN 40 AND 230);
  ALTER TABLE training_sessions ADD COLUMN peak_heart_rate INTEGER
    CHECK (peak_heart_rate IS NULL OR peak_heart_rate BETWEEN 40 AND 230);
  ALTER TABLE training_sessions ADD COLUMN calories_burned REAL
    CHECK (calories_burned IS NULL OR calories_burned BETWEEN 0 AND 3000);
  `,
  // v10: a session's effort can come from the player's rating OR from their watch numbers, so the
  // rating is no longer required when a heart rate or calories are given. SQLite can't change a
  // CHECK in place, so the table is rebuilt.
  `
  CREATE TABLE training_sessions_new (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    date             TEXT    NOT NULL UNIQUE,  -- local calendar date, YYYY-MM-DD
    session_type     TEXT    NOT NULL CHECK (session_type IN
                       ('match', 'hiit_conditioning', 'technical_tactical', 'gym_strength', 'rest_day')),
    duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    rpe              INTEGER CHECK (rpe IS NULL OR rpe BETWEEN 1 AND 10),
    avg_heart_rate   INTEGER CHECK (avg_heart_rate IS NULL OR avg_heart_rate BETWEEN 40 AND 230),
    peak_heart_rate  INTEGER CHECK (peak_heart_rate IS NULL OR peak_heart_rate BETWEEN 40 AND 230),
    calories_burned  REAL    CHECK (calories_burned IS NULL OR calories_burned BETWEEN 0 AND 3000),
    notes            TEXT,
    created_at       TEXT    NOT NULL,          -- ISO-8601 UTC timestamp
    updated_at       TEXT    NOT NULL,
    CHECK (session_type = 'rest_day' OR (duration_minutes IS NOT NULL AND
      (rpe IS NOT NULL OR avg_heart_rate IS NOT NULL OR calories_burned IS NOT NULL)))
  );
  INSERT INTO training_sessions_new
    (id, date, session_type, duration_minutes, rpe, avg_heart_rate, peak_heart_rate, calories_burned,
     notes, created_at, updated_at)
  SELECT id, date, session_type, duration_minutes, rpe, avg_heart_rate, peak_heart_rate, calories_burned,
         notes, created_at, updated_at
  FROM training_sessions;
  DROP TABLE training_sessions;
  ALTER TABLE training_sessions_new RENAME TO training_sessions;
  `,
  // v11: how the session went (separate from how hard it was) and last night's sleep. Both are
  // nullable so sessions logged before this keep working; the Log tab asks for the rating.
  `
  ALTER TABLE training_sessions ADD COLUMN session_quality INTEGER
    CHECK (session_quality IS NULL OR session_quality BETWEEN 1 AND 10);
  ALTER TABLE training_sessions ADD COLUMN sleep_hours REAL
    CHECK (sleep_hours IS NULL OR sleep_hours BETWEEN 0 AND 14);
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
