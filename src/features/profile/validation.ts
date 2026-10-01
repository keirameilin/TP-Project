import { ValidationError, type ValidationIssue as BaseValidationIssue } from '../../lib/validation';

export const AGE_MIN = 10;
export const AGE_MAX = 100;
/** Sanity range for a measured max heart rate. */
export const MAX_HEART_RATE_MIN = 120;
export const MAX_HEART_RATE_MAX = 230;

export type ValidationIssue = BaseValidationIssue<'age' | 'maxHeartRate'>;

export interface PlayerProfileFields {
  age: number;
  maxHeartRate: number | null;
}

const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** Returns all validation issues for a profile; an empty array means it is valid. */
export function validateProfile(p: PlayerProfileFields): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isWhole(p.age) || p.age < AGE_MIN || p.age > AGE_MAX) {
    issues.push({ field: 'age', message: `must be a whole number from ${AGE_MIN} to ${AGE_MAX}` });
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
