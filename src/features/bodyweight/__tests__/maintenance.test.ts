import { createTestDatabase } from '../../../test-utils/testDatabase';
import { addDays } from '../../../lib/dates';
import { FoodLogDayRepository } from '../../nutrition/logDayRepository';
import { FoodEntryRepository } from '../../nutrition/repository';
import {
  classifyIntakeDays,
  estimateMaintenance,
  getMaintenanceEstimate,
  type MaintenanceInput,
} from '../maintenance';
import { BodyWeightRepository } from '../repository';

const FROM = '2026-09-02';
const TO = '2026-09-29'; // 28-day window

/** Builds a window with the same intake every day and a weigh-in every `every` days. */
function window(opts: {
  kcal: number;
  startKg: number;
  kgPerWeek: number;
  every?: number;
  noise?: (i: number) => number;
}): MaintenanceInput {
  const weighIns: MaintenanceInput['weighIns'] = [];
  const dailyIntake: MaintenanceInput['dailyIntake'] = [];
  for (let i = 0; i < 28; i++) {
    const date = addDays(FROM, i);
    dailyIntake.push({ date, calories: opts.kcal });
    if (i % (opts.every ?? 1) === 0) {
      weighIns.push({ date, weightKg: opts.startKg + (opts.kgPerWeek / 7) * i + (opts.noise?.(i) ?? 0) });
    }
  }
  return { from: FROM, to: TO, weighIns, dailyIntake };
}

describe('estimateMaintenance', () => {
  it('equals intake when weight is stable', () => {
    expect(estimateMaintenance(window({ kcal: 2500, startKg: 70, kgPerWeek: 0 }))).toMatchObject({
      status: 'ok',
      avgIntakeKcal: 2500,
      maintenanceKcal: 2500,
      balanceKcal: 0,
      trendKgPerWeek: 0,
      loggedIntakeDays: 28,
      weighInCount: 28,
      windowDays: 28,
    });
  });

  it('adds the implied deficit back when losing weight', () => {
    // 0.5 kg/week × 7700 kcal/kg ÷ 7 days = 550 kcal/day deficit.
    expect(estimateMaintenance(window({ kcal: 2000, startKg: 80, kgPerWeek: -0.5 }))).toMatchObject({
      avgIntakeKcal: 2000,
      trendKgPerWeek: -0.5,
      maintenanceKcal: 2550,
      balanceKcal: -550,
    });
  });

  it('subtracts the implied surplus when gaining weight', () => {
    expect(estimateMaintenance(window({ kcal: 3200, startKg: 65, kgPerWeek: 0.25 }))).toMatchObject({
      maintenanceKcal: 2925,
      balanceKcal: 275,
    });
  });

  it('uses the trend, so day-to-day water swings largely cancel out', () => {
    const noisy = window({ kcal: 2500, startKg: 70, kgPerWeek: 0, noise: (i) => (i % 2 ? 0.8 : -0.8) });
    const result = estimateMaintenance(noisy);
    expect(result.status).toBe('ok');
    // Comparing only the first (−0.8) and last (+0.8) weigh-ins would imply
    // 1.6 kg × 7700 ÷ 27 days ≈ 456 kcal/day of surplus; the trend stays close to zero.
    if (result.status === 'ok') expect(Math.abs(result.balanceKcal)).toBeLessThan(50);
  });

  it('works with sparse weigh-ins', () => {
    expect(
      estimateMaintenance(window({ kcal: 2000, startKg: 80, kgPerWeek: -0.5, every: 7 })),
    ).toMatchObject({ weighInCount: 4, maintenanceKcal: 2550 });
  });

  it('averages intake over logged days only, ignoring unlogged days', () => {
    const input = window({ kcal: 2400, startKg: 70, kgPerWeek: 0 });
    input.dailyIntake = input.dailyIntake.filter((_, i) => i % 2 === 0); // half the days unlogged
    expect(estimateMaintenance(input)).toMatchObject({
      avgIntakeKcal: 2400,
      maintenanceKcal: 2400,
      loggedIntakeDays: 14,
    });
  });

  it('ignores data outside the window', () => {
    const input = window({ kcal: 2500, startKg: 70, kgPerWeek: 0 });
    input.weighIns.push({ date: '2026-08-01', weightKg: 90 });
    input.dailyIntake.push({ date: '2026-09-30', calories: 9000 });
    expect(estimateMaintenance(input)).toMatchObject({ maintenanceKcal: 2500, weighInCount: 28 });
  });

  it('reports every reason when there is not enough data', () => {
    expect(
      estimateMaintenance({
        from: FROM,
        to: TO,
        weighIns: [
          { date: '2026-09-20', weightKg: 70 },
          { date: '2026-09-22', weightKg: 70 },
        ],
        dailyIntake: [{ date: '2026-09-20', calories: 2000 }],
      }),
    ).toEqual({
      status: 'insufficient_data',
      reasons: ['too_few_weigh_ins', 'weigh_in_span_too_short', 'too_few_logged_days'],
      weighInCount: 2,
      loggedIntakeDays: 1,
      suspectDays: [],
      incompleteDays: 0,
    });
  });

  it('handles an empty window', () => {
    expect(estimateMaintenance({ from: FROM, to: TO, weighIns: [], dailyIntake: [] })).toMatchObject({
      status: 'insufficient_data',
      weighInCount: 0,
      loggedIntakeDays: 0,
    });
  });
});

describe('getMaintenanceEstimate', () => {
  it('loads the default 28-day window ending today from both logs', async () => {
    const db = await createTestDatabase();
    const now = () => new Date(2026, 8, 29, 20, 0);
    const bodyWeight = new BodyWeightRepository(db, { now });
    const food = new FoodEntryRepository(db, { now });
    const logDays = new FoodLogDayRepository(db, { now });

    for (let i = 0; i < 28; i++) {
      const date = addDays(FROM, i);
      // Two meals a day totalling 2000 kcal.
      for (const [mealType, calories] of [['lunch', 800], ['dinner', 1200]] as const) {
        await food.create({ date, mealType, foodName: 'Meal', calories, proteinG: 0, carbsG: 0, fatG: 0 });
      }
      if (i % 2 === 0) await bodyWeight.log({ date, weightKg: 80 - (0.5 / 7) * i });
    }
    // Outside the window — must be ignored.
    await bodyWeight.log({ date: '2026-09-01', weightKg: 100 });
    await food.create({ date: '2026-09-01', mealType: 'snack', foodName: 'x', calories: 9999, proteinG: 0, carbsG: 0, fatG: 0 });

    // A forgotten dinner (flagged) and a day the user marked incomplete — both excluded.
    const brokenDays = ['2026-09-10', '2026-09-11'];
    for (const date of brokenDays) {
      const [dinner] = (await food.listByDate(date)).filter((e) => e.mealType === 'dinner');
      await food.delete(dinner.id);
    }
    await logDays.setStatus('2026-09-11', 'incomplete');

    expect(await getMaintenanceEstimate({ bodyWeight, food, logDays }, { now })).toMatchObject({
      status: 'ok',
      from: FROM,
      to: TO,
      avgIntakeKcal: 2000,
      maintenanceKcal: 2550,
      balanceKcal: -550,
      weighInCount: 14,
      loggedIntakeDays: 26,
      suspectDays: [{ date: '2026-09-10', calories: 800 }],
      incompleteDays: 1,
    });
    db.close();
  });
});

describe('classifyIntakeDays', () => {
  const days = (...kcal: number[]) => kcal.map((calories, i) => ({ date: addDays(FROM, i), calories }));
  const dates = (list: { date: string }[]) => list.map((d) => d.date);

  it('flags unmarked days far below the median as suspect', () => {
    // Median 2400 → threshold 1440. 1450 is a light day; 900 is probably a forgotten meal.
    const intake = days(2400, 2500, 900, 2300, 1450, 2600, 2400);
    const result = classifyIntakeDays(intake);
    expect(dates(result.suspect)).toEqual([intake[2].date]);
    expect(result.included).toHaveLength(6);
  });

  it('always includes days the user marked complete, even when low', () => {
    const intake = days(2400, 2500, 900, 2300, 2600);
    const result = classifyIntakeDays(intake, [{ date: intake[2].date, status: 'complete' }]);
    expect(result.suspect).toEqual([]);
    expect(result.included).toHaveLength(5);
  });

  it('always excludes days marked incomplete, and leaves them out of the median', () => {
    const intake = days(2400, 2500, 2450, 2300, 2600, 300, 300, 300);
    const incomplete = intake.slice(5).map((d) => ({ date: d.date, status: 'incomplete' as const }));
    const result = classifyIntakeDays(intake, incomplete);
    expect(result.markedIncomplete).toHaveLength(3);
    expect(result.suspect).toEqual([]);
    expect(result.included).toHaveLength(5);
  });

  it('counts a day marked complete with nothing logged as 0 kcal (e.g. a fast)', () => {
    const intake = days(2400, 2500);
    const fast = addDays(FROM, 5);
    const result = classifyIntakeDays(intake, [{ date: fast, status: 'complete' }]);
    expect(result.included).toContainEqual({ date: fast, calories: 0 });
  });

  it('ignores an incomplete mark on a day with nothing logged', () => {
    const result = classifyIntakeDays(days(2400), [{ date: addDays(FROM, 3), status: 'incomplete' }]);
    expect(result).toEqual({ included: days(2400), suspect: [], markedIncomplete: [] });
  });

  it('does not flag anything until there are enough days for a reliable median', () => {
    expect(classifyIntakeDays(days(2400, 2500, 300, 2300)).suspect).toEqual([]);
  });
});

describe('estimateMaintenance with incomplete days', () => {
  it('leaves suspect and incomplete days out of the average and reports them', () => {
    const input = window({ kcal: 2000, startKg: 80, kgPerWeek: -0.5 });
    input.dailyIntake[3].calories = 500; // forgotten meals, unmarked
    input.dailyIntake[4].calories = 1900; // marked incomplete, excluded despite looking normal
    input.dayStatuses = [{ date: input.dailyIntake[4].date, status: 'incomplete' }];

    expect(estimateMaintenance(input)).toMatchObject({
      status: 'ok',
      avgIntakeKcal: 2000,
      maintenanceKcal: 2550,
      loggedIntakeDays: 26,
      suspectDays: [{ date: input.dailyIntake[3].date, calories: 500 }],
      incompleteDays: 1,
    });
  });

  it('includes a low day once the user confirms it complete', () => {
    const input = window({ kcal: 2000, startKg: 80, kgPerWeek: 0 });
    input.dailyIntake[3].calories = 600; // genuinely ate little (sick)
    input.dayStatuses = [{ date: input.dailyIntake[3].date, status: 'complete' }];

    expect(estimateMaintenance(input)).toMatchObject({
      avgIntakeKcal: 1950, // (27 × 2000 + 600) / 28
      loggedIntakeDays: 28,
      suspectDays: [],
    });
  });

  it('reports suspect days even when their exclusion leaves too little data', () => {
    const input = window({ kcal: 2000, startKg: 80, kgPerWeek: 0 });
    input.dailyIntake = input.dailyIntake.slice(0, 8);
    input.dailyIntake[0].calories = 400;
    input.dailyIntake[1].calories = 400;

    expect(estimateMaintenance(input)).toMatchObject({
      status: 'insufficient_data',
      reasons: ['too_few_logged_days'],
      loggedIntakeDays: 6,
      suspectDays: [
        { date: input.dailyIntake[0].date, calories: 400 },
        { date: input.dailyIntake[1].date, calories: 400 },
      ],
    });
  });
});
