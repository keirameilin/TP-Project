import type { WorkoutInput } from '../intensity/types';
import { EXPO_GO_REASON, isExpoGo } from './expoGo';
import type { HealthProvider } from './provider.types';

/** Loaded on demand so Expo Go (which lacks the native module) can still run the rest of the app. */
const loadHealthConnect = () => import('react-native-health-connect');

type HealthConnect = Awaited<ReturnType<typeof loadHealthConnect>>;
type PagedType = 'ExerciseSession' | 'HeartRate' | 'ActiveCaloriesBurned';

/** Reads every page of records of one type in a time range. */
async function readAll<T extends PagedType>(hc: HealthConnect, type: T, from: Date, to: Date) {
  const records: Awaited<ReturnType<typeof hc.readRecords<T>>>['records'] = [];
  let pageToken: string | undefined;
  do {
    const page = await hc.readRecords(type, {
      timeRangeFilter: { operator: 'between', startTime: from.toISOString(), endTime: to.toISOString() },
      pageToken,
    });
    records.push(...page.records);
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return records;
}

const healthConnect: HealthProvider = {
  name: 'Health Connect',
  source: 'health_connect',

  async checkAvailability() {
    if (isExpoGo) return { available: false, reason: EXPO_GO_REASON };
    try {
      const hc = await loadHealthConnect();
      const status = await hc.getSdkStatus();
      if (status === hc.SdkAvailabilityStatus.SDK_AVAILABLE) return { available: true };
      if (status === hc.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
        return { available: false, reason: 'Update the Health Connect app to import watch data.' };
      }
      return { available: false, reason: 'Install Health Connect from the Play Store to import watch data.' };
    } catch (e) {
      // Usually the native module is missing because the build predates the health libraries.
      const detail = e instanceof Error ? ` (${e.message})` : '';
      return {
        available: false,
        reason: `Health Connect support isn’t included in this build of the app — rebuild it with EAS.${detail}`,
      };
    }
  },

  async requestAccess() {
    const hc = await loadHealthConnect();
    await hc.initialize();
    const granted = await hc.requestPermission([
      { accessType: 'read', recordType: 'ExerciseSession' },
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    ]);
    const has = (type: string) => granted.some((p) => 'recordType' in p && p.recordType === type);
    return has('ExerciseSession') && has('HeartRate');
  },

  async readWorkouts(from, to) {
    const hc = await loadHealthConnect();
    await hc.initialize();
    const sessions = await readAll(hc, 'ExerciseSession', from, to);

    const results: WorkoutInput[] = [];
    for (const session of sessions) {
      const startDate = new Date(session.startTime);
      const endDate = new Date(session.endTime);
      if (startDate < from || startDate >= to) continue;

      const [heartRecords, calorieRecords] = await Promise.all([
        readAll(hc, 'HeartRate', startDate, endDate),
        readAll(hc, 'ActiveCaloriesBurned', startDate, endDate),
      ]);

      results.push({
        start: startDate.getTime(),
        end: endDate.getTime(),
        activeKcal:
          calorieRecords.length > 0
            ? calorieRecords.reduce((sum, r) => sum + r.energy.inKilocalories, 0)
            : null,
        heartRate: heartRecords.flatMap((r) =>
          r.samples.map((s) => ({ time: new Date(s.time).getTime(), bpm: s.beatsPerMinute })),
        ),
      });
    }
    return results;
  },
};

export function getHealthProvider(): HealthProvider | null {
  return healthConnect;
}
