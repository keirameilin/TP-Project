import type { WorkoutInput } from '../intensity/types';
import { EXPO_GO_REASON, isExpoGo } from './expoGo';
import type { HealthProvider } from './provider.types';

const READ_TYPES = [
  'HKWorkoutTypeIdentifier',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
] as const;

const KCAL_PER_UNIT: Record<string, number> = { kcal: 1, Cal: 1, cal: 0.001, kJ: 1 / 4.184, J: 1 / 4184 };

/** Loaded on demand so Expo Go (which lacks the native module) can still run the rest of the app. */
const loadHealthKit = () => import('@kingstinct/react-native-healthkit');

const appleHealth: HealthProvider = {
  name: 'Apple Health',
  source: 'apple_health',

  async checkAvailability() {
    if (isExpoGo) return { available: false, reason: EXPO_GO_REASON };
    try {
      const hk = await loadHealthKit();
      return (await hk.isHealthDataAvailableAsync())
        ? { available: true }
        : { available: false, reason: 'Apple Health isn’t available on this device.' };
    } catch (e) {
      // Usually the native module is missing because the build predates the health libraries.
      const detail = e instanceof Error ? ` (${e.message})` : '';
      return {
        available: false,
        reason: `Apple Health support isn’t included in this build of the app — rebuild it with EAS.${detail}`,
      };
    }
  },

  async requestAccess() {
    const hk = await loadHealthKit();
    // HealthKit never reveals whether read access was granted; a denial just returns no data.
    return hk.requestAuthorization({ toRead: [...READ_TYPES] });
  },

  async readWorkouts(from, to) {
    const hk = await loadHealthKit();
    const workouts = await hk.queryWorkoutSamples({
      limit: 0,
      ascending: true,
      filter: { date: { startDate: from, endDate: to } },
    });

    const results: WorkoutInput[] = [];
    for (const workout of workouts) {
      const start = workout.startDate.getTime();
      const end = workout.endDate.getTime();
      const energy = workout.totalEnergyBurned;
      const kcalFactor = energy ? KCAL_PER_UNIT[energy.unit] : undefined;
      workout.dispose();
      if (start < from.getTime() || start >= to.getTime()) continue;

      const heartRate = await hk.queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', {
        limit: 0,
        ascending: true,
        unit: 'count/min',
        filter: { date: { startDate: new Date(start), endDate: new Date(end) } },
      });

      results.push({
        start,
        end,
        activeKcal: energy && kcalFactor !== undefined ? energy.quantity * kcalFactor : null,
        heartRate: heartRate.map((s) => ({ time: s.startDate.getTime(), bpm: s.quantity })),
      });
    }
    return results;
  },
};

export function getHealthProvider(): HealthProvider | null {
  return appleHealth;
}
