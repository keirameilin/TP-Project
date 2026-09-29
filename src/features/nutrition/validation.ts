import { isValidDateString } from '../../lib/dates';
import { ValidationError, type ValidationIssue as BaseValidationIssue } from '../../lib/validation';
import { MEAL_TYPES, type Macros, type MealType } from './types';

export const FOOD_NAME_MAX_LENGTH = 200;
/** Per-entry sanity caps — well above any real single food, but catch typos like 25000 kcal. */
export const CALORIES_MAX = 10_000;
export const MACRO_GRAMS_MAX = 1_000;

export type ValidationIssue = BaseValidationIssue<
  'date' | 'mealType' | 'foodName' | 'calories' | 'proteinG' | 'carbsG' | 'fatG'
>;

/** A fully-resolved entry (defaults applied, name trimmed) ready to be validated and stored. */
export interface FoodEntryFields extends Macros {
  date: string;
  mealType: MealType;
  foodName: string;
}

export function isMealType(value: unknown): value is MealType {
  return typeof value === 'string' && (MEAL_TYPES as readonly string[]).includes(value);
}

function checkAmount(
  issues: ValidationIssue[],
  field: 'calories' | 'proteinG' | 'carbsG' | 'fatG',
  value: number,
  max: number,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
    issues.push({ field, message: `must be a number from 0 to ${max}` });
  }
}

/** Returns all validation issues for an entry; an empty array means it is valid. */
export function validateFoodEntry(e: FoodEntryFields): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isValidDateString(e.date)) {
    issues.push({ field: 'date', message: 'must be a valid date in YYYY-MM-DD format' });
  }

  if (!isMealType(e.mealType)) {
    issues.push({ field: 'mealType', message: `must be one of: ${MEAL_TYPES.join(', ')}` });
  }

  if (typeof e.foodName !== 'string' || e.foodName.trim() === '') {
    issues.push({ field: 'foodName', message: 'is required' });
  } else if (e.foodName.trim().length > FOOD_NAME_MAX_LENGTH) {
    issues.push({ field: 'foodName', message: `must be at most ${FOOD_NAME_MAX_LENGTH} characters` });
  }

  checkAmount(issues, 'calories', e.calories, CALORIES_MAX);
  checkAmount(issues, 'proteinG', e.proteinG, MACRO_GRAMS_MAX);
  checkAmount(issues, 'carbsG', e.carbsG, MACRO_GRAMS_MAX);
  checkAmount(issues, 'fatG', e.fatG, MACRO_GRAMS_MAX);

  return issues;
}

/** Throws a ValidationError if the entry is invalid. */
export function assertValidFoodEntry(e: FoodEntryFields): void {
  const issues = validateFoodEntry(e);
  if (issues.length > 0) throw new ValidationError(issues);
}
