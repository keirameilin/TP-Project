import type { ValidationIssue } from '../../lib/validation';
import { lbToKg, type BodyWeightEntry } from '../bodyweight/types';
import { kgToDisplayLb, WEIGHT_RANGE_LB_MESSAGE } from '../bodyweight/units';
import { validateBodyWeight } from '../bodyweight/validation';
import type { FoodEstimate } from '../foodPhoto/types';
import type { FoodEntry, MealType, NewFoodEntry } from '../nutrition/types';
import { validateFoodEntry } from '../nutrition/validation';
import type { SessionType, TrainingSession } from '../training/types';
import { validateSession } from '../training/validation';

/** How the player tells us a session's effort: their own 1–10 rating, or numbers from their watch. */
export type EffortInput = 'rating' | 'watch';

/** Raw day form state. Number inputs stay strings so partially-typed values ("72.") survive. */
export interface DailyLogForm {
  sessionType: SessionType | null;
  duration: string;
  /** Only the chosen side is saved: the rating, or the watch numbers. */
  effortInput: EffortInput;
  rpe: number | null;
  /** Numbers from the player's watch. */
  avgHeartRate: string;
  peakHeartRate: string;
  caloriesBurned: string;
  /** How the session went, 1–10. Separate from effort (how hard it was). */
  sessionQuality: number | null;
  /** Hours slept the night before; optional. */
  sleepHours: string;
  /** In pounds, as typed; stored in kg. */
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
  avgHeartRate: number | null;
  peakHeartRate: number | null;
  caloriesBurned: number | null;
  sessionQuality: number | null;
  sleepHours: number | null;
}

/** Parsed day form: null means the section was left empty and should not be stored. */
export interface DailyLogValues {
  training: TrainingValues | null;
  weightKg: number | null;
}

export const EMPTY_FORM: DailyLogForm = {
  sessionType: null,
  duration: '',
  effortInput: 'rating',
  rpe: null,
  avgHeartRate: '',
  peakHeartRate: '',
  caloriesBurned: '',
  sessionQuality: null,
  sleepHours: '',
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
  avgHeartRate: 'Average heart rate',
  peakHeartRate: 'Max heart rate',
  caloriesBurned: 'Calories burned',
  sessionQuality: 'Session rating',
  sleepHours: 'Sleep',
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
  avgHeartRate: 'avgHeartRate',
  peakHeartRate: 'peakHeartRate',
  caloriesBurned: 'caloriesBurned',
  sessionQuality: 'sessionQuality',
  sleepHours: 'sleepHours',
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
    if (issue.field === 'weightKg') {
      // The data layer's message quotes the range in kg; the form is in pounds.
      errors.weight ??= WEIGHT_RANGE_LB_MESSAGE;
    } else if (field) {
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
    const fromWatch = !isRest && form.effortInput === 'watch';
    training = {
      sessionType: form.sessionType,
      durationMinutes: isRest ? null : parseNumber(form.duration),
      // Only the side the player chose is kept; whatever was typed on the other side is dropped.
      rpe: isRest || fromWatch ? null : form.rpe,
      avgHeartRate: fromWatch ? parseNumber(form.avgHeartRate) : null,
      peakHeartRate: fromWatch ? parseNumber(form.peakHeartRate) : null,
      caloriesBurned: fromWatch ? parseNumber(form.caloriesBurned) : null,
      // A rest day has no session to rate, and gets no review that sleep could explain.
      sessionQuality: isRest ? null : form.sessionQuality,
      sleepHours: isRest ? null : parseNumber(form.sleepHours),
    };
    // The validator says "is required unless rest_day"; the form hides those inputs on rest days anyway.
    if (training.durationMinutes === null && !isRest) errors.duration = 'Duration is required';
    if (fromWatch) {
      // The session max alone says nothing about effort.
      if (training.avgHeartRate === null && training.caloriesBurned === null) {
        errors.avgHeartRate = 'Enter your average heart rate or calories burned, or rate your effort instead';
      }
    } else if (training.rpe === null && !isRest) {
      errors.rpe = 'Pick an effort rating';
    }
    if (training.sessionQuality === null && !isRest) errors.sessionQuality = 'Rate how the session went';
    issues.push(
      ...validateSession({ date, notes: null, ...training }).filter(
        // In watch mode the missing-effort problem is reported on the watch fields above.
        (issue) => !(fromWatch && issue.field === 'rpe'),
      ),
    );
  }

  const weightLb = parseNumber(form.weight);
  const weightKg = weightLb === null ? null : lbToKg(weightLb);
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
    effortInput:
      training && (training.avgHeartRate ?? training.peakHeartRate ?? training.caloriesBurned) !== null
        ? 'watch'
        : 'rating',
    rpe: training?.rpe ?? null,
    avgHeartRate: numberText(training?.avgHeartRate),
    peakHeartRate: numberText(training?.peakHeartRate),
    caloriesBurned: numberText(training?.caloriesBurned),
    sessionQuality: training?.sessionQuality ?? null,
    sleepHours: numberText(training?.sleepHours),
    weight: weight ? String(kgToDisplayLb(weight.weightKg)) : '',
  };
}
