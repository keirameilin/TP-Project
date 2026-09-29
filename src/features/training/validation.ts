import { isValidDateString } from '../../lib/dates';
import { ValidationError, type ValidationIssue as BaseValidationIssue } from '../../lib/validation';
import { SESSION_TYPES, type SessionType } from './types';

export { isValidDateString, toLocalDateString } from '../../lib/dates';
export { ValidationError } from '../../lib/validation';

export const RPE_MIN = 1;
export const RPE_MAX = 10;
export const DURATION_MAX_MINUTES = 24 * 60;

export type ValidationIssue = BaseValidationIssue<
  'date' | 'sessionType' | 'durationMinutes' | 'rpe' | 'notes'
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
    if (!isRestDay) issues.push({ field: 'rpe', message: 'is required unless rest_day' });
  } else if (!Number.isInteger(s.rpe) || s.rpe < RPE_MIN || s.rpe > RPE_MAX) {
    issues.push({ field: 'rpe', message: `must be a whole number from ${RPE_MIN} to ${RPE_MAX}` });
  }

  return issues;
}

/** Throws a ValidationError if the session is invalid. */
export function assertValidSession(s: SessionFields): void {
  const issues = validateSession(s);
  if (issues.length > 0) throw new ValidationError(issues);
}
