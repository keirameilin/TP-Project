import type { HealthProvider } from '../health/provider.types';
import type { PlayerProfile } from '../profile/types';
import { analyzeWorkouts, maxHeartRateFor } from './metrics';
import type { WorkoutMetricsRepository } from './repository';
import type { WorkoutMetrics } from './types';

/** A problem the player can act on; its message is shown as-is. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Local midnight at the start of a YYYY-MM-DD date, and of the next day. */
export function localDayRange(date: string): { from: Date; to: Date } {
  const [y, m, d] = date.split('-').map(Number);
  return { from: new Date(y, m - 1, d), to: new Date(y, m - 1, d + 1) };
}

/**
 * Reads the day's watch workouts, turns them into effort metrics using the player's max heart rate,
 * and stores them (replacing any earlier import for that day).
 */
export async function importWorkoutDay(
  provider: HealthProvider,
  repo: WorkoutMetricsRepository,
  profile: Pick<PlayerProfile, 'age' | 'maxHeartRate'>,
  date: string,
): Promise<WorkoutMetrics> {
  const availability = await provider.checkAvailability();
  if (!availability.available) throw new ImportError(availability.reason);

  if (!(await provider.requestAccess())) {
    throw new ImportError(`Allow access to workouts and heart rate in ${provider.name} to import watch data.`);
  }

  const { from, to } = localDayRange(date);
  const analysis = analyzeWorkouts(await provider.readWorkouts(from, to), maxHeartRateFor(profile));
  if (!analysis) {
    throw new ImportError(
      `No workouts found in ${provider.name} for this day. Record your session as a workout on your watch, then import again.`,
    );
  }
  return repo.save(date, provider.source, analysis);
}
