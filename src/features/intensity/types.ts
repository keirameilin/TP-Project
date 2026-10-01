export interface HeartRateSample {
  /** Epoch milliseconds. */
  time: number;
  bpm: number;
}

/** One workout's heart-rate samples and calories, from whatever source provides them. */
export interface WorkoutInput {
  /** Epoch milliseconds. */
  start: number;
  end: number;
  /** Active (not resting) calories; null if the source didn't record any. */
  activeKcal: number | null;
  heartRate: HeartRateSample[];
}

/** Zone minutes, index 0 = zone 1 (50–60% of max HR) … index 4 = zone 5 (90–100%). */
export type ZoneMinutes = [number, number, number, number, number];

/** A day's workouts, combined and reduced to effort metrics. */
export interface WorkoutAnalysis {
  workoutCount: number;
  /** ISO-8601 UTC timestamps of the first start and last end. */
  startTime: string;
  endTime: string;
  durationMinutes: number;
  activeKcal: number | null;
  /** Time-weighted average and highest heart rate; null if there were no samples. */
  avgHeartRate: number | null;
  peakHeartRate: number | null;
  /** Minutes covered by heart-rate samples (can be less than the duration if the watch had gaps). */
  heartRateMinutes: number;
  zoneMinutes: ZoneMinutes;
  /** Edwards TRIMP: minutes in each zone × the zone number (1–5), summed. */
  trimp: number;
  /** The max heart rate the zones were computed with. */
  maxHeartRate: number;
}
