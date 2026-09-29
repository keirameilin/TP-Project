import type { SqlDatabase } from '../../db/types';
import type { FoodLogDay, LogDayStatus } from './types';
import { assertValidLogDay } from './validation';

interface FoodLogDayRow {
  date: string;
  status: LogDayStatus;
  updated_at: string;
}

function fromRow(row: FoodLogDayRow): FoodLogDay {
  return { date: row.date, status: row.status, updatedAt: row.updated_at };
}

export interface FoodLogDayRepositoryOptions {
  /** Injectable clock, used for timestamps. */
  now?: () => Date;
}

/** Tracks whether the user has marked each day's food log complete or incomplete. */
export class FoodLogDayRepository {
  private readonly now: () => Date;

  constructor(
    private readonly db: SqlDatabase,
    options: FoodLogDayRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /** Marks a day; passing null clears the mark so the day is unmarked again. */
  async setStatus(date: string, status: LogDayStatus | null): Promise<FoodLogDay | null> {
    if (status === null) {
      await this.db.runAsync('DELETE FROM food_log_days WHERE date = ?', [date]);
      return null;
    }
    assertValidLogDay(date, status);

    await this.db.runAsync(
      `INSERT INTO food_log_days (date, status, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (date) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      [date, status, this.now().toISOString()],
    );
    return this.get(date);
  }

  async get(date: string): Promise<FoodLogDay | null> {
    const row = await this.db.getFirstAsync<FoodLogDayRow>(
      'SELECT date, status, updated_at FROM food_log_days WHERE date = ?',
      [date],
    );
    return row ? fromRow(row) : null;
  }

  /** Lists marked days newest first, optionally limited to an inclusive date range. */
  async list(range: { from?: string; to?: string } = {}): Promise<FoodLogDay[]> {
    const rows = await this.db.getAllAsync<FoodLogDayRow>(
      `SELECT date, status, updated_at FROM food_log_days
       WHERE (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)
       ORDER BY date DESC`,
      [range.from ?? null, range.from ?? null, range.to ?? null, range.to ?? null],
    );
    return rows.map(fromRow);
  }
}
