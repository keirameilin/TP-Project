export const SESSION_TYPES = [
  'match',
  'hiit_conditioning',
  'technical_tactical',
  'gym_strength',
  'rest_day',
] as const;

export type SessionType = (typeof SESSION_TYPES)[number];

export interface TrainingSession {
  id: number;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  sessionType: SessionType;
  /** Null only for rest days. */
  durationMinutes: number | null;
  /** Rate of Perceived Exertion, 1–10. Null only for rest days. */
  rpe: number | null;
  notes: string | null;
  /** ISO-8601 UTC timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a session. `date` defaults to today (local time). */
export interface NewTrainingSession {
  date?: string;
  sessionType: SessionType;
  durationMinutes?: number | null;
  rpe?: number | null;
  notes?: string | null;
}

/** Partial update; any omitted field keeps its current value. */
export type TrainingSessionPatch = Partial<Omit<NewTrainingSession, 'date'>> & { date?: string };
