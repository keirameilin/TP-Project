import type { SqlDatabase } from '../../db/types';
import type {
  NewTrainingSession,
  SessionType,
  TrainingSession,
  TrainingSessionPatch,
} from './types';
import {
  assertValidSession,
  DuplicateDateError,
  toLocalDateString,
  type SessionFields,
} from './validation';

interface TrainingSessionRow {
  id: number;
  date: string;
  session_type: SessionType;
  duration_minutes: number | null;
  rpe: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  'id, date, session_type, duration_minutes, rpe, notes, created_at, updated_at';

function fromRow(row: TrainingSessionRow): TrainingSession {
  return {
    id: row.id,
    date: row.date,
    sessionType: row.session_type,
    durationMinutes: row.duration_minutes,
    rpe: row.rpe,
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

export interface TrainingSessionRepositoryOptions {
  /** Injectable clock, used for the default date and timestamps. */
  now?: () => Date;
}

export class TrainingSessionRepository {
  private readonly now: () => Date;

  constructor(
    private readonly db: SqlDatabase,
    options: TrainingSessionRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async create(input: NewTrainingSession): Promise<TrainingSession> {
    const fields: SessionFields = {
      date: input.date ?? toLocalDateString(this.now()),
      sessionType: input.sessionType,
      durationMinutes: input.durationMinutes ?? null,
      rpe: input.rpe ?? null,
      notes: normalizeNotes(input.notes),
    };
    assertValidSession(fields);
    await this.assertDateAvailable(fields.date);

    const timestamp = this.now().toISOString();
    const result = await this.db.runAsync(
      `INSERT INTO training_sessions
         (date, session_type, duration_minutes, rpe, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fields.date,
        fields.sessionType,
        fields.durationMinutes,
        fields.rpe,
        fields.notes,
        timestamp,
        timestamp,
      ],
    );
    return (await this.getById(result.lastInsertRowId))!;
  }

  async getById(id: number): Promise<TrainingSession | null> {
    const row = await this.db.getFirstAsync<TrainingSessionRow>(
      `SELECT ${COLUMNS} FROM training_sessions WHERE id = ?`,
      [id],
    );
    return row ? fromRow(row) : null;
  }

  async getByDate(date: string): Promise<TrainingSession | null> {
    const row = await this.db.getFirstAsync<TrainingSessionRow>(
      `SELECT ${COLUMNS} FROM training_sessions WHERE date = ?`,
      [date],
    );
    return row ? fromRow(row) : null;
  }

  /** Lists sessions newest first, optionally limited to an inclusive date range. */
  async list(range: { from?: string; to?: string } = {}): Promise<TrainingSession[]> {
    const rows = await this.db.getAllAsync<TrainingSessionRow>(
      `SELECT ${COLUMNS} FROM training_sessions
       WHERE (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)
       ORDER BY date DESC`,
      [range.from ?? null, range.from ?? null, range.to ?? null, range.to ?? null],
    );
    return rows.map(fromRow);
  }

  /**
   * Applies a partial update. The merged result is re-validated as a whole, so
   * e.g. switching a rest_day to a match requires duration and RPE.
   * Returns null if the session does not exist.
   */
  async update(id: number, patch: TrainingSessionPatch): Promise<TrainingSession | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const fields: SessionFields = {
      date: patch.date ?? existing.date,
      sessionType: patch.sessionType ?? existing.sessionType,
      durationMinutes:
        patch.durationMinutes !== undefined ? patch.durationMinutes : existing.durationMinutes,
      rpe: patch.rpe !== undefined ? patch.rpe : existing.rpe,
      notes: patch.notes !== undefined ? normalizeNotes(patch.notes) : existing.notes,
    };
    assertValidSession(fields);
    if (fields.date !== existing.date) await this.assertDateAvailable(fields.date);

    await this.db.runAsync(
      `UPDATE training_sessions
       SET date = ?, session_type = ?, duration_minutes = ?, rpe = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [
        fields.date,
        fields.sessionType,
        fields.durationMinutes,
        fields.rpe,
        fields.notes,
        this.now().toISOString(),
        id,
      ],
    );
    return this.getById(id);
  }

  /** Returns true if a session was deleted. */
  async delete(id: number): Promise<boolean> {
    const result = await this.db.runAsync('DELETE FROM training_sessions WHERE id = ?', [id]);
    return result.changes > 0;
  }

  private async assertDateAvailable(date: string): Promise<void> {
    if (await this.getByDate(date)) throw new DuplicateDateError(date);
  }
}
