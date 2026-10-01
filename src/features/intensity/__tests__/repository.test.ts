import { createTestDatabase } from '../../../test-utils/testDatabase';
import type { HealthProvider } from '../../health/provider.types';
import { importWorkoutDay, ImportError, localDayRange } from '../importDay';
import { WorkoutMetricsRepository } from '../repository';
import type { WorkoutAnalysis, WorkoutInput } from '../types';

const DATE = '2026-09-30';

const analysis: WorkoutAnalysis = {
  workoutCount: 1,
  startTime: '2026-09-30T17:00:00.000Z',
  endTime: '2026-09-30T18:30:00.000Z',
  durationMinutes: 90,
  activeKcal: 700,
  avgHeartRate: 158,
  peakHeartRate: 191,
  heartRateMinutes: 88.5,
  zoneMinutes: [5, 10.5, 30, 35, 8],
  trimp: 287,
  maxHeartRate: 203,
};

describe('WorkoutMetricsRepository', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let repo: WorkoutMetricsRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repo = new WorkoutMetricsRepository(db, { now: () => new Date('2026-09-30T19:00:00Z') });
  });
  afterEach(() => db.close());

  it('round-trips metrics for a date', async () => {
    const saved = await repo.save(DATE, 'apple_health', analysis);
    expect(saved).toEqual({
      ...analysis,
      date: DATE,
      source: 'apple_health',
      importedAt: '2026-09-30T19:00:00.000Z',
    });
    expect(await repo.getByDate(DATE)).toEqual(saved);
  });

  it('replaces an earlier import for the same date', async () => {
    await repo.save(DATE, 'apple_health', analysis);
    await repo.save(DATE, 'health_connect', { ...analysis, trimp: 100, activeKcal: null });
    const m = await repo.getByDate(DATE);
    expect(m).toMatchObject({ source: 'health_connect', trimp: 100, activeKcal: null });
  });

  it('deletes', async () => {
    await repo.save(DATE, 'apple_health', analysis);
    expect(await repo.delete(DATE)).toBe(true);
    expect(await repo.getByDate(DATE)).toBeNull();
    expect(await repo.delete(DATE)).toBe(false);
  });
});

describe('importWorkoutDay', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let repo: WorkoutMetricsRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repo = new WorkoutMetricsRepository(db);
  });
  afterEach(() => db.close());

  function fakeProvider(overrides: Partial<HealthProvider> = {}, workouts: WorkoutInput[] = []) {
    const readWorkouts = jest.fn().mockResolvedValue(workouts);
    const provider: HealthProvider = {
      name: 'Apple Health',
      source: 'apple_health',
      checkAvailability: async () => ({ available: true }),
      requestAccess: async () => true,
      readWorkouts,
      ...overrides,
    };
    return { provider, readWorkouts };
  }

  const start = new Date(2026, 8, 30, 18).getTime();
  const oneWorkout: WorkoutInput = {
    start,
    end: start + 60 * 60_000,
    activeKcal: 500,
    heartRate: Array.from({ length: 720 }, (_, i) => ({ time: start + i * 5000, bpm: 160 })),
  };

  it('reads the local day, analyses with the player’s max HR, and saves', async () => {
    const { provider, readWorkouts } = fakeProvider({}, [oneWorkout]);
    const m = await importWorkoutDay(provider, repo, { age: 20, maxHeartRate: null }, DATE);

    expect(readWorkouts).toHaveBeenCalledWith(localDayRange(DATE).from, localDayRange(DATE).to);
    expect(m).toMatchObject({ date: DATE, source: 'apple_health', maxHeartRate: 200, activeKcal: 500 });
    expect(m.zoneMinutes).toEqual([0, 0, 0, 60, 0]); // 160 bpm = 80% of 200 → zone 4
    expect(await repo.getByDate(DATE)).toEqual(m);
  });

  it('explains when the health store is unavailable', async () => {
    const { provider } = fakeProvider({
      checkAvailability: async () => ({ available: false, reason: 'Needs a development build.' }),
    });
    await expect(importWorkoutDay(provider, repo, { age: 20, maxHeartRate: null }, DATE)).rejects.toThrow(
      new ImportError('Needs a development build.'),
    );
  });

  it('explains when access is declined', async () => {
    const { provider } = fakeProvider({ requestAccess: async () => false });
    await expect(importWorkoutDay(provider, repo, { age: 20, maxHeartRate: null }, DATE)).rejects.toThrow(
      /Allow access/,
    );
  });

  it('explains when there are no workouts, and saves nothing', async () => {
    const { provider } = fakeProvider();
    await expect(importWorkoutDay(provider, repo, { age: 20, maxHeartRate: null }, DATE)).rejects.toThrow(
      /No workouts found/,
    );
    expect(await repo.getByDate(DATE)).toBeNull();
  });
});

it('gives local midnight-to-midnight for a date', () => {
  const { from, to } = localDayRange('2026-09-30');
  expect([from.getFullYear(), from.getMonth(), from.getDate(), from.getHours()]).toEqual([2026, 8, 30, 0]);
  expect([to.getFullYear(), to.getMonth(), to.getDate(), to.getHours()]).toEqual([2026, 9, 1, 0]);
});
