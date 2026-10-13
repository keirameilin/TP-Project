import { kgToDisplayLb } from '../bodyweight/units';
import type { CaloriesBurned, CaloriesResult, Effort, EffortResult } from './effort';

/** The small label saying where an effort level came from. */
export const EFFORT_SOURCE_LABELS: Record<Effort['source'], string> = {
  heart_rate: 'from heart rate',
  calories: 'from calories',
  rating: 'your rating',
};

/** The small label saying where a calories figure came from. */
export const CALORIES_SOURCE_LABELS: Record<CaloriesBurned['source'], string> = {
  entered: 'entered',
  estimated: 'estimated',
};

/** Shown with every heart-rate effort: why it can read low for football. */
export const HEART_RATE_CAVEAT = 'Average heart rate understates stop-and-go efforts like soccer.';

const whole = (n: number) => Math.round(n).toLocaleString();

/**
 * Fixed-template lines explaining an effort level with the player's own numbers, plus a line for
 * any number they entered that couldn't be used.
 */
export function describeEffort({ effort, skipped }: EffortResult): string[] {
  const lines: string[] = [];

  if (effort?.source === 'heart_rate') {
    const max = effort.maxIsEstimated
      ? `your estimated max (${effort.maxHeartRate}, from 208 − 0.7 × your age)`
      : `your max (${effort.maxHeartRate})`;
    lines.push(
      `Average heart rate ${effort.avgHeartRate} bpm = ${effort.percentOfMax}% of ${max}: effort about ${effort.level} (estimate).`,
      HEART_RATE_CAVEAT,
    );
  } else if (effort?.source === 'calories') {
    lines.push(
      `${whole(effort.caloriesBurned)} kcal in ${effort.durationMinutes} min at ${kgToDisplayLb(effort.weightKg)} lb is about ${effort.met} MET: effort about ${effort.level} (estimate).`,
    );
  } else if (effort?.source === 'rating') {
    lines.push(
      `Your own rating: ${effort.level} out of 10. Training load: ${effort.level} × ${effort.durationMinutes} min = ${whole(effort.trainingLoad)}.`,
    );
  }

  if (skipped.includes('heart_rate_needs_age')) {
    lines.push("Effort can't be estimated from heart rate without your age. Add it on the Player tab.");
  }
  if (skipped.includes('calories_need_weight')) {
    lines.push("Effort can't be estimated from calories without a body weight. Log your weight to use them.");
  }
  return lines;
}

/** Fixed-template lines explaining a calories-burned figure, or what is missing to estimate one. */
export function describeCalories({ calories, heartRateNotUsed }: CaloriesResult): string[] {
  if (!calories) {
    return ["Calories burned can't be estimated without a body weight. Log your weight, or enter the calories your watch recorded."];
  }
  const basis =
    calories.source === 'entered'
      ? 'entered'
      : calories.method === 'heart_rate'
        ? 'estimated from your heart rate, age, weight, sex, and duration'
        : 'estimated from your session type, duration, and weight';
  const lines = [`Calories burned: ${whole(calories.kcal)} kcal (${basis}).`];
  if (heartRateNotUsed) {
    lines.push('Add your age and sex on the Player tab to estimate calories from your heart rate instead.');
  }
  return lines;
}
