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
  /**
   * Rate of Perceived Exertion, 1–10. Null for rest days, and for sessions where the player gave
   * watch numbers (heart rate or calories) instead of a rating.
   */
  rpe: number | null;
  /** Average heart rate over the session (bpm), typed in from the player's watch. Null if not given. */
  avgHeartRate: number | null;
  /** Highest heart rate reached in the session (bpm). Null if not given. */
  peakHeartRate: number | null;
  /** Total calories burned in the session (kcal), as the player's watch reported it. Null if not given. */
  caloriesBurned: number | null;
  /**
   * How the session went, 1–10: the player's own view of their performance. Not the same as
   * effort (`rpe`), which is how hard it was. Null for rest days and sessions logged before this existed.
   */
  sessionQuality: number | null;
  /** Hours slept the night before. Null if not given. */
  sleepHours: number | null;
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
  avgHeartRate?: number | null;
  peakHeartRate?: number | null;
  caloriesBurned?: number | null;
  sessionQuality?: number | null;
  sleepHours?: number | null;
  notes?: string | null;
}

/** Partial update; any omitted field keeps its current value. */
export type TrainingSessionPatch = Partial<Omit<NewTrainingSession, 'date'>> & { date?: string };
