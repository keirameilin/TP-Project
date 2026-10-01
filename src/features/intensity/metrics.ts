import type { PlayerProfile } from '../profile/types';
import type { WorkoutAnalysis, WorkoutInput, ZoneMinutes } from './types';

/** Lower bound of zones 1–5 as a fraction of max heart rate. Below 50% counts as no zone. */
export const ZONE_LOWER_BOUNDS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

/**
 * A heart-rate sample counts until the next one, but never longer than this. Watches sample every
 * few seconds during a workout, so a longer gap means the watch lost contact and shouldn't count.
 */
export const MAX_SAMPLE_GAP_MS = 60_000;

/** Below this much heart-rate data a measured effort score isn't meaningful. */
export const MIN_HEART_RATE_MINUTES_FOR_EFFORT = 5;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The player's measured max heart rate if they set one, otherwise the common 220 − age estimate. */
export function maxHeartRateFor(profile: Pick<PlayerProfile, 'age' | 'maxHeartRate'>): number {
  return profile.maxHeartRate ?? 220 - profile.age;
}

/** Zone 1–5 for a heart rate, or 0 when it's below zone 1. */
export function zoneFor(bpm: number, maxHeartRate: number): number {
  const fraction = bpm / maxHeartRate;
  let zone = 0;
  ZONE_LOWER_BOUNDS.forEach((bound, i) => {
    if (fraction >= bound) zone = i + 1;
  });
  return zone;
}

/**
 * Combines a day's workouts into effort metrics. Heart-rate samples are time-weighted (each counts
 * until the next sample, capped at MAX_SAMPLE_GAP_MS) so uneven sampling doesn't skew the result.
 * Returns null when there are no workouts.
 */
export function analyzeWorkouts(workouts: WorkoutInput[], maxHeartRate: number): WorkoutAnalysis | null {
  if (workouts.length === 0) return null;

  const zoneMs = [0, 0, 0, 0, 0, 0]; // index 0 = below zone 1
  let weightedBpm = 0;
  let sampledMs = 0;
  let peak: number | null = null;
  let durationMs = 0;
  let kcal: number | null = null;

  for (const w of workouts) {
    durationMs += Math.max(0, w.end - w.start);
    if (w.activeKcal !== null) kcal = (kcal ?? 0) + w.activeKcal;

    const samples = w.heartRate
      .filter((s) => s.time >= w.start && s.time <= w.end && s.bpm > 0)
      .sort((a, b) => a.time - b.time);

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const next = i + 1 < samples.length ? samples[i + 1].time : w.end;
      const dt = Math.min(next - s.time, MAX_SAMPLE_GAP_MS);
      if (dt <= 0) continue;
      zoneMs[zoneFor(s.bpm, maxHeartRate)] += dt;
      weightedBpm += s.bpm * dt;
      sampledMs += dt;
      peak = peak === null ? s.bpm : Math.max(peak, s.bpm);
    }
  }

  const zoneMinutes = zoneMs.slice(1).map((ms) => round1(ms / 60_000)) as ZoneMinutes;
  const trimp = zoneMs.slice(1).reduce((sum, ms, i) => sum + (ms / 60_000) * (i + 1), 0);

  return {
    workoutCount: workouts.length,
    startTime: new Date(Math.min(...workouts.map((w) => w.start))).toISOString(),
    endTime: new Date(Math.max(...workouts.map((w) => w.end))).toISOString(),
    durationMinutes: round1(durationMs / 60_000),
    activeKcal: kcal === null ? null : Math.round(kcal),
    avgHeartRate: sampledMs > 0 ? Math.round(weightedBpm / sampledMs) : null,
    peakHeartRate: peak === null ? null : Math.round(peak),
    heartRateMinutes: round1(sampledMs / 60_000),
    zoneMinutes,
    trimp: Math.round(trimp),
    maxHeartRate,
  };
}

/**
 * Heart-rate effort on the same 1–10 scale as the player's own rating: the average zone the
 * session was spent in (0–5), doubled. So mostly zone 4 (80–90% of max) reads as 8/10.
 * Null when there isn't enough heart-rate data.
 */
export function measuredEffort(a: Pick<WorkoutAnalysis, 'trimp' | 'heartRateMinutes'>): number | null {
  if (a.heartRateMinutes < MIN_HEART_RATE_MINUTES_FOR_EFFORT) return null;
  const averageZone = a.trimp / a.heartRateMinutes;
  return Math.min(10, Math.max(1, Math.round(averageZone * 2)));
}

/** Active calories per hour of workout time. */
export function kcalPerHour(a: Pick<WorkoutAnalysis, 'activeKcal' | 'durationMinutes'>): number | null {
  if (a.activeKcal === null || a.durationMinutes <= 0) return null;
  return Math.round(a.activeKcal / (a.durationMinutes / 60));
}

/**
 * Calories per hour divided by body weight, so heavier and lighter players (or the same player
 * on different days) can be compared fairly.
 */
export function kcalPerKgPerHour(
  a: Pick<WorkoutAnalysis, 'activeKcal' | 'durationMinutes'>,
  weightKg: number | null,
): number | null {
  const perHour = kcalPerHour(a);
  if (perHour === null || !weightKg) return null;
  return round1(perHour / weightKg);
}

export type EffortComparison = 'matches' | 'rated_higher' | 'rated_lower';

/** Compares the player's own 1–10 rating with the heart-rate effort; within 1 point counts as a match. */
export function compareEffort(rated: number, measured: number): EffortComparison {
  const diff = rated - measured;
  if (diff >= 2) return 'rated_higher';
  if (diff <= -2) return 'rated_lower';
  return 'matches';
}
