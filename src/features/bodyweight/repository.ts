import { toLocalDateString } from '../../lib/dates';
import type { SqlDatabase } from '../../db/types';
import type { BodyWeightEntry, NewBodyWeightEntry } from './types';
import { assertValidBodyWeight, type BodyWeightFields } from './validation';

interface BodyWeightRow {
  id: number;
  date: string;
  weight_kg: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id, date, weight_kg, created_at, updated_at';

function fromRow(row: BodyWeightRow): BodyWeightEntry {
  return {
    id: row.id,
    date: row.date,
    weightKg: row.weight_kg,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface BodyWeightRepositoryOptions {
  /** Injectable clock, used for the default date and timestamps. */
  now?: () => Date;
}

export class BodyWeightRepository {
  private readonly now: () => Date;

  constructor(
    private readonly db: SqlDatabase,
    options: BodyWeightRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Records the weigh-in for a date. Logging again for the same date replaces
   * the weight (keeping the original createdAt), so re-weighing just corrects it.
   */
  async log(input: NewBodyWeightEntry): Promise<BodyWeightEntry> {
    const fields: BodyWeightFields = {
      date: input.date ?? toLocalDateString(this.now()),
      weightKg: input.weightKg,
    };
    assertValidBodyWeight(fields);

    const timestamp = this.now().toISOString();
    await this.db.runAsync(
      `INSERT INTO body_weight_entries (date, weight_kg, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (date) DO UPDATE SET weight_kg = excluded.weight_kg, updated_at = excluded.updated_at`,
      [fields.date, fields.weightKg, timestamp, timestamp],
    );
    return (await this.getByDate(fields.date))!;
  }

  async getById(id: number): Promise<BodyWeightEntry | null> {
    const row = await this.db.getFirstAsync<BodyWeightRow>(
      `SELECT ${COLUMNS} FROM body_weight_entries WHERE id = ?`,
      [id],
    );
    return row ? fromRow(row) : null;
  }

  async getByDate(date: string): Promise<BodyWeightEntry | null> {
    const row = await this.db.getFirstAsync<BodyWeightRow>(
      `SELECT ${COLUMNS} FROM body_weight_entries WHERE date = ?`,
      [date],
    );
    return row ? fromRow(row) : null;
  }

  /** Lists weigh-ins newest first, optionally limited to an inclusive date range. */
  async list(range: { from?: string; to?: string } = {}): Promise<BodyWeightEntry[]> {
    const rows = await this.db.getAllAsync<BodyWeightRow>(
      `SELECT ${COLUMNS} FROM body_weight_entries
       WHERE (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)
       ORDER BY date DESC`,
      [range.from ?? null, range.from ?? null, range.to ?? null, range.to ?? null],
    );
    return rows.map(fromRow);
  }

  /** Returns true if a weigh-in was deleted. */
  async delete(id: number): Promise<boolean> {
    const result = await this.db.runAsync('DELETE FROM body_weight_entries WHERE id = ?', [id]);
    return result.changes > 0;
  }
}
