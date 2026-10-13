import type { Sex } from '../profile/types';
import { EFFORT_RULES, SESSION_MET_RULE } from '../targets/rules';
import type { SessionType } from '../training/types';

/** The parts of a logged session that effort and calories are worked out from. */
export interface SessionInput {
  sessionType: SessionType;
  durationMinutes: number | null;
  /** The player's own 1–10 rating. */
  rpe: number | null;
  avgHeartRate: number | null;
  caloriesBurned: number | null;
}

/** What is known about the player. Anything missing switches off the estimates that need it. */
export interface PlayerInput {
  age: number | null;
  sex: Sex | null;
  /** Measured max heart rate from the profile; null means estimate it from age. */
  maxHeartRate: number | null;
  weightKg: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Straight-line interpolation through points sorted by x. Below the first point or above the last,
 * the value stays at that point's y.
 */
export function interpolate(points: readonly { x: number; y: number }[], x: number): number {
  if (x <= points[0].x) return points[0].y;
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    if (x <= b.x) return a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return points[points.length - 1].y;
}

/** Max heart rate estimated from age with the Tanaka formula, to the nearest beat. */
export function estimatedMaxHeartRate(age: number): number {
  const f = EFFORT_RULES.estimatedMaxHeartRate.value;
  return Math.round(f.base + f.perYear * age);
}

/** The player's measured max heart rate, or an estimate from age; null if neither is known. */
export function resolveMaxHeartRate(
  player: Pick<PlayerInput, 'age' | 'maxHeartRate'>,
): { bpm: number; estimated: boolean } | null {
  if (player.maxHeartRate !== null) return { bpm: player.maxHeartRate, estimated: false };
  if (player.age !== null) return { bpm: estimatedMaxHeartRate(player.age), estimated: true };
  return null;
}

/** Effort (1–10, one decimal) for an average heart rate as a fraction of max heart rate. */
export function effortFromHeartRate(fractionOfMax: number): number {
  const efforts = EFFORT_RULES.effortAtZoneBounds.value;
  const points = EFFORT_RULES.heartRateZoneBounds.value.map((x, i) => ({ x, y: efforts[i] }));
  return round1(interpolate(points, fractionOfMax));
}

/** The MET implied by calories burned: kcal per kg of body weight per hour. */
export function impliedMet(caloriesBurned: number, weightKg: number, durationMinutes: number): number {
  return caloriesBurned / (weightKg * (durationMinutes / 60));
}

/** Effort (1–10, one decimal) for an implied MET. */
export function effortFromMet(met: number): number {
  const points = EFFORT_RULES.effortFromMet.value.map((p) => ({ x: p.met, y: p.effort }));
  return round1(interpolate(points, met));
}

export type Effort =
  | {
      source: 'heart_rate';
      level: number;
      avgHeartRate: number;
      maxHeartRate: number;
      /** True when the max heart rate came from age rather than the profile. */
      maxIsEstimated: boolean;
      /** Average heart rate as a whole percent of max. */
      percentOfMax: number;
    }
  | { source: 'calories'; level: number; caloriesBurned: number; durationMinutes: number; weightKg: number; met: number }
  | { source: 'rating'; level: number; durationMinutes: number; trainingLoad: number };

/** An input the player gave that couldn't be used, and what was missing. */
export type SkippedEstimate = 'heart_rate_needs_age' | 'calories_need_weight';

export interface EffortResult {
  /** Null on a rest day, or when there is nothing to base an effort level on. */
  effort: Effort | null;
  skipped: SkippedEstimate[];
}

/**
 * A session's effort level, from the best input available: average heart rate, else entered
 * calories, else the player's own rating. Only one source is ever used; they are not combined
 * or compared.
 */
export function sessionEffort(session: SessionInput, player: PlayerInput): EffortResult {
  const skipped: SkippedEstimate[] = [];
  const { durationMinutes } = session;
  if (session.sessionType === 'rest_day' || durationMinutes === null || durationMinutes <= 0) {
    return { effort: null, skipped };
  }

  if (session.avgHeartRate !== null) {
    const max = resolveMaxHeartRate(player);
    if (max) {
      const fraction = session.avgHeartRate / max.bpm;
      return {
        effort: {
          source: 'heart_rate',
          level: effortFromHeartRate(fraction),
          avgHeartRate: session.avgHeartRate,
          maxHeartRate: max.bpm,
          maxIsEstimated: max.estimated,
          percentOfMax: Math.round(fraction * 100),
        },
        skipped,
      };
    }
    skipped.push('heart_rate_needs_age');
  }

  if (session.caloriesBurned !== null) {
    if (player.weightKg) {
      const met = impliedMet(session.caloriesBurned, player.weightKg, durationMinutes);
      return {
        effort: {
          source: 'calories',
          level: effortFromMet(met),
          caloriesBurned: session.caloriesBurned,
          durationMinutes,
          weightKg: player.weightKg,
          met: round1(met),
        },
        skipped,
      };
    }
    skipped.push('calories_need_weight');
  }

  if (session.rpe === null) return { effort: null, skipped };
  return {
    effort: { source: 'rating', level: session.rpe, durationMinutes, trainingLoad: session.rpe * durationMinutes },
    skipped,
  };
}

/** Calories for a session from average heart rate (Keytel et al.), or null if the formula gives nothing usable. */
export function caloriesFromHeartRate(input: {
  avgHeartRate: number;
  age: number;
  sex: Sex;
  weightKg: number;
  durationMinutes: number;
}): number | null {
  const rule = EFFORT_RULES.caloriesFromHeartRate.value;
  const c = rule[input.sex];
  const kjPerMinute = c.intercept + c.perBpm * input.avgHeartRate + c.perKg * input.weightKg + c.perYear * input.age;
  // The formula was fitted to exercise heart rates and goes negative at very low ones.
  if (kjPerMinute <= 0) return null;
  return Math.round((kjPerMinute * input.durationMinutes) / rule.kjPerKcal);
}

/** Calories for a session from its type: MET × weight (kg) × hours. */
export function caloriesFromSessionType(sessionType: SessionType, weightKg: number, durationMinutes: number): number {
  const met = EFFORT_RULES[SESSION_MET_RULE[sessionType]].value;
  return Math.round(met * weightKg * (durationMinutes / 60));
}

export type CaloriesBurned =
  | { source: 'entered'; kcal: number }
  | { source: 'estimated'; method: 'heart_rate' | 'session_type'; kcal: number };

export interface CaloriesResult {
  /** Null when nothing was entered and there is no body weight to estimate with. */
  calories: CaloriesBurned | null;
  /** True when a heart rate was entered but age or sex was missing, so the session type was used. */
  heartRateNotUsed: boolean;
}

/**
 * A session's calories burned, from the best input available: the number the player entered,
 * else an estimate from average heart rate, else an estimate from the session type.
 */
export function sessionCalories(session: SessionInput, player: PlayerInput): CaloriesResult {
  if (session.sessionType === 'rest_day') {
    return { calories: { source: 'estimated', method: 'session_type', kcal: 0 }, heartRateNotUsed: false };
  }
  if (session.caloriesBurned !== null) {
    return { calories: { source: 'entered', kcal: Math.round(session.caloriesBurned) }, heartRateNotUsed: false };
  }
  const { durationMinutes } = session;
  if (!player.weightKg || durationMinutes === null || durationMinutes <= 0) {
    return { calories: null, heartRateNotUsed: false };
  }

  let heartRateNotUsed = false;
  if (session.avgHeartRate !== null) {
    const kcal =
      player.age !== null && player.sex !== null
        ? caloriesFromHeartRate({
            avgHeartRate: session.avgHeartRate,
            age: player.age,
            sex: player.sex,
            weightKg: player.weightKg,
            durationMinutes,
          })
        : null;
    if (kcal !== null) return { calories: { source: 'estimated', method: 'heart_rate', kcal }, heartRateNotUsed };
    heartRateNotUsed = true;
  }

  return {
    calories: {
      source: 'estimated',
      method: 'session_type',
      kcal: caloriesFromSessionType(session.sessionType, player.weightKg, durationMinutes),
    },
    heartRateNotUsed,
  };
}
