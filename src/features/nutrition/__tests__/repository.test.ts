import { createTestDatabase } from '../../../test-utils/testDatabase';
import { ValidationError } from '../../../lib/validation';
import { FoodEntryRepository } from '../repository';
import type { NewFoodEntry } from '../types';

const FIXED_NOW = new Date(2026, 8, 29, 12, 30); // Sep 29 2026, 12:30 local

const oats: NewFoodEntry = {
  mealType: 'breakfast',
  foodName: 'Oats with berries',
  calories: 350,
  proteinG: 12,
  carbsG: 60,
  fatG: 7,
};

let db: Awaited<ReturnType<typeof createTestDatabase>>;
let repo: FoodEntryRepository;

beforeEach(async () => {
  db = await createTestDatabase();
  repo = new FoodEntryRepository(db, { now: () => FIXED_NOW });
});

afterEach(() => db.close());

describe('create', () => {
  it('logs an entry, defaulting the date to today and trimming the name', async () => {
    const e = await repo.create({ ...oats, foodName: '  Oats with berries ' });

    expect(e).toEqual({
      id: expect.any(Number),
      date: '2026-09-29',
      mealType: 'breakfast',
      foodName: 'Oats with berries',
      calories: 350,
      proteinG: 12,
      carbsG: 60,
      fatG: 7,
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
    });
  });

  it('allows many entries on the same date and meal', async () => {
    await repo.create(oats);
    await repo.create({ ...oats, foodName: 'Banana', calories: 105 });
    expect(await repo.listByDate('2026-09-29')).toHaveLength(2);
  });

  it('preserves decimal macros', async () => {
    const e = await repo.create({ ...oats, proteinG: 12.5, fatG: 0.3 });
    expect(e).toMatchObject({ proteinG: 12.5, fatG: 0.3 });
  });

  it('rejects invalid input without writing anything', async () => {
    await expect(repo.create({ ...oats, calories: -10 })).rejects.toThrow(ValidationError);
    expect(await repo.list()).toEqual([]);
  });
});

describe('read', () => {
  beforeEach(async () => {
    await repo.create({ ...oats, date: '2026-09-28', mealType: 'snack', foodName: 'Protein bar' });
    await repo.create({ ...oats, date: '2026-09-28', mealType: 'breakfast' });
    await repo.create({ ...oats, date: '2026-09-29', mealType: 'dinner', foodName: 'Salmon' });
    await repo.create({ ...oats, date: '2026-09-29', mealType: 'lunch', foodName: 'Wrap' });
    await repo.create({ ...oats, date: '2026-09-29', mealType: 'lunch', foodName: 'Apple' });
  });

  it('lists a day in meal order, then in the order logged', async () => {
    expect((await repo.listByDate('2026-09-29')).map((e) => e.foodName)).toEqual([
      'Wrap',
      'Apple',
      'Salmon',
    ]);
  });

  it('lists newest day first, with optional date range', async () => {
    expect((await repo.list()).map((e) => `${e.date} ${e.mealType}`)).toEqual([
      '2026-09-29 lunch',
      '2026-09-29 lunch',
      '2026-09-29 dinner',
      '2026-09-28 breakfast',
      '2026-09-28 snack',
    ]);
    expect(await repo.list({ from: '2026-09-30' })).toEqual([]);
    expect(await repo.list({ to: '2026-09-28' })).toHaveLength(2);
  });

  it('returns null for a missing entry', async () => {
    expect(await repo.getById(999)).toBeNull();
  });
});

describe('getDailyTotals', () => {
  it('sums the day overall and per meal', async () => {
    await repo.create(oats);
    await repo.create({ ...oats, mealType: 'lunch', foodName: 'Wrap', calories: 520.5, proteinG: 0.1 });
    await repo.create({ ...oats, mealType: 'lunch', foodName: 'Apple', calories: 95, proteinG: 0.2 });
    await repo.create({ ...oats, date: '2026-09-28', calories: 9999 }); // other day, excluded

    const t = await repo.getDailyTotals('2026-09-29');

    expect(t.entryCount).toBe(3);
    expect(t.totals).toEqual({ calories: 965.5, proteinG: 12.3, carbsG: 180, fatG: 21 });
    expect(t.byMeal.lunch).toEqual({ calories: 615.5, proteinG: 0.3, carbsG: 120, fatG: 14 });
    expect(t.byMeal.dinner).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it('returns zeros for a day with nothing logged', async () => {
    const t = await repo.getDailyTotals('2026-01-01');
    expect(t).toMatchObject({ entryCount: 0, totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 } });
  });
});

describe('update', () => {
  it('applies a partial update and bumps updatedAt', async () => {
    const created = await repo.create(oats);
    const later = new Date(FIXED_NOW.getTime() + 60_000);
    const laterRepo = new FoodEntryRepository(db, { now: () => later });

    const updated = await laterRepo.update(created.id, { mealType: 'snack', calories: 0 });

    expect(updated).toMatchObject({
      mealType: 'snack',
      calories: 0,
      proteinG: 12,
      createdAt: created.createdAt,
      updatedAt: later.toISOString(),
    });
  });

  it('re-validates and leaves the entry unchanged on failure', async () => {
    const created = await repo.create(oats);
    await expect(repo.update(created.id, { foodName: '   ' })).rejects.toThrow(ValidationError);
    expect(await repo.getById(created.id)).toEqual(created);
  });

  it('rejects negative calories on update', async () => {
    const created = await repo.create(oats);
    await expect(repo.update(created.id, { calories: -5 })).rejects.toThrow(ValidationError);
    expect((await repo.getById(created.id))?.calories).toBe(350);
  });

  it('returns null when the entry does not exist', async () => {
    expect(await repo.update(999, { calories: 100 })).toBeNull();
  });
});

describe('delete', () => {
  it('deletes an entry', async () => {
    const e = await repo.create(oats);
    expect(await repo.delete(e.id)).toBe(true);
    expect(await repo.getById(e.id)).toBeNull();
    expect(await repo.delete(e.id)).toBe(false);
  });
});

describe('schema constraints', () => {
  it('enforces rules at the database level too', async () => {
    const insert = (meal: string, name: string, calories: number, fat: number) =>
      db.runAsync(
        `INSERT INTO food_entries
           (date, meal_type, food_name, calories, protein_g, carbs_g, fat_g, created_at, updated_at)
         VALUES ('2026-01-01', ?, ?, ?, 0, 0, ?, 'x', 'x')`,
        [meal, name, calories, fat],
      );

    await expect(insert('brunch', 'Eggs', 200, 10)).rejects.toThrow(/CHECK/);
    await expect(insert('lunch', '  ', 200, 10)).rejects.toThrow(/CHECK/);
    await expect(insert('lunch', 'Eggs', -1, 10)).rejects.toThrow(/CHECK/);
    await expect(insert('lunch', 'Eggs', 200, -1)).rejects.toThrow(/CHECK/);
  });
});

describe('getDailyCalories', () => {
  it('sums calories per logged day in range, oldest first, skipping empty days', async () => {
    await repo.create({ ...oats, date: '2026-09-27', calories: 100.1 });
    await repo.create({ ...oats, date: '2026-09-27', calories: 200.2 });
    await repo.create({ ...oats, date: '2026-09-29', calories: 500 });
    await repo.create({ ...oats, date: '2026-09-30', calories: 999 });

    expect(await repo.getDailyCalories({ from: '2026-09-26', to: '2026-09-29' })).toEqual([
      { date: '2026-09-27', calories: 300.3 },
      { date: '2026-09-29', calories: 500 },
    ]);
  });
});
