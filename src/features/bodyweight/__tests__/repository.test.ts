import { createTestDatabase } from '../../../test-utils/testDatabase';
import { ValidationError } from '../../../lib/validation';
import { BodyWeightRepository } from '../repository';

const FIXED_NOW = new Date(2026, 8, 29, 7, 15); // Sep 29 2026, 07:15 local

let db: Awaited<ReturnType<typeof createTestDatabase>>;
let repo: BodyWeightRepository;

beforeEach(async () => {
  db = await createTestDatabase();
  repo = new BodyWeightRepository(db, { now: () => FIXED_NOW });
});

afterEach(() => db.close());

describe('log', () => {
  it('records a weigh-in, defaulting the date to today', async () => {
    expect(await repo.log({ weightKg: 72.4 })).toEqual({
      id: expect.any(Number),
      date: '2026-09-29',
      weightKg: 72.4,
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
    });
  });

  it('replaces the weight when logging the same date again', async () => {
    const first = await repo.log({ weightKg: 72.4 });
    const later = new Date(FIXED_NOW.getTime() + 60_000);
    const second = await new BodyWeightRepository(db, { now: () => later }).log({ weightKg: 72.1 });

    expect(second).toEqual({
      ...first,
      weightKg: 72.1,
      updatedAt: later.toISOString(),
    });
    expect(await repo.list()).toHaveLength(1);
  });

  it('rejects invalid input without writing anything', async () => {
    await expect(repo.log({ weightKg: 0 })).rejects.toThrow(ValidationError);
    await expect(repo.log({ weightKg: 70, date: '29/09/2026' })).rejects.toThrow(ValidationError);
    expect(await repo.list()).toEqual([]);
  });

  it('does not overwrite an existing weigh-in with invalid input', async () => {
    await repo.log({ weightKg: 72.4 });
    await expect(repo.log({ weightKg: 724 })).rejects.toThrow(ValidationError);
    expect((await repo.getByDate('2026-09-29'))?.weightKg).toBe(72.4);
  });
});

describe('read', () => {
  beforeEach(async () => {
    await repo.log({ date: '2026-09-27', weightKg: 73 });
    await repo.log({ date: '2026-09-29', weightKg: 72.5 });
    await repo.log({ date: '2026-09-28', weightKg: 72.8 });
  });

  it('lists newest first, with optional date range', async () => {
    expect((await repo.list()).map((e) => e.date)).toEqual(['2026-09-29', '2026-09-28', '2026-09-27']);
    expect((await repo.list({ from: '2026-09-28', to: '2026-09-28' })).map((e) => e.weightKg)).toEqual([
      72.8,
    ]);
  });

  it('gets by id and date, returning null when missing', async () => {
    const e = (await repo.getByDate('2026-09-28'))!;
    expect(await repo.getById(e.id)).toEqual(e);
    expect(await repo.getByDate('2026-01-01')).toBeNull();
    expect(await repo.getById(999)).toBeNull();
  });
});

describe('delete', () => {
  it('deletes a weigh-in', async () => {
    const e = await repo.log({ weightKg: 72 });
    expect(await repo.delete(e.id)).toBe(true);
    expect(await repo.getById(e.id)).toBeNull();
    expect(await repo.delete(e.id)).toBe(false);
  });
});

describe('schema constraints', () => {
  it('enforces one weigh-in per date and a positive weight', async () => {
    const insert = (date: string, weight: number) =>
      db.runAsync(
        `INSERT INTO body_weight_entries (date, weight_kg, created_at, updated_at) VALUES (?, ?, 'x', 'x')`,
        [date, weight],
      );

    await insert('2026-01-01', 70);
    await expect(insert('2026-01-01', 71)).rejects.toThrow(/UNIQUE/);
    await expect(insert('2026-01-02', 0)).rejects.toThrow(/CHECK/);
  });
});
