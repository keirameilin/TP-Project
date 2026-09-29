import { isValidDateString } from '../../lib/dates';
import { ValidationError, type ValidationIssue as BaseValidationIssue } from '../../lib/validation';

/** Sanity range — catches typos and unit mix-ups (e.g. 1650 instead of 165.0). */
export const WEIGHT_KG_MIN = 20;
export const WEIGHT_KG_MAX = 400;

export type ValidationIssue = BaseValidationIssue<'date' | 'weightKg'>;

/** A fully-resolved weigh-in (defaults applied) ready to be validated and stored. */
export interface BodyWeightFields {
  date: string;
  weightKg: number;
}

/** Returns all validation issues for a weigh-in; an empty array means it is valid. */
export function validateBodyWeight(e: BodyWeightFields): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isValidDateString(e.date)) {
    issues.push({ field: 'date', message: 'must be a valid date in YYYY-MM-DD format' });
  }

  if (
    typeof e.weightKg !== 'number' ||
    !Number.isFinite(e.weightKg) ||
    e.weightKg < WEIGHT_KG_MIN ||
    e.weightKg > WEIGHT_KG_MAX
  ) {
    issues.push({ field: 'weightKg', message: `must be a number from ${WEIGHT_KG_MIN} to ${WEIGHT_KG_MAX}` });
  }

  return issues;
}

/** Throws a ValidationError if the weigh-in is invalid. */
export function assertValidBodyWeight(e: BodyWeightFields): void {
  const issues = validateBodyWeight(e);
  if (issues.length > 0) throw new ValidationError(issues);
}
