import { ValidationError, type ValidationIssue as BaseValidationIssue } from '../../lib/validation';
import { PLAYER_LEVELS, SEXES, type PlayerLevel, type Sex } from './types';

export const AGE_MIN = 10;
export const AGE_MAX = 100;
/** Sanity range — catches typos and unit mix-ups (e.g. 5.9 feet typed as cm). */
export const HEIGHT_CM_MIN = 100;
export const HEIGHT_CM_MAX = 250;
/** Sanity range for a measured max heart rate. */
export const MAX_HEART_RATE_MIN = 120;
export const MAX_HEART_RATE_MAX = 230;

export type ValidationIssue = BaseValidationIssue<'age' | 'sex' | 'heightCm' | 'level' | 'maxHeartRate'>;

export interface PlayerProfileFields {
  age: number;
  sex: Sex | null;
  heightCm: number | null;
  level: PlayerLevel | null;
  maxHeartRate: number | null;
}

const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** Returns all validation issues for a profile; an empty array means it is valid. */
export function validateProfile(p: PlayerProfileFields): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isWhole(p.age) || p.age < AGE_MIN || p.age > AGE_MAX) {
    issues.push({ field: 'age', message: `must be a whole number from ${AGE_MIN} to ${AGE_MAX}` });
  }

  if (p.sex !== null && !(SEXES as readonly string[]).includes(p.sex)) {
    issues.push({ field: 'sex', message: `must be one of: ${SEXES.join(', ')}` });
  }

  if (
    p.heightCm !== null &&
    (typeof p.heightCm !== 'number' ||
      !Number.isFinite(p.heightCm) ||
      p.heightCm < HEIGHT_CM_MIN ||
      p.heightCm > HEIGHT_CM_MAX)
  ) {
    issues.push({ field: 'heightCm', message: `must be a number from ${HEIGHT_CM_MIN} to ${HEIGHT_CM_MAX}` });
  }

  if (p.level !== null && !(PLAYER_LEVELS as readonly string[]).includes(p.level)) {
    issues.push({ field: 'level', message: `must be one of: ${PLAYER_LEVELS.join(', ')}` });
  }

  if (
    p.maxHeartRate !== null &&
    (!isWhole(p.maxHeartRate) || p.maxHeartRate < MAX_HEART_RATE_MIN || p.maxHeartRate > MAX_HEART_RATE_MAX)
  ) {
    issues.push({
      field: 'maxHeartRate',
      message: `must be a whole number from ${MAX_HEART_RATE_MIN} to ${MAX_HEART_RATE_MAX}`,
    });
  }

  return issues;
}

/** Throws a ValidationError if the profile is invalid. */
export function assertValidProfile(p: PlayerProfileFields): void {
  const issues = validateProfile(p);
  if (issues.length > 0) throw new ValidationError(issues);
}
