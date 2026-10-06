import { validatePlannedSession, type PlannedSessionFields } from '../validation';

const TODAY = '2026-10-05';

const valid: PlannedSessionFields = {
  date: TODAY,
  sessionType: 'match',
  expectedDurationMinutes: 90,
  notes: null,
};

const issuesFor = (overrides: Partial<PlannedSessionFields>, earliestDate: string | null = TODAY) =>
  validatePlannedSession({ ...valid, ...overrides }, { earliestDate });
const fieldsWithIssues = (overrides: Partial<PlannedSessionFields>, earliestDate: string | null = TODAY) =>
  issuesFor(overrides, earliestDate).map((i) => i.field);

describe('validatePlannedSession', () => {
  it('accepts a plan for today or any future date', () => {
    expect(fieldsWithIssues({})).toEqual([]);
    expect(fieldsWithIssues({ date: '2026-10-06' })).toEqual([]);
    expect(fieldsWithIssues({ date: '2027-03-01' })).toEqual([]);
  });

  it('rejects a past date', () => {
    expect(issuesFor({ date: '2026-10-04' })).toEqual([
      { field: 'date', message: 'must be today or a future date' },
    ]);
  });

  it('allows a past date when the date check is off (editing an existing plan)', () => {
    expect(fieldsWithIssues({ date: '2026-09-01' }, null)).toEqual([]);
  });

  it.each(['2026-02-30', '05/10/2026', '2026-10-5', ''])('rejects the invalid date %p', (date) => {
    expect(fieldsWithIssues({ date })).toEqual(['date']);
    // Still rejected with the today-or-later check off.
    expect(fieldsWithIssues({ date }, null)).toEqual(['date']);
  });

  it.each(['match', 'hiit_conditioning', 'technical_tactical', 'gym_strength', 'rest_day'] as const)(
    'accepts session type %p',
    (sessionType) => {
      expect(fieldsWithIssues({ sessionType })).toEqual([]);
    },
  );

  it('rejects an unknown session type', () => {
    expect(fieldsWithIssues({ sessionType: 'yoga' as never })).toEqual(['sessionType']);
  });

  it('treats the expected duration as optional', () => {
    expect(fieldsWithIssues({ expectedDurationMinutes: null })).toEqual([]);
    expect(fieldsWithIssues({ sessionType: 'rest_day', expectedDurationMinutes: null })).toEqual([]);
    expect(fieldsWithIssues({ expectedDurationMinutes: 1 })).toEqual([]);
    expect(fieldsWithIssues({ expectedDurationMinutes: 1440 })).toEqual([]);
  });

  it.each([0, -30, 45.5, 1441, NaN])('rejects an expected duration of %p', (expectedDurationMinutes) => {
    expect(fieldsWithIssues({ expectedDurationMinutes })).toEqual(['expectedDurationMinutes']);
  });

  it('reports every problem at once', () => {
    expect(
      fieldsWithIssues({ date: '2026-10-01', sessionType: 'yoga' as never, expectedDurationMinutes: 0 }),
    ).toEqual(['date', 'sessionType', 'expectedDurationMinutes']);
  });
});
