import { createTestDatabase } from '../../../test-utils/testDatabase';
import {
  defaultMealType,
  EMPTY_FORM,
  emptyFoodItem,
  foodItemFromEntry,
  formFromRecords,
  parseFoodItem,
  parseForm,
  type DailyLogForm,
  type FoodItemForm,
} from '../form';
import { createDailyLogRepos, loadDay, loadDayFood, saveDay, type DailyLogRepos } from '../saveDay';

const DATE = '2026-09-30';
const form = (overrides: Partial<DailyLogForm>): DailyLogForm => ({ ...EMPTY_FORM, ...overrides });
const foodItem = (overrides: Partial<FoodItemForm>): FoodItemForm => ({
  ...emptyFoodItem('lunch'),
  foodName: 'Chicken wrap',
  calories: '550',
  protein: '40',
  carbs: '50',
  fat: '18',
  ...overrides,
});

describe('parseForm', () => {
  it('rejects an empty form', () => {
    expect(parseForm(EMPTY_FORM, DATE).errors.form).toMatch(/Nothing to save/);
  });

  it('parses training and weight', () => {
    const { values, errors } = parseForm(form({ sessionType: 'match', duration: '90', rpe: 8, weight: '72,4' }), DATE);
    expect(errors).toEqual({});
    expect(values).toEqual({
      training: { sessionType: 'match', durationMinutes: 90, rpe: 8 },
      weightKg: 72.4,
    });
  });

  it('ignores hidden duration and effort on a rest day', () => {
    const { values, errors } = parseForm(form({ sessionType: 'rest_day', duration: 'x', rpe: 4 }), DATE);
    expect(errors).toEqual({});
    expect(values.training).toEqual({ sessionType: 'rest_day', durationMinutes: null, rpe: null });
  });

  it('flags missing training fields and data-layer range errors per input', () => {
    const { errors } = parseForm(form({ sessionType: 'technical_tactical', weight: '5' }), DATE);
    expect(errors.duration).toBe('Duration is required');
    expect(errors.rpe).toBe('Pick an effort rating');
    expect(errors.weight).toBe('Weight must be a number from 20 to 400');
  });

  it('flags a non-whole duration', () => {
    const { errors } = parseForm(form({ sessionType: 'gym_strength', duration: '45.5', rpe: 6 }), DATE);
    expect(errors.duration).toMatch(/^Duration must be a whole number/);
  });
});

describe('parseFoodItem', () => {
  it('parses a valid item', () => {
    const { entry, errors } = parseFoodItem(foodItem({ foodName: '  Chicken wrap ', carbs: '50,5' }), DATE);
    expect(errors).toEqual({});
    expect(entry).toEqual({
      date: DATE,
      mealType: 'lunch',
      foodName: 'Chicken wrap',
      calories: 550,
      proteinG: 40,
      carbsG: 50.5,
      fatG: 18,
    });
  });

  it('requires a name and every macro, and surfaces range errors', () => {
    const { errors } = parseFoodItem(foodItem({ foodName: ' ', calories: '25000', protein: '', fat: 'abc' }), DATE);
    expect(errors).toEqual({
      foodName: 'Food name is required',
      calories: 'Calories must be a number from 0 to 10000',
      protein: 'Protein is required',
      fat: 'Fat must be a number from 0 to 1000',
    });
  });

  it('accepts zero for a macro', () => {
    expect(parseFoodItem(foodItem({ fat: '0' }), DATE).errors).toEqual({});
  });
});

it('guesses the meal from the time of day', () => {
  expect(defaultMealType(new Date(2026, 8, 30, 7))).toBe('breakfast');
  expect(defaultMealType(new Date(2026, 8, 30, 13))).toBe('lunch');
  expect(defaultMealType(new Date(2026, 8, 30, 19))).toBe('dinner');
  expect(defaultMealType(new Date(2026, 8, 30, 22))).toBe('snack');
});

describe('saving', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let repos: DailyLogRepos;

  beforeEach(async () => {
    db = await createTestDatabase();
    repos = createDailyLogRepos(db, { now: () => new Date(2026, 8, 30, 12) });
  });
  afterEach(() => db.close());

  const save = (f: DailyLogForm) => saveDay(repos, DATE, parseForm(f, DATE).values);
  const addFood = (overrides: Partial<FoodItemForm>) => repos.food.create(parseFoodItem(foodItem(overrides), DATE).entry);

  it('writes training and weight and round-trips into the form', async () => {
    const full = form({ sessionType: 'match', duration: '90', rpe: 8, weight: '72.4' });
    await save(full);
    expect(formFromRecords(await loadDay(repos, DATE))).toEqual(full);
  });

  it('updates instead of duplicating when saved again', async () => {
    await save(form({ sessionType: 'match', duration: '90', rpe: 8 }));
    await save(form({ sessionType: 'rest_day' }));

    expect(await repos.training.list()).toHaveLength(1);
    expect((await repos.training.getByDate(DATE))?.sessionType).toBe('rest_day');
  });

  it('deletes sections that were cleared, without touching food', async () => {
    await addFood({});
    await save(form({ sessionType: 'match', duration: '90', rpe: 8, weight: '70' }));
    await save(form({ weight: '71' }));

    const day = await loadDay(repos, DATE);
    expect(day.training).toBeNull();
    expect(day.weight?.weightKg).toBe(71);
    expect((await loadDayFood(repos, DATE)).entries).toHaveLength(1);
  });

  it('sums food items into the day and meal totals', async () => {
    await addFood({ mealType: 'breakfast', foodName: 'Oats', calories: '350', protein: '12', carbs: '60', fat: '7' });
    await addFood({});
    await addFood({ foodName: 'Apple', calories: '95', protein: '0.5', carbs: '25', fat: '0.3' });

    const { entries, totals } = await loadDayFood(repos, DATE);
    expect(entries.map((e) => e.foodName)).toEqual(['Oats', 'Chicken wrap', 'Apple']);
    expect(totals.totals).toEqual({ calories: 995, proteinG: 52.5, carbsG: 135, fatG: 25.3 });
    expect(totals.byMeal.lunch.calories).toBe(645);
  });

  it('edits a food item through the form and updates the totals', async () => {
    const created = await addFood({});
    const edited = { ...foodItemFromEntry(created), mealType: 'dinner' as const, calories: '600' };
    await repos.food.update(created.id, parseFoodItem(edited, DATE).entry);

    const { entries, totals } = await loadDayFood(repos, DATE);
    expect(entries).toHaveLength(1);
    expect(foodItemFromEntry(entries[0])).toEqual(edited);
    expect(totals.byMeal.dinner.calories).toBe(600);
    expect(totals.byMeal.lunch.calories).toBe(0);
  });

  it('saves and reloads a past day separately from today', async () => {
    const yesterday = '2026-09-29';
    await saveDay(repos, yesterday, parseForm(form({ sessionType: 'rest_day', weight: '70' }), yesterday).values);
    await save(form({ sessionType: 'match', duration: '90', rpe: 8 }));

    expect(formFromRecords(await loadDay(repos, yesterday))).toEqual(form({ sessionType: 'rest_day', weight: '70' }));
    expect((await loadDay(repos, DATE)).training?.sessionType).toBe('match');
  });

  it('keeps one entry per day with the latest values when saves overlap', async () => {
    await Promise.all([
      save(form({ sessionType: 'match', duration: '90', rpe: 8, weight: '70' })),
      save(form({ sessionType: 'gym_strength', duration: '45', rpe: 6, weight: '71' })),
    ]);

    expect(await repos.training.list()).toHaveLength(1);
    expect(await repos.weight.list()).toHaveLength(1);
    expect(formFromRecords(await loadDay(repos, DATE))).toEqual(
      form({ sessionType: 'gym_strength', duration: '45', rpe: 6, weight: '71' }),
    );
  });
});
