import type { PlayerLevel, PlayerProfile, Sex } from '../profile/types';
import { TARGET_RULES } from './rules';

export interface BaselineInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  level: PlayerLevel;
}

/** A static starting point for a day's intake — not yet adjusted for the day's training or for progress. */
export interface BaselineTargets {
  /** Resting calories from Mifflin-St Jeor. */
  bmr: number;
  level: PlayerLevel;
  activityFactor: number;
  calories: number;
  proteinG: number;
  /** The protein rule that applied: lower for players under the junior age limit. */
  proteinGPerKg: number;
  carbsG: number;
  fatG: number;
  /** The body weight the targets were computed with. */
  weightKg: number;
}

/** Mifflin-St Jeor resting energy expenditure, in kcal per day. */
export function bmrMifflinStJeor(p: Pick<BaselineInput, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const f = TARGET_RULES.restingCalories.value;
  return f.perKg * p.weightKg + f.perCm * p.heightCm + f.perYear * p.age + f[p.sex];
}

/** Protein per kg of body weight for a player's age: the junior rule below the junior age limit. */
export function proteinGPerKgFor(age: number): number {
  return age < TARGET_RULES.juniorAgeLimit.value
    ? TARGET_RULES.juniorProteinGPerKg.value
    : TARGET_RULES.proteinGPerKg.value;
}

/**
 * Maintenance calories (BMR × activity factor for the playing level) split into macros:
 * protein by body weight, fat as a share of calories, carbs as the remainder.
 * Every constant comes from TARGET_RULES, which records where each one is from.
 */
export function baselineTargets(input: BaselineInput): BaselineTargets {
  const kcalPerGram = TARGET_RULES.kcalPerGram.value;
  const bmr = bmrMifflinStJeor(input);
  const activityFactor = TARGET_RULES.activityFactor.value[input.level];
  const calories = Math.round((bmr * activityFactor) / 10) * 10;

  const proteinGPerKg = proteinGPerKgFor(input.age);
  const proteinG = Math.round(proteinGPerKg * input.weightKg);
  const fatG = Math.round((calories * TARGET_RULES.fatEnergyFraction.value) / kcalPerGram.fat);
  const carbsKcal = calories - proteinG * kcalPerGram.protein - fatG * kcalPerGram.fat;
  const carbsG = Math.max(0, Math.round(carbsKcal / kcalPerGram.carbs));

  return {
    bmr: Math.round(bmr),
    level: input.level,
    activityFactor,
    calories,
    proteinG,
    proteinGPerKg,
    carbsG,
    fatG,
    weightKg: input.weightKg,
  };
}

export const TARGET_REQUIREMENTS = ['age', 'sex', 'height', 'playing level', 'body weight'] as const;
export type TargetRequirement = (typeof TARGET_REQUIREMENTS)[number];

export type TargetsResult =
  | { ok: true; targets: BaselineTargets }
  /** What the player still has to provide before targets can be calculated. */
  | { ok: false; missing: TargetRequirement[] };

/** Targets from the saved profile and a body weight, or the list of what's still missing. */
export function resolveBaselineTargets(profile: PlayerProfile | null, weightKg: number | null): TargetsResult {
  const missing: TargetRequirement[] = [];
  if (!profile) missing.push('age');
  if (!profile?.sex) missing.push('sex');
  if (!profile?.heightCm) missing.push('height');
  if (!profile?.level) missing.push('playing level');
  if (!weightKg) missing.push('body weight');

  if (!profile || !profile.sex || !profile.heightCm || !profile.level || !weightKg) {
    return { ok: false, missing };
  }
  return {
    ok: true,
    targets: baselineTargets({
      sex: profile.sex,
      age: profile.age,
      heightCm: profile.heightCm,
      level: profile.level,
      weightKg,
    }),
  };
}
