import type { SessionType } from './types';

/** Display names and one-line descriptions for the session types, in the order they're offered. */
export const SESSION_OPTIONS: { type: SessionType; label: string; hint: string }[] = [
  { type: 'match', label: 'Match', hint: 'Competitive game' },
  { type: 'hiit_conditioning', label: 'Conditioning', hint: 'Sprints, fitness drills, high-intensity running' },
  { type: 'technical_tactical', label: 'Technical', hint: 'Passing, shooting, decision-making' },
  { type: 'gym_strength', label: 'Gym', hint: 'Gym conditioning' },
  { type: 'rest_day', label: 'Rest', hint: 'No training' },
];

export const SESSION_LABELS = Object.fromEntries(SESSION_OPTIONS.map((o) => [o.type, o.label])) as Record<
  SessionType,
  string
>;
