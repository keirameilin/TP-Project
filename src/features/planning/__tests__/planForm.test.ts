import { createTestDatabase } from '../../../test-utils/testDatabase';
import {
  describePlan,
  EMPTY_PLAN_FORM,
  parsePlanForm,
  planFormFromSession,
  planIssuesToErrors,
  type PlanForm,
} from '../planForm';
import { PlannedSessionRepository } from '../repository';

const form = (overrides: Partial<PlanForm>): PlanForm => ({ ...EMPTY_PLAN_FORM, ...overrides });

describe('parsePlanForm', () => {
  it('requires a session type', () => {
    expect(parsePlanForm(EMPTY_PLAN_FORM)).toEqual({ values: null, errors: { sessionType: 'Pick a session type' } });
  });

  it('parses a full plan, trimming notes', () => {
    expect(parsePlanForm(form({ sessionType: 'match', duration: ' 90 ', notes: '  Away  ' }))).toEqual({
      values: { sessionType: 'match', expectedDurationMinutes: 90, notes: 'Away' },
      errors: {},
    });
  });

  it('treats a blank duration and blank notes as not given', () => {
    expect(parsePlanForm(form({ sessionType: 'gym_strength', notes: '   ' })).values).toEqual({
      sessionType: 'gym_strength',
      expectedDurationMinutes: null,
      notes: null,
    });
  });

  it('drops the duration on a rest day, even if one was typed', () => {
    expect(parsePlanForm(form({ sessionType: 'rest_day', duration: '60' })).values?.expectedDurationMinutes).toBeNull();
  });

  it.each(['0', '-30', '45.5', '2000', 'abc'])('rejects the duration %p', (duration) => {
    const { values, errors } = parsePlanForm(form({ sessionType: 'match', duration }));
    expect(values).toBeNull();
    expect(errors.duration).toBe('Expected duration must be a whole number of minutes from 1 to 1440');
  });
});

it('turns a past-date rejection into a message about the day', () => {
  expect(planIssuesToErrors([{ field: 'date', message: 'must be today or a future date' }])).toEqual({
    form: 'Plans can only be set for today or a later day.',
  });
});

it('describes a plan in one line', () => {
  expect(describePlan({ sessionType: 'match', expectedDurationMinutes: 90 })).toBe('Match · 90 min');
  expect(describePlan({ sessionType: 'hiit_conditioning', expectedDurationMinutes: null })).toBe('Conditioning');
  expect(describePlan({ sessionType: 'rest_day', expectedDurationMinutes: null })).toBe('Rest');
});

describe('the editor against the repository', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let repo: PlannedSessionRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repo = new PlannedSessionRepository(db, { now: () => new Date(2026, 9, 5, 12) });
  });
  afterEach(() => db.close());

  it('saves a parsed form and loads it back into the same form', async () => {
    const typed = form({ sessionType: 'match', duration: '90', notes: 'Cup tie' });
    const saved = await repo.create({ date: '2026-10-08', ...parsePlanForm(typed).values! });
    expect(planFormFromSession(saved)).toEqual(typed);
  });

  it('gives an empty form for a day with no plan', () => {
    expect(planFormFromSession(null)).toEqual(EMPTY_PLAN_FORM);
  });

  it('updates an existing plan from an edited form', async () => {
    const saved = await repo.create({ date: '2026-10-08', sessionType: 'match', expectedDurationMinutes: 90 });
    const edited = { ...planFormFromSession(saved), sessionType: 'rest_day' as const, notes: 'Postponed' };
    const updated = await repo.update(saved.id, parsePlanForm(edited).values!);
    expect(updated).toMatchObject({ sessionType: 'rest_day', expectedDurationMinutes: null, notes: 'Postponed' });
  });
});
