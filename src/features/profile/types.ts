/** Needed by the resting-calorie formula, which has a different constant for each. */
export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];

/** How much the player trains; scales resting calories up to a full day's burn. */
export const PLAYER_LEVELS = ['recreational', 'competitive', 'professional'] as const;
export type PlayerLevel = (typeof PLAYER_LEVELS)[number];

export interface PlayerProfile {
  age: number;
  /** Sex, height and level are optional, but all three are needed for calorie/macro targets. */
  sex: Sex | null;
  heightCm: number | null;
  level: PlayerLevel | null;
  /** Measured max heart rate (bpm). Null means estimate it from age. */
  maxHeartRate: number | null;
  /** ISO-8601 UTC timestamp. */
  updatedAt: string;
}

/** Saving replaces the whole profile; omitted optional fields are cleared. */
export interface PlayerProfileInput {
  age: number;
  sex?: Sex | null;
  heightCm?: number | null;
  level?: PlayerLevel | null;
  maxHeartRate?: number | null;
}
