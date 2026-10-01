export interface PlayerProfile {
  age: number;
  /** Measured max heart rate (bpm). Null means estimate it from age. */
  maxHeartRate: number | null;
  /** ISO-8601 UTC timestamp. */
  updatedAt: string;
}

export interface PlayerProfileInput {
  age: number;
  maxHeartRate?: number | null;
}
