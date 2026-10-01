import type { HealthSource, WorkoutInput } from '../intensity/types';

export type HealthAvailability = { available: true } | { available: false; reason: string };

/**
 * Reads watch workouts from the platform's health store: Apple Health on iOS, Health Connect on
 * Android. Platform files (provider.ios.ts / provider.android.ts) implement it.
 */
export interface HealthProvider {
  /** Shown in the UI, e.g. "Apple Health". */
  name: string;
  source: HealthSource;
  checkAvailability(): Promise<HealthAvailability>;
  /** Shows the system permission prompt. Resolves false if the player declined. */
  requestAccess(): Promise<boolean>;
  /** Workouts that started in [from, to), each with its heart-rate samples and active calories. */
  readWorkouts(from: Date, to: Date): Promise<WorkoutInput[]>;
}
