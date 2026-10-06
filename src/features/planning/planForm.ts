import type { ValidationIssue } from '../../lib/validation';
import { SESSION_LABELS } from '../training/labels';
import type { SessionType } from '../training/types';
import type { PlannedSession } from './types';
import { validatePlannedSession } from './validation';

/** Raw state of the plan editor. Duration stays a string so a half-typed number survives. */
export interface PlanForm {
  sessionType: SessionType | null;
  duration: string;
  notes: string;
}

export type PlanFormField = keyof PlanForm | 'form';
export type PlanFormErrors = Partial<Record<PlanFormField, string>>;

export interface PlanValues {
  sessionType: SessionType;
  expectedDurationMinutes: number | null;
  notes: string | null;
}

export const EMPTY_PLAN_FORM: PlanForm = { sessionType: null, duration: '', notes: '' };

/** Fills the editor from an existing plan, or returns an empty form for a day with none. */
export function planFormFromSession(session: PlannedSession | null): PlanForm {
  if (!session) return EMPTY_PLAN_FORM;
  return {
    sessionType: session.sessionType,
    duration: session.expectedDurationMinutes === null ? '' : String(session.expectedDurationMinutes),
    notes: session.notes ?? '',
  };
}

const DURATION_ERROR = 'Expected duration must be a whole number of minutes from 1 to 1440';
const PAST_DATE_ERROR = 'Plans can only be set for today or a later day.';

/** Converts data-layer validation issues into messages for the plan editor. */
export function planIssuesToErrors(issues: ValidationIssue[]): PlanFormErrors {
  const errors: PlanFormErrors = {};
  for (const issue of issues) {
    if (issue.field === 'sessionType') errors.sessionType ??= 'Pick a session type';
    else if (issue.field === 'expectedDurationMinutes') errors.duration ??= DURATION_ERROR;
    else if (issue.field === 'date') errors.form ??= PAST_DATE_ERROR;
    else errors.form ??= `${issue.field} ${issue.message}`;
  }
  return errors;
}

/**
 * Parses the editor and checks it with the data layer's validator. The date rule (today or later)
 * is left to the repository, which knows whether an existing plan is being edited in place.
 */
export function parsePlanForm(form: PlanForm): { values: PlanValues | null; errors: PlanFormErrors } {
  if (!form.sessionType) return { values: null, errors: { sessionType: 'Pick a session type' } };

  const durationText = form.duration.trim();
  const values: PlanValues = {
    sessionType: form.sessionType,
    // A rest day has no session to time.
    expectedDurationMinutes: form.sessionType === 'rest_day' || durationText === '' ? null : Number(durationText),
    notes: form.notes.trim() === '' ? null : form.notes.trim(),
  };
  const errors = planIssuesToErrors(
    validatePlannedSession({ date: '2000-01-01', ...values }, { earliestDate: null }),
  );
  return { values: Object.keys(errors).length > 0 ? null : values, errors };
}

/** A short one-line description of a plan, e.g. "Match · 90 min". */
export function describePlan(plan: Pick<PlannedSession, 'sessionType' | 'expectedDurationMinutes'>): string {
  const label = SESSION_LABELS[plan.sessionType];
  return plan.expectedDurationMinutes === null ? label : `${label} · ${plan.expectedDurationMinutes} min`;
}
