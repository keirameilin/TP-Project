import { ValidationError as TrainingValidationError } from '../../training/validation';
import { ValidationError } from '../../../lib/validation';
import { validateFoodEntry, type FoodEntryFields } from '../validation';

const valid: FoodEntryFields = {
  date: '2026-09-29',
  mealType: 'lunch',
  foodName: 'Chicken rice bowl',
  calories: 650,
  proteinG: 45,
  carbsG: 70.5,
  fatG: 18,
};

const fieldsWithIssues = (e: FoodEntryFields) => validateFoodEntry(e).map((i) => i.field);

describe('validateFoodEntry', () => {
  it('accepts a complete entry, including decimal macros', () => {
    expect(validateFoodEntry(valid)).toEqual([]);
  });

  it('accepts zero for every amount (e.g. black coffee, water)', () => {
    expect(validateFoodEntry({ ...valid, calories: 0, proteinG: 0, carbsG: 0, fatG: 0 })).toEqual([]);
  });

  it.each([-1, NaN, Infinity, 10_001])('rejects calories %p', (calories) => {
    expect(fieldsWithIssues({ ...valid, calories })).toEqual(['calories']);
  });

  it.each(['proteinG', 'carbsG', 'fatG'] as const)('rejects out-of-range %s', (field) => {
    expect(fieldsWithIssues({ ...valid, [field]: -0.5 })).toEqual([field]);
    expect(fieldsWithIssues({ ...valid, [field]: 1_000.1 })).toEqual([field]);
  });

  it('rejects missing amounts', () => {
    expect(fieldsWithIssues({ ...valid, calories: undefined as never, fatG: null as never })).toEqual([
      'calories',
      'fatG',
    ]);
  });

  it.each(['', '   ', undefined as never])('rejects blank food name %p', (foodName) => {
    expect(fieldsWithIssues({ ...valid, foodName })).toEqual(['foodName']);
  });

  it('rejects an overly long food name', () => {
    expect(fieldsWithIssues({ ...valid, foodName: 'x'.repeat(201) })).toEqual(['foodName']);
  });

  it('rejects an unknown meal type and bad date', () => {
    expect(fieldsWithIssues({ ...valid, mealType: 'brunch' as never, date: '2026-02-30' })).toEqual([
      'date',
      'mealType',
    ]);
  });
});

it('shares one ValidationError class across features', () => {
  expect(TrainingValidationError).toBe(ValidationError);
});
