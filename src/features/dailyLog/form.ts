import type { ValidationIssue } from '../../lib/validation';
import { validateBodyWeight } from '../bodyweight/validation';
import type { BodyWeightEntry } from '../bodyweight/types';
import type { FoodEstimate } from '../foodPhoto/types';
import type { FoodEntry, MealType, NewFoodEntry } from '../nutrition/types';
import { validateFoodEntry } from '../nutrition/validation';
import type { SessionType, TrainingSession } from '../training/types';
import { validateSession } from '../training/validation';

/** Raw day form state. Number inputs stay strings so partially-typed values ("72.") survive. */
export interface DailyLogForm {
  sessionType: SessionType | null;
  duration: string;
  rpe: number | null;
  weight: string;
}

/** Raw state of the add/edit food form. Each item is saved on its own, as soon as it's submitted. */
export interface FoodItemForm {
  mealType: MealType;
  foodName: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

export type FormField = keyof DailyLogForm | 'form';
export type FormErrors = Partial<Record<FormField, string>>;
export type FoodItemField = keyof FoodItemForm | 'form';
export type FoodItemErrors = Partial<Record<FoodItemField, string>>;

export interface TrainingValues {
  sessionType: SessionType;
  durationMinutes: number | null;
  rpe: number | null;
}

/** Parsed day form: null means the section was left empty and should not be stored. */
export interface DailyLogValues {
  training: TrainingValues | null;
  weightKg: number | null;
}

export const EMPTY_FORM: DailyLogForm = {
  sessionType: null,
  duration: '',
  rpe: null,
  weight: '',
};

/** Guesses the meal from the time of day, so the common case needs no tap. */
export function defaultMealType(now: Date): MealType {
  const hour = now.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

export function emptyFoodItem(mealType: MealType): FoodItemForm {
  return { mealType, foodName: '', calories: '', protein: '', carbs: '', fat: '' };
}

/** Loads a stored item back into the food form for editing. */
export function foodItemFromEntry(entry: FoodEntry): FoodItemForm {
  return {
    mealType: entry.mealType,
    foodName: entry.foodName,
    calories: String(entry.calories),
    protein: String(entry.proteinG),
    carbs: String(entry.carbsG),
    fat: String(entry.fatG),
  };
}

/** Fills the food form from a photo estimate, keeping the meal the user already picked. */
export function foodItemFromEstimate(estimate: FoodEstimate, mealType: MealType): FoodItemForm {
  return {
    mealType,
    foodName: estimate.foodName,
    calories: String(estimate.calories),
    protein: String(estimate.proteinG),
    carbs: String(estimate.carbsG),
    fat: String(estimate.fatG),
  };
}

const FIELD_LABELS: Record<string, string> = {
  sessionType: 'Session type',
  duration: 'Duration',
  rpe: 'Effort',
  weight: 'Weight',
  mealType: 'Meal',
  foodName: 'Food name',
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
};

/** Maps data-layer field names onto the form input that shows the error. */
const DATA_FIELD_TO_FORM: Record<string, string> = {
  sessionType: 'sessionType',
  durationMinutes: 'duration',
  rpe: 'rpe',
  weightKg: 'weight',
  mealType: 'mealType',
  foodName: 'foodName',
  calories: 'calories',
  proteinG: 'protein',
  carbsG: 'carbs',
  fatG: 'fat',
};

/** Blank → null; accepts a comma decimal separator. Garbage becomes NaN for the validators to reject. */
function parseNumber(text: string): number | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : Number(trimmed.replace(',', '.'));
}

/** Converts data-layer validation issues into per-input messages (first issue per input wins). */
export function issuesToErrors<F extends string>(issues: ValidationIssue[]): Partial<Record<F | 'form', string>> {
  const errors: Partial<Record<string, string>> = {};
  for (const issue of issues) {
    const field = DATA_FIELD_TO_FORM[issue.field];
    if (field) {
      errors[field] ??= `${FIELD_LABELS[field]} ${issue.message}`;
    } else {
      errors.form ??= `${issue.field} ${issue.message}`;
    }
  }
  return errors as Partial<Record<F | 'form', string>>;
}

/**
 * Parses the day form and runs it through the same validators the repositories use,
 * so every section is checked before anything is written.
 */
export function parseForm(form: DailyLogForm, date: string): { values: DailyLogValues; errors: FormErrors } {
  const errors: FormErrors = {};
  const issues: ValidationIssue[] = [];

  let training: TrainingValues | null = null;
  if (form.sessionType) {
    const isRest = form.sessionType === 'rest_day';
    training = {
      sessionType: form.sessionType,
      durationMinutes: isRest ? null : parseNumber(form.duration),
      rpe: isRest ? null : form.rpe,
    };
    // The validator says "is required unless rest_day"; the form hides those inputs on rest days anyway.
    if (training.durationMinutes === null && !isRest) errors.duration = 'Duration is required';
    if (training.rpe === null && !isRest) errors.rpe = 'Pick an effort rating';
    issues.push(...validateSession({ date, notes: null, ...training }));
  }

  const weightKg = parseNumber(form.weight);
  if (weightKg !== null) issues.push(...validateBodyWeight({ date, weightKg }));

  const fromValidators = issuesToErrors<FormField>(issues);
  for (const key of Object.keys(fromValidators) as FormField[]) errors[key] ??= fromValidators[key];

  if (!training && weightKg === null) {
    errors.form = 'Nothing to save yet — pick a session type or enter your weight.';
  }

  return { values: { training, weightKg }, errors };
}

/** Parses one food item. A blank macro is an error, not 0, so a forgotten field isn't logged as zero. */
export function parseFoodItem(
  item: FoodItemForm,
  date: string,
): { entry: NewFoodEntry; errors: FoodItemErrors } {
  const [calories, proteinG, carbsG, fatG] = [item.calories, item.protein, item.carbs, item.fat].map(
    (t) => parseNumber(t) ?? NaN,
  );
  const entry: NewFoodEntry = {
    date,
    mealType: item.mealType,
    foodName: item.foodName.trim(),
    calories,
    proteinG,
    carbsG,
    fatG,
  };
  const errors = issuesToErrors<FoodItemField>(validateFoodEntry({ ...entry, date }));
  for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
    if (item[key].trim() === '') errors[key] = `${FIELD_LABELS[key]} is required`;
  }
  return { entry, errors };
}

const numberText = (n: number | null | undefined) => (n == null ? '' : String(n));

/** Builds the day form from what is already stored, so reopening the screen shows it. */
export function formFromRecords(records: {
  training: TrainingSession | null;
  weight: BodyWeightEntry | null;
}): DailyLogForm {
  const { training, weight } = records;
  return {
    sessionType: training?.sessionType ?? null,
    duration: numberText(training?.durationMinutes),
    rpe: training?.rpe ?? null,
    weight: numberText(weight?.weightKg),
  };
}
