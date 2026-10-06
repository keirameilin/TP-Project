import type { SqlDatabase } from '../../db/types';
import { addDays, toLocalDateString } from '../../lib/dates';
import type { SessionType } from '../training/types';
import {
  NONE_PLANNED,
  WINDOW_DAYS,
  type NewPlannedSession,
  type PlannedDay,
  type PlannedSession,
  type PlannedSessionPatch,
} from './types';
import {
  assertValidDate,
  assertValidPlannedSession,
  DuplicatePlannedDateError,
  type PlannedSessionFields,
} from './validation';

interface PlannedSessionRow {
  id: number;
  date: string;
  session_type: SessionType;
  expected_duration_minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id, date, session_type, expected_duration_minutes, notes, created_at, updated_at';

function fromRow(row: PlannedSessionRow): PlannedSession {
  return {
    id: row.id,
    date: row.date,
    sessionType: row.session_type,
    expectedDurationMinutes: row.expected_duration_minutes,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Blank notes are stored as null so "no notes" has a single representation. */
function normalizeNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : null;
}

/** The last date of a window that starts on `startDate` and spans WINDOW_DAYS days. */
const windowEnd = (startDate: string) => addDays(startDate, WINDOW_DAYS - 1);

export interface PlannedSessionRepositoryOptions {
  /** Injectable clock, used for "today", the default date and timestamps. */
  now?: () => Date;
}

export class PlannedSessionRepository {
  private readonly now: () => Date;

  constructor(
    private readonly db: SqlDatabase,
    options: PlannedSessionRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  private today(): string {
    return toLocalDateString(this.now());
  }

  /** Plans a session for today or a future date. Throws DuplicatePlannedDateError if the date is taken. */
  async create(input: NewPlannedSession): Promise<PlannedSession> {
    const today = this.today();
    const fields: PlannedSessionFields = {
      date: input.date ?? today,
      sessionType: input.sessionType,
      expectedDurationMinutes: input.expectedDurationMinutes ?? null,
      notes: normalizeNotes(input.notes),
    };
    assertValidPlannedSession(fields, { earliestDate: today });
    await this.assertDateAvailable(fields.date);

    const timestamp = this.now().toISOString();
    const result = await this.db.runAsync(
      `INSERT INTO planned_sessions
         (date, session_type, expected_duration_minutes, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fields.date, fields.sessionType, fields.expectedDurationMinutes, fields.notes, timestamp, timestamp],
    );
    return (await this.getById(result.lastInsertRowId))!;
  }

  async getById(id: number): Promise<PlannedSession | null> {
    const row = await this.db.getFirstAsync<PlannedSessionRow>(
      `SELECT ${COLUMNS} FROM planned_sessions WHERE id = ?`,
      [id],
    );
    return row ? fromRow(row) : null;
  }

  async getByDate(date: string): Promise<PlannedSession | null> {
    const row = await this.db.getFirstAsync<PlannedSessionRow>(
      `SELECT ${COLUMNS} FROM planned_sessions WHERE date = ?`,
      [date],
    );
    return row ? fromRow(row) : null;
  }

  /** Lists planned sessions in calendar order (earliest first), optionally limited to an inclusive date range. */
  async list(range: { from?: string; to?: string } = {}): Promise<PlannedSession[]> {
    const rows = await this.db.getAllAsync<PlannedSessionRow>(
      `SELECT ${COLUMNS} FROM planned_sessions
       WHERE (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)
       ORDER BY date`,
      [range.from ?? null, range.from ?? null, range.to ?? null, range.to ?? null],
    );
    return rows.map(fromRow);
  }

  /**
   * Applies a partial update; the merged result is re-validated as a whole.
   * A plan whose date has passed can still be edited, but a plan can only be moved to today or a
   * future date. Returns null if the planned session does not exist.
   */
  async update(id: number, patch: PlannedSessionPatch): Promise<PlannedSession | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const fields: PlannedSessionFields = {
      date: patch.date ?? existing.date,
      sessionType: patch.sessionType ?? existing.sessionType,
      expectedDurationMinutes:
        patch.expectedDurationMinutes !== undefined
          ? patch.expectedDurationMinutes
          : existing.expectedDurationMinutes,
      notes: patch.notes !== undefined ? normalizeNotes(patch.notes) : existing.notes,
    };
    const dateChanged = fields.date !== existing.date;
    assertValidPlannedSession(fields, { earliestDate: dateChanged ? this.today() : null });
    if (dateChanged) await this.assertDateAvailable(fields.date);

    await this.db.runAsync(
      `UPDATE planned_sessions
       SET date = ?, session_type = ?, expected_duration_minutes = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [
        fields.date,
        fields.sessionType,
        fields.expectedDurationMinutes,
        fields.notes,
        this.now().toISOString(),
        id,
      ],
    );
    return this.getById(id);
  }

  /** Returns true if a planned session was deleted. Past plans can be deleted too. */
  async delete(id: number): Promise<boolean> {
    const result = await this.db.runAsync('DELETE FROM planned_sessions WHERE id = ?', [id]);
    return result.changes > 0;
  }

  /**
   * The next 7 days as a list, starting from `startDate` (today by default) and including it.
   * Every day is present; days with nothing planned have `plan: NONE_PLANNED`.
   */
  async getLookahead(startDate: string = this.today()): Promise<PlannedDay[]> {
    assertValidDate(startDate, 'startDate');
    const planned = await this.list({ from: startDate, to: windowEnd(startDate) });
    const byDate = new Map(planned.map((s) => [s.date, s]));

    return Array.from({ length: WINDOW_DAYS }, (_, i) => {
      const date = addDays(startDate, i);
      const session = byDate.get(date) ?? null;
      return { date, plan: session?.sessionType ?? NONE_PLANNED, session };
    });
  }

  /** Counts planned matches in the 7-day window that starts on `startDate` and includes it. */
  async countMatchesInWindow(startDate: string): Promise<number> {
    assertValidDate(startDate, 'startDate');
    const row = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM planned_sessions
       WHERE session_type = 'match' AND date >= ? AND date <= ?`,
      [startDate, windowEnd(startDate)],
    );
    return row?.count ?? 0;
  }

  private async assertDateAvailable(date: string): Promise<void> {
    if (await this.getByDate(date)) throw new DuplicatePlannedDateError(date);
  }
}
