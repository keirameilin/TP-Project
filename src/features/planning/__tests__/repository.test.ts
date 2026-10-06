import { ValidationError } from '../../../lib/validation';
import { createTestDatabase } from '../../../test-utils/testDatabase';
import { TrainingSessionRepository } from '../../training';
import { PlannedSessionRepository } from '../repository';
import { NONE_PLANNED } from '../types';
import { DuplicatePlannedDateError } from '../validation';

const TODAY = '2026-10-05'; // a Monday
const at = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12, 0);

let db: Awaited<ReturnType<typeof createTestDatabase>>;
let repo: PlannedSessionRepository;
/** The repository's clock; tests move it to make a plan's date fall in the past. */
let now: Date;

beforeEach(async () => {
  db = await createTestDatabase();
  now = at(2026, 10, 5);
  repo = new PlannedSessionRepository(db, { now: () => now });
});

afterEach(() => db.close());

describe('create', () => {
  it('plans a session, defaulting the date to today and the optional fields to null', async () => {
    const s = await repo.create({ sessionType: 'technical_tactical' });

    expect(s).toEqual({
      id: expect.any(Number),
      date: TODAY,
      sessionType: 'technical_tactical',
      expectedDurationMinutes: null,
      notes: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it('stores the expected duration and trimmed notes for a future date', async () => {
    const s = await repo.create({
      date: '2026-10-10',
      sessionType: 'match',
      expectedDurationMinutes: 90,
      notes: '  Away, 3pm kick-off  ',
    });
    expect(s).toMatchObject({ date: '2026-10-10', expectedDurationMinutes: 90, notes: 'Away, 3pm kick-off' });
  });

  it('stores blank notes as null', async () => {
    expect((await repo.create({ sessionType: 'rest_day', notes: '   ' })).notes).toBeNull();
  });

  it('rejects a past date and stores nothing', async () => {
    await expect(repo.create({ date: '2026-10-04', sessionType: 'match' })).rejects.toThrow(ValidationError);
    await expect(repo.create({ date: '2026-10-04', sessionType: 'match' })).rejects.toThrow(
      /date: must be today or a future date/,
    );
    expect(await repo.list()).toEqual([]);
  });

  it('rejects invalid input', async () => {
    await expect(repo.create({ sessionType: 'yoga' as never })).rejects.toThrow(ValidationError);
    await expect(repo.create({ sessionType: 'match', expectedDurationMinutes: 0 })).rejects.toThrow(
      /expectedDurationMinutes/,
    );
  });

  it('allows only one planned session per date', async () => {
    await repo.create({ date: '2026-10-08', sessionType: 'gym_strength' });
    await expect(repo.create({ date: '2026-10-08', sessionType: 'match' })).rejects.toThrow(
      DuplicatePlannedDateError,
    );
    expect(await repo.list()).toHaveLength(1);
  });

  it('is independent of logged training sessions on the same date', async () => {
    const logged = new TrainingSessionRepository(db, { now: () => now });
    await logged.create({ date: TODAY, sessionType: 'rest_day' });
    await repo.create({ date: TODAY, sessionType: 'match', expectedDurationMinutes: 90 });

    // Planned a match, actually rested: both records exist and neither changes the other.
    expect((await repo.getByDate(TODAY))?.sessionType).toBe('match');
    expect((await logged.getByDate(TODAY))?.sessionType).toBe('rest_day');
    await repo.delete((await repo.getByDate(TODAY))!.id);
    expect(await logged.getByDate(TODAY)).not.toBeNull();
  });
});

describe('read', () => {
  beforeEach(async () => {
    // Created out of order on purpose.
    await repo.create({ date: '2026-10-12', sessionType: 'match' });
    await repo.create({ date: '2026-10-06', sessionType: 'gym_strength' });
    await repo.create({ date: '2026-10-09', sessionType: 'hiit_conditioning' });
  });

  it('lists every planned session in calendar order', async () => {
    expect((await repo.list()).map((s) => s.date)).toEqual(['2026-10-06', '2026-10-09', '2026-10-12']);
  });

  it('lists by an inclusive date range', async () => {
    expect((await repo.list({ from: '2026-10-06', to: '2026-10-09' })).map((s) => s.date)).toEqual([
      '2026-10-06',
      '2026-10-09',
    ]);
    expect((await repo.list({ from: '2026-10-07' })).map((s) => s.date)).toEqual(['2026-10-09', '2026-10-12']);
    expect((await repo.list({ to: '2026-10-08' })).map((s) => s.date)).toEqual(['2026-10-06']);
    expect(await repo.list({ from: '2026-11-01', to: '2026-11-30' })).toEqual([]);
  });

  it('gets by date and by id', async () => {
    const byDate = await repo.getByDate('2026-10-09');
    expect(byDate?.sessionType).toBe('hiit_conditioning');
    expect(await repo.getById(byDate!.id)).toEqual(byDate);
    expect(await repo.getByDate('2026-10-10')).toBeNull();
    expect(await repo.getById(9999)).toBeNull();
  });
});

describe('update', () => {
  it('changes only the given fields and bumps updatedAt', async () => {
    const created = await repo.create({ date: '2026-10-08', sessionType: 'match', expectedDurationMinutes: 90 });
    now = at(2026, 10, 6);
    const updated = await repo.update(created.id, { sessionType: 'technical_tactical', notes: 'Match postponed' });

    expect(updated).toMatchObject({
      id: created.id,
      date: '2026-10-08',
      sessionType: 'technical_tactical',
      expectedDurationMinutes: 90,
      notes: 'Match postponed',
      createdAt: created.createdAt,
      updatedAt: now.toISOString(),
    });
  });

  it('clears optional fields when they are set to null', async () => {
    const created = await repo.create({ sessionType: 'match', expectedDurationMinutes: 90, notes: 'Cup tie' });
    expect(await repo.update(created.id, { expectedDurationMinutes: null, notes: null })).toMatchObject({
      expectedDurationMinutes: null,
      notes: null,
    });
  });

  it('moves a plan to another free date that is today or later', async () => {
    const created = await repo.create({ date: '2026-10-08', sessionType: 'match' });
    expect((await repo.update(created.id, { date: '2026-10-11' }))?.date).toBe('2026-10-11');
    expect((await repo.update(created.id, { date: TODAY }))?.date).toBe(TODAY);
    expect(await repo.getByDate('2026-10-08')).toBeNull();
  });

  it('refuses to move a plan into the past or onto a taken date', async () => {
    const a = await repo.create({ date: '2026-10-08', sessionType: 'match' });
    await repo.create({ date: '2026-10-09', sessionType: 'rest_day' });

    await expect(repo.update(a.id, { date: '2026-10-01' })).rejects.toThrow(/must be today or a future date/);
    await expect(repo.update(a.id, { date: '2026-10-09' })).rejects.toThrow(DuplicatePlannedDateError);
    expect((await repo.getById(a.id))?.date).toBe('2026-10-08');
  });

  it('rejects invalid changes and leaves the plan untouched', async () => {
    const created = await repo.create({ sessionType: 'match', expectedDurationMinutes: 90 });
    await expect(repo.update(created.id, { expectedDurationMinutes: -5 })).rejects.toThrow(ValidationError);
    expect(await repo.getById(created.id)).toEqual(created);
  });

  it('returns null for a plan that does not exist', async () => {
    expect(await repo.update(9999, { sessionType: 'match' })).toBeNull();
  });
});

describe('a plan whose date has passed', () => {
  let pastId: number;

  beforeEach(async () => {
    pastId = (await repo.create({ date: '2026-10-06', sessionType: 'match', expectedDurationMinutes: 90 })).id;
    now = at(2026, 10, 20); // two weeks later: the plan's date is now in the past
  });

  it('can still be edited in place', async () => {
    const updated = await repo.update(pastId, { sessionType: 'rest_day', expectedDurationMinutes: null, notes: 'Was ill' });
    expect(updated).toMatchObject({ date: '2026-10-06', sessionType: 'rest_day', notes: 'Was ill' });
    // Passing the unchanged past date along with other edits is fine too.
    expect((await repo.update(pastId, { date: '2026-10-06', notes: 'Flu' }))?.notes).toBe('Flu');
  });

  it('can be moved to today or later, but not to another past date', async () => {
    await expect(repo.update(pastId, { date: '2026-10-10' })).rejects.toThrow(/must be today or a future date/);
    expect((await repo.update(pastId, { date: '2026-10-20' }))?.date).toBe('2026-10-20');
  });

  it('can still be deleted', async () => {
    expect(await repo.delete(pastId)).toBe(true);
    expect(await repo.getById(pastId)).toBeNull();
  });

  it('cannot be created new', async () => {
    await expect(repo.create({ date: '2026-10-19', sessionType: 'match' })).rejects.toThrow(ValidationError);
  });
});

describe('delete', () => {
  it('removes a plan and reports whether anything was deleted', async () => {
    const created = await repo.create({ sessionType: 'match' });
    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.list()).toEqual([]);
  });
});

describe('getLookahead', () => {
  it('returns the next 7 days starting today, marking days with nothing planned', async () => {
    await repo.create({ date: '2026-10-05', sessionType: 'gym_strength' });
    await repo.create({ date: '2026-10-07', sessionType: 'hiit_conditioning' });
    await repo.create({ date: '2026-10-10', sessionType: 'match', expectedDurationMinutes: 90 });
    await repo.create({ date: '2026-10-11', sessionType: 'rest_day' });

    const days = await repo.getLookahead();

    expect(days.map((d) => [d.date, d.plan])).toEqual([
      ['2026-10-05', 'gym_strength'],
      ['2026-10-06', NONE_PLANNED],
      ['2026-10-07', 'hiit_conditioning'],
      ['2026-10-08', NONE_PLANNED],
      ['2026-10-09', NONE_PLANNED],
      ['2026-10-10', 'match'],
      ['2026-10-11', 'rest_day'],
    ]);
    expect(days[5].session).toMatchObject({ date: '2026-10-10', expectedDurationMinutes: 90 });
    expect(days[1].session).toBeNull();
  });

  it('returns seven "none planned" days when nothing is planned', async () => {
    const days = await repo.getLookahead();
    expect(days).toHaveLength(7);
    expect(days.every((d) => d.plan === NONE_PLANNED && d.session === null)).toBe(true);
  });

  it('leaves out plans before the start and from the 8th day on', async () => {
    await repo.create({ date: '2026-10-05', sessionType: 'match' }); // today
    await repo.create({ date: '2026-10-12', sessionType: 'match' }); // day 8 from today
    await repo.create({ date: '2026-10-13', sessionType: 'match' }); // day 8 from tomorrow

    expect((await repo.getLookahead()).filter((d) => d.plan === 'match').map((d) => d.date)).toEqual(['2026-10-05']);
    // Starting tomorrow shifts the window by a day.
    expect((await repo.getLookahead('2026-10-06')).filter((d) => d.plan === 'match').map((d) => d.date)).toEqual([
      '2026-10-12',
    ]);
  });

  it('crosses a month boundary', async () => {
    await repo.create({ date: '2026-11-01', sessionType: 'match' });
    const days = await repo.getLookahead('2026-10-28');
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
    expect(days[4].plan).toBe('match');
  });

  it('rejects an invalid start date', async () => {
    await expect(repo.getLookahead('2026-13-01')).rejects.toThrow(ValidationError);
  });
});

describe('countMatchesInWindow', () => {
  it('counts planned matches from the start date through the 7th day, inclusive', async () => {
    await repo.create({ date: '2026-10-05', sessionType: 'match' }); // first day of the window
    await repo.create({ date: '2026-10-08', sessionType: 'match' });
    await repo.create({ date: '2026-10-11', sessionType: 'match' }); // last day of the window
    await repo.create({ date: '2026-10-12', sessionType: 'match' }); // one day after it

    expect(await repo.countMatchesInWindow('2026-10-05')).toBe(3);
    expect(await repo.countMatchesInWindow('2026-10-06')).toBe(3); // drops the 5th, gains the 12th
    expect(await repo.countMatchesInWindow('2026-10-09')).toBe(2);
    expect(await repo.countMatchesInWindow('2026-10-13')).toBe(0);
  });

  it('ignores other session types', async () => {
    await repo.create({ date: '2026-10-05', sessionType: 'hiit_conditioning' });
    await repo.create({ date: '2026-10-06', sessionType: 'technical_tactical' });
    await repo.create({ date: '2026-10-07', sessionType: 'rest_day' });
    await repo.create({ date: '2026-10-08', sessionType: 'match' });
    expect(await repo.countMatchesInWindow('2026-10-05')).toBe(1);
  });

  it('counts a window that starts in the past', async () => {
    await repo.create({ date: '2026-10-06', sessionType: 'match' });
    await repo.create({ date: '2026-10-09', sessionType: 'match' });
    now = at(2026, 10, 20);
    expect(await repo.countMatchesInWindow('2026-10-04')).toBe(2);
  });

  it('counts planned matches only, not logged ones', async () => {
    await new TrainingSessionRepository(db, { now: () => now }).create({
      date: TODAY,
      sessionType: 'match',
      durationMinutes: 90,
      rpe: 8,
    });
    expect(await repo.countMatchesInWindow(TODAY)).toBe(0);
  });

  it('rejects an invalid start date', async () => {
    await expect(repo.countMatchesInWindow('not-a-date')).rejects.toThrow(ValidationError);
  });
});
