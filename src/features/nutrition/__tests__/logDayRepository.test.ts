import { createTestDatabase } from '../../../test-utils/testDatabase';
import { ValidationError } from '../../../lib/validation';
import { FoodLogDayRepository } from '../logDayRepository';

const FIXED_NOW = new Date(2026, 8, 29, 21, 0);

let db: Awaited<ReturnType<typeof createTestDatabase>>;
let repo: FoodLogDayRepository;

beforeEach(async () => {
  db = await createTestDatabase();
  repo = new FoodLogDayRepository(db, { now: () => FIXED_NOW });
});

afterEach(() => db.close());

it('marks a day and reads it back', async () => {
  expect(await repo.setStatus('2026-09-29', 'complete')).toEqual({
    date: '2026-09-29',
    status: 'complete',
    updatedAt: FIXED_NOW.toISOString(),
  });
  expect((await repo.get('2026-09-29'))?.status).toBe('complete');
  expect(await repo.get('2026-09-28')).toBeNull();
});

it('changes the mark, and clears it with null', async () => {
  await repo.setStatus('2026-09-29', 'complete');
  expect((await repo.setStatus('2026-09-29', 'incomplete'))?.status).toBe('incomplete');
  expect(await repo.setStatus('2026-09-29', null)).toBeNull();
  expect(await repo.get('2026-09-29')).toBeNull();
});

it('lists marked days newest first within a range', async () => {
  await repo.setStatus('2026-09-27', 'complete');
  await repo.setStatus('2026-09-29', 'incomplete');
  await repo.setStatus('2026-09-28', 'complete');
  expect((await repo.list({ from: '2026-09-28' })).map((d) => d.date)).toEqual(['2026-09-29', '2026-09-28']);
});

it('rejects a bad date or status', async () => {
  await expect(repo.setStatus('2026-13-01', 'complete')).rejects.toThrow(ValidationError);
  await expect(repo.setStatus('2026-09-29', 'done' as never)).rejects.toThrow(ValidationError);
  expect(await repo.list()).toEqual([]);
});

it('enforces the status values at the database level', async () => {
  await expect(
    db.runAsync(`INSERT INTO food_log_days (date, status, updated_at) VALUES ('2026-01-01', 'done', 'x')`, []),
  ).rejects.toThrow(/CHECK/);
});
