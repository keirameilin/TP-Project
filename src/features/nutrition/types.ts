/** Meal types, in the order they occur in a day (used for sorting). */
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type MealType = (typeof MEAL_TYPES)[number];

export interface Macros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface FoodEntry extends Macros {
  id: number;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  mealType: MealType;
  foodName: string;
  /** ISO-8601 UTC timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Input for logging food. `date` defaults to today (local time). */
export interface NewFoodEntry extends Macros {
  date?: string;
  mealType: MealType;
  foodName: string;
}

/** Partial update; any omitted field keeps its current value. */
export type FoodEntryPatch = Partial<NewFoodEntry>;

export interface DailyTotals {
  date: string;
  entryCount: number;
  totals: Macros;
  byMeal: Record<MealType, Macros>;
}
