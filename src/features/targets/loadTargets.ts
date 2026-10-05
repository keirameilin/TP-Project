import type { BodyWeightRepository } from '../bodyweight';
import type { PlayerProfileRepository } from '../profile';
import { resolveBaselineTargets, type TargetsResult } from './baseline';

/**
 * The weigh-in to base a day's targets on: the latest one on or before that date, or, if the
 * player only started weighing in later, the first one after it.
 */
export async function weightForDate(weights: BodyWeightRepository, date: string): Promise<number | null> {
  const [latestBefore] = await weights.list({ to: date });
  if (latestBefore) return latestBefore.weightKg;
  const after = await weights.list({ from: date }); // newest first
  return after.length > 0 ? after[after.length - 1].weightKg : null;
}

/** Baseline targets for a date from the saved profile and logged body weight. */
export async function loadBaselineTargets(
  repos: { profile: PlayerProfileRepository; weight: BodyWeightRepository },
  date: string,
): Promise<TargetsResult> {
  const [profile, weightKg] = await Promise.all([repos.profile.get(), weightForDate(repos.weight, date)]);
  return resolveBaselineTargets(profile, weightKg);
}
