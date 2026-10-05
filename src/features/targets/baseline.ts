import type { PlayerLevel, PlayerProfile, Sex } from '../profile/types';

/**
 * Multiplies resting calories (BMR) up to a full day's burn. These are the standard "moderately /
 * very / extra active" factors; the professional one is in line with measured expenditure of
 * full-time players (roughly 3,500 kcal a day).
 */
export const ACTIVITY_FACTORS: Record<PlayerLevel, number> = {
  recreational: 1.55,
  competitive: 1.725,
  professional: 1.9,
};

/** Within the 1.6–2.2 g/kg usually recommended for players. */
export const PROTEIN_G_PER_KG = 1.8;
/** Share of daily calories from fat; carbs take whatever protein and fat leave. */
export const FAT_ENERGY_FRACTION = 0.25;

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

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
  activityFactor: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** The body weight the targets were computed with. */
  weightKg: number;
}

/** Mifflin-St Jeor resting energy expenditure, in kcal per day. */
export function bmrMifflinStJeor(p: Pick<BaselineInput, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

/**
 * Maintenance calories (BMR × activity factor for the playing level) split into macros:
 * protein by body weight, fat as a share of calories, carbs as the remainder.
 */
export function baselineTargets(input: BaselineInput): BaselineTargets {
  const bmr = bmrMifflinStJeor(input);
  const activityFactor = ACTIVITY_FACTORS[input.level];
  const calories = Math.round((bmr * activityFactor) / 10) * 10;

  const proteinG = Math.round(PROTEIN_G_PER_KG * input.weightKg);
  const fatG = Math.round((calories * FAT_ENERGY_FRACTION) / KCAL_PER_G.fat);
  const carbsKcal = calories - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat;
  const carbsG = Math.max(0, Math.round(carbsKcal / KCAL_PER_G.carbs));

  return { bmr: Math.round(bmr), activityFactor, calories, proteinG, carbsG, fatG, weightKg: input.weightKg };
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
