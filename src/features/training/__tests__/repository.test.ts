import { createTestDatabase } from '../../../test-utils/testDatabase';
import { TrainingSessionRepository } from '../repository';
import { DuplicateDateError, ValidationError } from '../validation';

const FIXED_NOW = new Date(2026, 8, 24, 18, 0); // Sep 24 2026, 18:00 local

let db: Awaited<ReturnType<typeof createTestDatabase>>;
let repo: TrainingSessionRepository;

beforeEach(async () => {
  db = await createTestDatabase();
  repo = new TrainingSessionRepository(db, { now: () => FIXED_NOW });
});

afterEach(() => db.close());

describe('create', () => {
  it('creates a session and defaults the date to today', async () => {
    const s = await repo.create({ sessionType: 'match', durationMinutes: 90, rpe: 8 });

    expect(s).toMatchObject({
      id: expect.any(Number),
      date: '2026-09-24',
      sessionType: 'match',
      durationMinutes: 90,
      rpe: 8,
      notes: null,
      createdAt: FIXED_NOW.toISOString(),
    });
  });

  it('creates a rest day without duration or RPE', async () => {
    const s = await repo.create({ sessionType: 'rest_day', notes: '  sore hamstrings ' });
    expect(s).toMatchObject({ durationMinutes: null, rpe: null, notes: 'sore hamstrings' });
  });

  it('rejects invalid input without writing anything', async () => {
    await expect(repo.create({ sessionType: 'gym_strength', rpe: 11 })).rejects.toThrow(
      ValidationError,
    );
    expect(await repo.list()).toEqual([]);
  });

  it('allows only one entry per date', async () => {
    await repo.create({ date: '2026-09-20', sessionType: 'rest_day' });
    await expect(
      repo.create({ date: '2026-09-20', sessionType: 'match', durationMinutes: 90, rpe: 9 }),
    ).rejects.toThrow(DuplicateDateError);
  });
});

describe('read', () => {
  beforeEach(async () => {
    await repo.create({ date: '2026-09-20', sessionType: 'match', durationMinutes: 90, rpe: 9 });
    await repo.create({ date: '2026-09-21', sessionType: 'rest_day' });
    await repo.create({ date: '2026-09-22', sessionType: 'hiit_conditioning', durationMinutes: 40, rpe: 7 });
  });

  it('gets a session by id and by date', async () => {
    const byDate = await repo.getByDate('2026-09-21');
    expect(byDate?.sessionType).toBe('rest_day');
    expect(await repo.getById(byDate!.id)).toEqual(byDate);
  });

  it('returns null for missing sessions', async () => {
    expect(await repo.getById(999)).toBeNull();
    expect(await repo.getByDate('2020-01-01')).toBeNull();
  });

  it('lists sessions newest first, with optional date range', async () => {
    expect((await repo.list()).map((s) => s.date)).toEqual([
      '2026-09-22',
      '2026-09-21',
      '2026-09-20',
    ]);
    expect(
      (await repo.list({ from: '2026-09-21', to: '2026-09-21' })).map((s) => s.date),
    ).toEqual(['2026-09-21']);
  });
});

describe('update', () => {
  it('applies a partial update and bumps updatedAt', async () => {
    const created = await repo.create({ sessionType: 'gym_strength', durationMinutes: 60, rpe: 6 });
    const later = new Date(FIXED_NOW.getTime() + 60_000);
    const laterRepo = new TrainingSessionRepository(db, { now: () => later });

    const updated = await laterRepo.update(created.id, { rpe: 7, notes: 'heavy squats' });

    expect(updated).toMatchObject({
      durationMinutes: 60,
      rpe: 7,
      notes: 'heavy squats',
      createdAt: created.createdAt,
      updatedAt: later.toISOString(),
    });
  });

  it('re-validates the merged result', async () => {
    const rest = await repo.create({ sessionType: 'rest_day' });
    await expect(repo.update(rest.id, { sessionType: 'match' })).rejects.toThrow(ValidationError);
    expect((await repo.getById(rest.id))?.sessionType).toBe('rest_day');
  });

  it('prevents moving a session onto a date that is already taken', async () => {
    await repo.create({ date: '2026-09-20', sessionType: 'rest_day' });
    const other = await repo.create({ date: '2026-09-21', sessionType: 'rest_day' });
    await expect(repo.update(other.id, { date: '2026-09-20' })).rejects.toThrow(DuplicateDateError);
  });

  it('returns null when the session does not exist', async () => {
    expect(await repo.update(999, { rpe: 5 })).toBeNull();
  });
});

describe('delete', () => {
  it('deletes a session and frees up its date', async () => {
    const s = await repo.create({ sessionType: 'rest_day' });

    expect(await repo.delete(s.id)).toBe(true);
    expect(await repo.getById(s.id)).toBeNull();
    expect(await repo.delete(s.id)).toBe(false);
    await expect(repo.create({ sessionType: 'rest_day' })).resolves.toBeDefined();
  });
});

describe('schema constraints', () => {
  it('enforces rules at the database level too', async () => {
    const insert = (type: string, duration: number | null, rpe: number | null) =>
      db.runAsync(
        `INSERT INTO training_sessions (date, session_type, duration_minutes, rpe, created_at, updated_at)
         VALUES ('2026-01-01', ?, ?, ?, 'x', 'x')`,
        [type, duration, rpe],
      );

    await expect(insert('match', null, null)).rejects.toThrow(/CHECK/);
    await expect(insert('match', 90, 11)).rejects.toThrow(/CHECK/);
    await expect(insert('yoga', 30, 3)).rejects.toThrow(/CHECK/);
  });
});
