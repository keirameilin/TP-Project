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
