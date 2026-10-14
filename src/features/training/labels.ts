import type { SessionType } from './types';

/** Display names and one-line descriptions for the session types, in the order they're offered. */
export const SESSION_OPTIONS: {
  type: SessionType;
  label: string;
  hint: string;
  /** Ionicons glyph name. */
  icon: 'football' | 'walk' | 'footsteps' | 'barbell' | 'moon';
}[] = [
  { type: 'match', label: 'Match', hint: 'Competitive game', icon: 'football' },
  {
    type: 'hiit_conditioning',
    label: 'Conditioning',
    hint: 'Sprints, fitness drills, high-intensity running',
    icon: 'walk',
  },
  { type: 'technical_tactical', label: 'Technical', hint: 'Passing, shooting, decision-making', icon: 'footsteps' },
  { type: 'gym_strength', label: 'Gym', hint: 'Gym conditioning', icon: 'barbell' },
  { type: 'rest_day', label: 'Rest', hint: 'No training', icon: 'moon' },
];

export const SESSION_LABELS = Object.fromEntries(SESSION_OPTIONS.map((o) => [o.type, o.label])) as Record<
  SessionType,
  string
>;

export const SESSION_ICONS = Object.fromEntries(SESSION_OPTIONS.map((o) => [o.type, o.icon])) as Record<
  SessionType,
  (typeof SESSION_OPTIONS)[number]['icon']
>;
