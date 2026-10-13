import {
  caloriesFromHeartRate,
  caloriesFromSessionType,
  effortFromHeartRate,
  effortFromMet,
  estimatedMaxHeartRate,
  sessionCalories,
  sessionEffort,
  type PlayerInput,
  type SessionInput,
} from '../effort';
import { describeCalories, describeEffort, HEART_RATE_CAVEAT } from '../sessionText';

const session = (overrides: Partial<SessionInput> = {}): SessionInput => ({
  sessionType: 'match',
  durationMinutes: 90,
  rpe: 8,
  avgHeartRate: null,
  caloriesBurned: null,
  ...overrides,
});

/** A 25-year-old man of 70 kg with a measured max heart rate of 190. */
const player = (overrides: Partial<PlayerInput> = {}): PlayerInput => ({
  age: 25,
  sex: 'male',
  maxHeartRate: 190,
  weightKg: 70,
  ...overrides,
});

describe('max heart rate', () => {
  it('estimates it with Tanaka, 208 − 0.7 × age, to the nearest beat', () => {
    expect(estimatedMaxHeartRate(20)).toBe(194); // 208 − 14
    expect(estimatedMaxHeartRate(17)).toBe(196); // 208 − 11.9 = 196.1
    expect(estimatedMaxHeartRate(40)).toBe(180); // 208 − 28
  });
});

describe('effort from heart rate', () => {
  it('interpolates inside each zone', () => {
    expect(effortFromHeartRate(0.5)).toBe(1);
    expect(effortFromHeartRate(0.55)).toBe(2); // halfway through zone 1 (1–3)
    expect(effortFromHeartRate(0.6)).toBe(3);
    expect(effortFromHeartRate(0.65)).toBe(4);
    expect(effortFromHeartRate(0.7)).toBe(5);
    expect(effortFromHeartRate(0.75)).toBe(6);
    expect(effortFromHeartRate(0.8)).toBe(7);
    expect(effortFromHeartRate(0.85)).toBe(8);
    expect(effortFromHeartRate(0.9)).toBe(9);
    expect(effortFromHeartRate(0.95)).toBe(9.5); // zone 5 only spans 9–10
    expect(effortFromHeartRate(1)).toBe(10);
  });

  it('stays within 1–10 outside the zones', () => {
    expect(effortFromHeartRate(0.4)).toBe(1);
    expect(effortFromHeartRate(1.1)).toBe(10);
  });

  it('uses the profile max heart rate', () => {
    // 158 / 190 = 83.16% → zone 4: 7 + 0.316 × 2 = 7.63
    const result = sessionEffort(session({ avgHeartRate: 158 }), player());
    expect(result).toEqual({
      effort: {
        source: 'heart_rate',
        level: 7.6,
        avgHeartRate: 158,
        maxHeartRate: 190,
        maxIsEstimated: false,
        percentOfMax: 83,
      },
      skipped: [],
    });
    expect(describeEffort(result)).toEqual([
      'Average heart rate 158 bpm = 83% of your max (190): effort about 7.6 (estimate).',
      HEART_RATE_CAVEAT,
    ]);
  });

  it('estimates the max heart rate from age when the profile has none, and says so', () => {
    // Age 20 → 194. 155 / 194 = 79.90% → zone 3: 5 + 0.990 × 2 = 6.98
    const result = sessionEffort(session({ avgHeartRate: 155 }), player({ age: 20, maxHeartRate: null }));
    expect(result.effort).toMatchObject({ source: 'heart_rate', level: 7, maxHeartRate: 194, maxIsEstimated: true });
    expect(describeEffort(result)[0]).toBe(
      'Average heart rate 155 bpm = 80% of your estimated max (194, from 208 − 0.7 × your age): effort about 7 (estimate).',
    );
  });

  it('falls back to the rating when there is no age or max heart rate to compare with', () => {
    const result = sessionEffort(session({ avgHeartRate: 158 }), player({ age: null, maxHeartRate: null }));
    expect(result.effort).toMatchObject({ source: 'rating', level: 8 });
    expect(result.skipped).toEqual(['heart_rate_needs_age']);
    expect(describeEffort(result)[1]).toMatch(/can't be estimated from heart rate without your age/);
  });
});

describe('effort from calories', () => {
  it('interpolates between the MET anchor points', () => {
    expect(effortFromMet(2)).toBe(2);
    expect(effortFromMet(2.5)).toBe(3);
    expect(effortFromMet(3)).toBe(4);
    expect(effortFromMet(4.5)).toBe(5.5);
    expect(effortFromMet(6)).toBe(7);
    expect(effortFromMet(7.5)).toBe(8);
    expect(effortFromMet(9)).toBe(9);
    expect(effortFromMet(10.5)).toBe(9.5);
    expect(effortFromMet(12)).toBe(10);
  });

  it('stays at the end anchors beyond them', () => {
    expect(effortFromMet(1)).toBe(2);
    expect(effortFromMet(15)).toBe(10);
  });

  it('uses calories when no heart rate was entered', () => {
    // 520 kcal ÷ (70 kg × 1 h) = 7.43 MET → 7 + (1.43 / 3) × 2 = 7.95
    const result = sessionEffort(session({ durationMinutes: 60, caloriesBurned: 520 }), player());
    expect(result).toEqual({
      effort: { source: 'calories', level: 8, caloriesBurned: 520, durationMinutes: 60, weightKg: 70, met: 7.4 },
      skipped: [],
    });
    expect(describeEffort(result)).toEqual([
      '520 kcal in 60 min at 154.3 lb is about 7.4 MET: effort about 8 (estimate).',
    ]);
  });

  it('says effort cannot come from calories without a weight, and uses the rating', () => {
    const result = sessionEffort(session({ caloriesBurned: 520 }), player({ weightKg: null }));
    expect(result.effort).toEqual({ source: 'rating', level: 8, durationMinutes: 90, trainingLoad: 720 });
    expect(result.skipped).toEqual(['calories_need_weight']);
    expect(describeEffort(result)[1]).toBe(
      "Effort can't be estimated from calories without a body weight. Log your weight to use them.",
    );
  });
});

describe('effort source order', () => {
  it('lets heart rate set the effort when calories are entered too', () => {
    const result = sessionEffort(session({ avgHeartRate: 158, caloriesBurned: 900 }), player());
    expect(result.effort).toMatchObject({ source: 'heart_rate', level: 7.6 });
    // The calories are still shown, as entered.
    expect(sessionCalories(session({ avgHeartRate: 158, caloriesBurned: 900 }), player()).calories).toEqual({
      source: 'entered',
      kcal: 900,
    });
  });

  it('uses the rating and session-RPE load when neither is entered', () => {
    const result = sessionEffort(session(), player());
    expect(result).toEqual({
      effort: { source: 'rating', level: 8, durationMinutes: 90, trainingLoad: 720 }, // 8 × 90
      skipped: [],
    });
    expect(describeEffort(result)).toEqual(['Your own rating: 8 out of 10. Training load: 8 × 90 min = 720.']);
  });

  it('gives a rest day no effort level', () => {
    const rest = session({ sessionType: 'rest_day', durationMinutes: null, rpe: null });
    expect(sessionEffort(rest, player())).toEqual({ effort: null, skipped: [] });
    expect(describeEffort(sessionEffort(rest, player()))).toEqual([]);
  });

  it('never mentions more than one source in an explanation', () => {
    const text = describeEffort(sessionEffort(session({ avgHeartRate: 158, caloriesBurned: 900 }), player())).join(' ');
    expect(text).not.toMatch(/rating|rated|kcal|calories/i);
  });
});

describe('sessions with watch numbers and no rating', () => {
  const unrated = (overrides: Partial<SessionInput>) => session({ rpe: null, ...overrides });

  it('works out effort from heart rate or calories as usual', () => {
    expect(sessionEffort(unrated({ avgHeartRate: 158 }), player()).effort).toMatchObject({ source: 'heart_rate', level: 7.6 });
    expect(sessionEffort(unrated({ durationMinutes: 60, caloriesBurned: 520 }), player()).effort).toMatchObject({
      source: 'calories',
      level: 8,
    });
  });

  it('has no effort level, and says why, when the numbers cannot be used', () => {
    const noAge = sessionEffort(unrated({ avgHeartRate: 158 }), player({ age: null, maxHeartRate: null }));
    expect(noAge).toEqual({ effort: null, skipped: ['heart_rate_needs_age'] });
    expect(describeEffort(noAge)).toEqual([
      "Effort can't be estimated from heart rate without your age. Add it on the Player tab.",
    ]);

    const noWeight = sessionEffort(unrated({ caloriesBurned: 520 }), player({ weightKg: null }));
    expect(noWeight).toEqual({ effort: null, skipped: ['calories_need_weight'] });
  });
});

describe('calories burned', () => {
  it('uses the entered number as it is', () => {
    const result = sessionCalories(session({ caloriesBurned: 650 }), player());
    expect(result.calories).toEqual({ source: 'entered', kcal: 650 });
    expect(describeCalories(result)).toEqual(['Calories burned: 650 kcal (entered).']);
  });

  it('estimates from heart rate with the Keytel formula', () => {
    // Man: −55.0969 + 0.6309 × 150 + 0.1988 × 70 + 0.2017 × 25 = 58.4966 kJ/min
    // × 60 min ÷ 4.184 = 838.9 kcal
    expect(caloriesFromHeartRate({ avgHeartRate: 150, age: 25, sex: 'male', weightKg: 70, durationMinutes: 60 })).toBe(839);
    // Woman: −20.4022 + 0.4472 × 150 − 0.1263 × 70 + 0.074 × 25 = 39.6868 kJ/min
    // × 60 min ÷ 4.184 = 569.1 kcal
    expect(caloriesFromHeartRate({ avgHeartRate: 150, age: 25, sex: 'female', weightKg: 70, durationMinutes: 60 })).toBe(569);

    const result = sessionCalories(session({ durationMinutes: 60, avgHeartRate: 150 }), player());
    expect(result.calories).toEqual({ source: 'estimated', method: 'heart_rate', kcal: 839 });
    expect(describeCalories(result)).toEqual([
      'Calories burned: 839 kcal (estimated from your heart rate, age, weight, sex, and duration).',
    ]);
  });

  it('estimates from the session type when nothing was entered', () => {
    expect(caloriesFromSessionType('match', 70, 90)).toBe(998); // 9.5 × 70 × 1.5 = 997.5
    expect(caloriesFromSessionType('hiit_conditioning', 70, 45)).toBe(420); // 8 × 70 × 0.75
    expect(caloriesFromSessionType('gym_strength', 80, 60)).toBe(400); // 5 × 80 × 1
    expect(caloriesFromSessionType('technical_tactical', 80, 60)).toBe(400); // 5 × 80 × 1
    expect(caloriesFromSessionType('rest_day', 80, 60)).toBe(0);

    const result = sessionCalories(session(), player());
    expect(result.calories).toEqual({ source: 'estimated', method: 'session_type', kcal: 998 });
    expect(describeCalories(result)).toEqual([
      'Calories burned: 998 kcal (estimated from your session type, duration, and weight).',
    ]);
  });

  it('falls back to the session type when the heart-rate formula lacks age or sex', () => {
    const conditioning = session({ sessionType: 'hiit_conditioning', durationMinutes: 45, avgHeartRate: 150 });
    const result = sessionCalories(conditioning, player({ sex: null }));
    expect(result).toEqual({ calories: { source: 'estimated', method: 'session_type', kcal: 420 }, heartRateNotUsed: true });
    expect(describeCalories(result)[1]).toMatch(/Add your age and sex on the Player tab/);
  });

  it('falls back to the session type when the heart-rate formula gives nothing usable', () => {
    // Woman, 40 bpm, 100 kg, age 20: −20.4022 + 17.888 − 12.63 + 1.48 = −13.66 kJ/min
    expect(caloriesFromHeartRate({ avgHeartRate: 40, age: 20, sex: 'female', weightKg: 100, durationMinutes: 60 })).toBeNull();
    const result = sessionCalories(
      session({ sessionType: 'gym_strength', durationMinutes: 60, avgHeartRate: 40 }),
      player({ sex: 'female', age: 20, weightKg: 100 }),
    );
    expect(result.calories).toEqual({ source: 'estimated', method: 'session_type', kcal: 500 }); // 5 × 100 × 1
  });

  it('cannot estimate without a body weight, and says what to do', () => {
    const result = sessionCalories(session({ avgHeartRate: 150 }), player({ weightKg: null }));
    expect(result.calories).toBeNull();
    expect(describeCalories(result)[0]).toMatch(/can't be estimated without a body weight/);
  });

  it('still shows entered calories without a body weight', () => {
    expect(sessionCalories(session({ caloriesBurned: 650 }), player({ weightKg: null })).calories).toEqual({
      source: 'entered',
      kcal: 650,
    });
  });

  it('gives a rest day no training calories', () => {
    const rest = session({ sessionType: 'rest_day', durationMinutes: null, rpe: null });
    expect(sessionCalories(rest, player({ weightKg: null })).calories).toEqual({
      source: 'estimated',
      method: 'session_type',
      kcal: 0,
    });
  });
});

describe('very short sessions', () => {
  const short = session({ durationMinutes: 5, rpe: 9 });

  it('scales the load and the estimated calories down with the minutes', () => {
    expect(sessionEffort(short, player()).effort).toMatchObject({ source: 'rating', trainingLoad: 45 }); // 9 × 5
    expect(sessionCalories(short, player()).calories).toMatchObject({ kcal: 55 }); // 9.5 × 70 × 5/60 = 55.4
  });

  it('still reads calories as an hourly rate', () => {
    // 60 kcal ÷ (70 kg × 5/60 h) = 10.29 MET → 9 + (1.29 / 3) × 1 = 9.43
    expect(sessionEffort({ ...short, caloriesBurned: 60 }, player()).effort).toMatchObject({
      source: 'calories',
      met: 10.3,
      level: 9.4,
    });
  });
});
