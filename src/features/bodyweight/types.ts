export interface BodyWeightEntry {
  id: number;
  /** Local calendar date, YYYY-MM-DD. At most one weigh-in per date. */
  date: string;
  weightKg: number;
  /** ISO-8601 UTC timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Input for logging a weigh-in. `date` defaults to today (local time). */
export interface NewBodyWeightEntry {
  date?: string;
  weightKg: number;
}

const KG_PER_LB = 0.45359237;

export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
