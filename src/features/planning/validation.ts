import { isValidDateString } from '../../lib/dates';
import { ValidationError, type ValidationIssue as BaseValidationIssue } from '../../lib/validation';
import { SESSION_TYPES, type SessionType } from '../training/types';
import { DURATION_MAX_MINUTES, isSessionType } from '../training/validation';

export type ValidationIssue = BaseValidationIssue<'date' | 'sessionType' | 'expectedDurationMinutes' | 'notes'>;

export class DuplicatePlannedDateError extends Error {
  constructor(public readonly date: string) {
    super(`A session is already planned for ${date}`);
    this.name = 'DuplicatePlannedDateError';
  }
}

/** A fully-resolved planned session (defaults applied) ready to be validated and stored. */
export interface PlannedSessionFields {
  date: string;
  sessionType: SessionType;
  expectedDurationMinutes: number | null;
  notes: string | null;
}

export interface PlannedSessionValidationOptions {
  /**
   * The earliest date a plan may be set for, normally today. Pass null to skip the check, which is
   * how an existing plan whose date has passed can still be edited without moving it.
   */
  earliestDate: string | null;
}

/** Returns all validation issues for a planned session; an empty array means it is valid. */
export function validatePlannedSession(
  s: PlannedSessionFields,
  { earliestDate }: PlannedSessionValidationOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isValidDateString(s.date)) {
    issues.push({ field: 'date', message: 'must be a valid date in YYYY-MM-DD format' });
  } else if (earliestDate !== null && s.date < earliestDate) {
    // YYYY-MM-DD strings sort in calendar order.
    issues.push({ field: 'date', message: 'must be today or a future date' });
  }

  if (!isSessionType(s.sessionType)) {
    issues.push({ field: 'sessionType', message: `must be one of: ${SESSION_TYPES.join(', ')}` });
  }

  if (
    s.expectedDurationMinutes !== null &&
    (!Number.isInteger(s.expectedDurationMinutes) ||
      s.expectedDurationMinutes <= 0 ||
      s.expectedDurationMinutes > DURATION_MAX_MINUTES)
  ) {
    issues.push({
      field: 'expectedDurationMinutes',
      message: `must be a whole number between 1 and ${DURATION_MAX_MINUTES}`,
    });
  }

  return issues;
}

/** Throws a ValidationError if the planned session is invalid. */
export function assertValidPlannedSession(s: PlannedSessionFields, options: PlannedSessionValidationOptions): void {
  const issues = validatePlannedSession(s, options);
  if (issues.length > 0) throw new ValidationError(issues);
}

/** Throws a ValidationError unless `date` is a real YYYY-MM-DD date. */
export function assertValidDate(date: string, field = 'date'): void {
  if (!isValidDateString(date)) {
    throw new ValidationError([{ field, message: 'must be a valid date in YYYY-MM-DD format' }]);
  }
}
