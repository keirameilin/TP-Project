import type { SessionType } from '../training/types';

/**
 * A session the player intends to do. Planned sessions live in their own table: a plan is an
 * intention, while a logged training session records what actually happened.
 */
export interface PlannedSession {
  id: number;
  /** Local calendar date, YYYY-MM-DD. At most one planned session per date. */
  date: string;
  sessionType: SessionType;
  expectedDurationMinutes: number | null;
  notes: string | null;
  /** ISO-8601 UTC timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Input for planning a session. `date` defaults to today (local time). */
export interface NewPlannedSession {
  date?: string;
  sessionType: SessionType;
  expectedDurationMinutes?: number | null;
  notes?: string | null;
}

/** Partial update; any omitted field keeps its current value. */
export type PlannedSessionPatch = Partial<NewPlannedSession>;

/** Stands in for the session type on a day with nothing planned. */
export const NONE_PLANNED = 'none_planned';

/** One day of a lookahead. */
export interface PlannedDay {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** The planned session type, or NONE_PLANNED. */
  plan: SessionType | typeof NONE_PLANNED;
  /** The full planned session, or null when nothing is planned. */
  session: PlannedSession | null;
}

/** Lookaheads and match-count windows both span this many days, counting the start date. */
export const WINDOW_DAYS = 7;
