import { isValidDateString } from '../../lib/dates';
import { ValidationError, type ValidationIssue as BaseValidationIssue } from '../../lib/validation';
import { EFFORT_RULES } from '../targets/rules';
import { SESSION_TYPES, type SessionType } from './types';

export { isValidDateString, toLocalDateString } from '../../lib/dates';
export { ValidationError } from '../../lib/validation';

export const RPE_MIN = 1;
export const RPE_MAX = 10;
export const DURATION_MAX_MINUTES = 24 * 60;

export type ValidationIssue = BaseValidationIssue<
  'date' | 'sessionType' | 'durationMinutes' | 'rpe' | 'avgHeartRate' | 'peakHeartRate' | 'caloriesBurned' | 'notes'
>;

export class DuplicateDateError extends Error {
  constructor(public readonly date: string) {
    super(`A training session already exists for ${date}`);
    this.name = 'DuplicateDateError';
  }
}

/** A fully-resolved session (defaults applied) ready to be validated and stored. */
export interface SessionFields {
  date: string;
  sessionType: SessionType;
  durationMinutes: number | null;
  rpe: number | null;
  avgHeartRate: number | null;
  peakHeartRate: number | null;
  caloriesBurned: number | null;
  notes: string | null;
}

export function isSessionType(value: unknown): value is SessionType {
  return typeof value === 'string' && (SESSION_TYPES as readonly string[]).includes(value);
}

/** Returns all validation issues for a session; an empty array means it is valid. */
export function validateSession(s: SessionFields): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isRestDay = s.sessionType === 'rest_day';

  if (!isValidDateString(s.date)) {
    issues.push({ field: 'date', message: 'must be a valid date in YYYY-MM-DD format' });
  }

  if (!isSessionType(s.sessionType)) {
    issues.push({ field: 'sessionType', message: `must be one of: ${SESSION_TYPES.join(', ')}` });
  }

  if (s.durationMinutes == null) {
    if (!isRestDay) issues.push({ field: 'durationMinutes', message: 'is required unless rest_day' });
  } else if (
    !Number.isInteger(s.durationMinutes) ||
    s.durationMinutes <= 0 ||
    s.durationMinutes > DURATION_MAX_MINUTES
  ) {
    issues.push({
      field: 'durationMinutes',
      message: `must be a whole number between 1 and ${DURATION_MAX_MINUTES}`,
    });
  }

  if (s.rpe == null) {
    // Effort comes from the rating or from watch numbers; a session needs one of them.
    if (!isRestDay && s.avgHeartRate == null && s.caloriesBurned == null) {
      issues.push({ field: 'rpe', message: 'is required unless a heart rate or calories are given' });
    }
  } else if (!Number.isInteger(s.rpe) || s.rpe < RPE_MIN || s.rpe > RPE_MAX) {
    issues.push({ field: 'rpe', message: `must be a whole number from ${RPE_MIN} to ${RPE_MAX}` });
  }

  issues.push(...validateWatchNumbers(s));
  return issues;
}

/** The optional heart-rate and calorie numbers: each in range, and believable together. */
function validateWatchNumbers(s: SessionFields): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const hr = EFFORT_RULES.heartRateRangeBpm.value;
  const kcal = EFFORT_RULES.caloriesBurnedRangeKcal.value;

  if (s.sessionType === 'rest_day') {
    for (const field of ['avgHeartRate', 'peakHeartRate', 'caloriesBurned'] as const) {
      if (s[field] != null) issues.push({ field, message: 'must be empty on a rest day' });
    }
    return issues;
  }

  const heartRateOk = (field: 'avgHeartRate' | 'peakHeartRate') => {
    const bpm = s[field];
    if (bpm == null) return false;
    if (Number.isInteger(bpm) && bpm >= hr.min && bpm <= hr.max) return true;
    issues.push({ field, message: `must be a whole number between ${hr.min} and ${hr.max} bpm` });
    return false;
  };
  const avgOk = heartRateOk('avgHeartRate');
  const peakOk = heartRateOk('peakHeartRate');
  if (avgOk && peakOk && s.avgHeartRate! > s.peakHeartRate!) {
    issues.push({ field: 'avgHeartRate', message: "can't be higher than the session's max heart rate" });
  }

  if (s.caloriesBurned != null) {
    if (!Number.isFinite(s.caloriesBurned) || s.caloriesBurned < kcal.min || s.caloriesBurned > kcal.max) {
      issues.push({ field: 'caloriesBurned', message: `must be between ${kcal.min} and ${kcal.max} kcal` });
    } else if (
      s.durationMinutes != null &&
      s.durationMinutes > 0 &&
      s.caloriesBurned / s.durationMinutes > EFFORT_RULES.maxKcalPerMinute.value
    ) {
      issues.push({
        field: 'caloriesBurned',
        message: `of ${s.caloriesBurned} kcal in ${s.durationMinutes} minutes is over ${EFFORT_RULES.maxKcalPerMinute.value} kcal a minute, which isn't realistic. Check the calories and the duration.`,
      });
    }
  }
  return issues;
}

/** Throws a ValidationError if the session is invalid. */
export function assertValidSession(s: SessionFields): void {
  const issues = validateSession(s);
  if (issues.length > 0) throw new ValidationError(issues);
}
