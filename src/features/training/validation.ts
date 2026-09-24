import { SESSION_TYPES, type SessionType } from './types';

export const RPE_MIN = 1;
export const RPE_MAX = 10;
export const DURATION_MAX_MINUTES = 24 * 60;

export interface ValidationIssue {
  field: 'date' | 'sessionType' | 'durationMinutes' | 'rpe' | 'notes';
  message: string;
}

export class ValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues.map((i) => `${i.field}: ${i.message}`).join('; '));
    this.name = 'ValidationError';
  }
}

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

/** Formats a Date as a local-time YYYY-MM-DD string (not UTC, so "today" matches the user's day). */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
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
