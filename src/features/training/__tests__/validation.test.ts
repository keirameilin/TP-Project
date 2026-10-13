import {
  isValidDateString,
  toLocalDateString,
  validateSession,
  type SessionFields,
} from '../validation';

const valid: SessionFields = {
  date: '2026-09-24',
  sessionType: 'technical_tactical',
  durationMinutes: 90,
  rpe: 6,
  avgHeartRate: null,
  peakHeartRate: null,
  caloriesBurned: null,
  sessionQuality: null,
  sleepHours: null,
  notes: null,
};

const fieldsWithIssues = (s: SessionFields) => validateSession(s).map((i) => i.field);

describe('validateSession', () => {
  it('accepts a complete training session', () => {
    expect(validateSession(valid)).toEqual([]);
  });

  it('requires duration and RPE for non-rest sessions', () => {
    expect(fieldsWithIssues({ ...valid, durationMinutes: null, rpe: null })).toEqual([
      'durationMinutes',
      'rpe',
    ]);
  });

  it('does not require duration or RPE for a rest day', () => {
    expect(
      validateSession({ ...valid, sessionType: 'rest_day', durationMinutes: null, rpe: null }),
    ).toEqual([]);
  });

  it.each([0, 11, -1, 5.5, NaN])('rejects RPE %p', (rpe) => {
    expect(fieldsWithIssues({ ...valid, rpe })).toEqual(['rpe']);
  });

  it.each([1, 10])('accepts boundary RPE %p', (rpe) => {
    expect(validateSession({ ...valid, rpe })).toEqual([]);
  });

  it.each([0, -30, 45.5, 24 * 60 + 1])('rejects duration %p', (durationMinutes) => {
    expect(fieldsWithIssues({ ...valid, durationMinutes })).toEqual(['durationMinutes']);
  });

  it('still validates RPE on a rest day if one is given', () => {
    expect(fieldsWithIssues({ ...valid, sessionType: 'rest_day', rpe: 12 })).toEqual(['rpe']);
  });

  it('rejects an unknown session type', () => {
    expect(fieldsWithIssues({ ...valid, sessionType: 'yoga' as never })).toEqual(['sessionType']);
  });
});

describe('dates', () => {
  it.each(['2026-09-24', '2028-02-29'])('accepts %p', (d) => {
    expect(isValidDateString(d)).toBe(true);
  });

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '24-09-2026', '2026-9-24', ''])(
    'rejects %p',
    (d) => {
      expect(isValidDateString(d)).toBe(false);
    },
  );

  it('formats dates in local time, not UTC', () => {
    // 23:30 local on Sep 24 must stay Sep 24 regardless of timezone offset.
    expect(toLocalDateString(new Date(2026, 8, 24, 23, 30))).toBe('2026-09-24');
  });
});

describe('validateSession: heart rate and calories from a watch', () => {
  const messages = (s: SessionFields) => validateSession(s).map((i) => `${i.field} ${i.message}`);

  it('accepts a session with all three, and with any of them left out', () => {
    expect(validateSession({ ...valid, avgHeartRate: 150, peakHeartRate: 185, caloriesBurned: 700 })).toEqual([]);
    expect(validateSession({ ...valid, avgHeartRate: 150 })).toEqual([]);
    expect(validateSession({ ...valid, peakHeartRate: 185 })).toEqual([]);
    expect(validateSession({ ...valid, caloriesBurned: 0 })).toEqual([]);
  });

  it('accepts the ends of each range', () => {
    expect(validateSession({ ...valid, avgHeartRate: 40, peakHeartRate: 230 })).toEqual([]);
    expect(validateSession({ ...valid, durationMinutes: 100, caloriesBurned: 3000 })).toEqual([]);
  });

  it('rejects heart rates outside 40–230 bpm or not whole', () => {
    for (const bpm of [39, 231, 150.5, NaN]) {
      expect(messages({ ...valid, avgHeartRate: bpm })).toEqual(['avgHeartRate must be a whole number between 40 and 230 bpm']);
      expect(messages({ ...valid, peakHeartRate: bpm })).toEqual(['peakHeartRate must be a whole number between 40 and 230 bpm']);
    }
  });

  it('rejects calories outside 0–3000 kcal', () => {
    for (const kcal of [-1, 3001, NaN]) {
      expect(messages({ ...valid, caloriesBurned: kcal })).toEqual(['caloriesBurned must be between 0 and 3000 kcal']);
    }
  });

  it('rejects an average heart rate above the session max', () => {
    expect(messages({ ...valid, avgHeartRate: 170, peakHeartRate: 160 })).toEqual([
      "avgHeartRate can't be higher than the session's max heart rate",
    ]);
    expect(validateSession({ ...valid, avgHeartRate: 160, peakHeartRate: 160 })).toEqual([]);
  });

  it('flags calories that are unrealistic for the session length', () => {
    // 3000 kcal in 20 minutes is 150 kcal a minute.
    expect(messages({ ...valid, durationMinutes: 20, caloriesBurned: 3000 })).toEqual([
      "caloriesBurned of 3000 kcal in 20 minutes is over 30 kcal a minute, which isn't realistic. Check the calories and the duration.",
    ]);
    // Exactly 30 kcal a minute is allowed; 40 a minute in a 5-minute session is not.
    expect(validateSession({ ...valid, durationMinutes: 20, caloriesBurned: 600 })).toEqual([]);
    expect(fieldsWithIssues({ ...valid, durationMinutes: 5, caloriesBurned: 200 })).toEqual(['caloriesBurned']);
  });

  it('does not require a rating when a heart rate or calories are given', () => {
    expect(validateSession({ ...valid, rpe: null, avgHeartRate: 150 })).toEqual([]);
    expect(validateSession({ ...valid, rpe: null, caloriesBurned: 700 })).toEqual([]);
    // The session max alone is not a measure of effort.
    expect(messages({ ...valid, rpe: null, peakHeartRate: 185 })).toEqual([
      'rpe is required unless a heart rate or calories are given',
    ]);
  });

  it('rejects watch numbers on a rest day', () => {
    const rest: SessionFields = { ...valid, sessionType: 'rest_day', durationMinutes: null, rpe: null };
    expect(fieldsWithIssues({ ...rest, avgHeartRate: 60, peakHeartRate: 70, caloriesBurned: 10 })).toEqual([
      'avgHeartRate',
      'peakHeartRate',
      'caloriesBurned',
    ]);
  });
});

describe('validateSession: session rating and sleep', () => {
  it('accepts a rating from 1 to 10 and sleep from 0 to 14 hours, or neither', () => {
    expect(validateSession({ ...valid, sessionQuality: 1, sleepHours: 0 })).toEqual([]);
    expect(validateSession({ ...valid, sessionQuality: 10, sleepHours: 14 })).toEqual([]);
    expect(validateSession({ ...valid, sessionQuality: 7, sleepHours: 7.5 })).toEqual([]);
    // Sessions logged before the rating existed have none.
    expect(validateSession(valid)).toEqual([]);
  });

  it('rejects ratings outside 1–10 or not whole, and sleep outside 0–14', () => {
    for (const quality of [0, 11, 7.5, NaN]) {
      expect(fieldsWithIssues({ ...valid, sessionQuality: quality })).toEqual(['sessionQuality']);
    }
    for (const hours of [-1, 14.5, NaN]) {
      expect(fieldsWithIssues({ ...valid, sleepHours: hours })).toEqual(['sleepHours']);
    }
  });

  it('rejects a session rating on a rest day', () => {
    const rest: SessionFields = { ...valid, sessionType: 'rest_day', durationMinutes: null, rpe: null };
    expect(fieldsWithIssues({ ...rest, sessionQuality: 7 })).toEqual(['sessionQuality']);
  });
});
