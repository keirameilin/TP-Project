import { addDays } from '../../lib/dates';
import type { PlannedSessionRepository } from '../planning';
import type { PlayerProfile } from '../profile/types';
import type { PlayerProfileRepository } from '../profile';
import type { TrainingSessionRepository } from '../training';
import type { SessionType } from '../training/types';
import type { BodyWeightRepository } from '../bodyweight';
import { resolveBaselineTargets, type BaselineTargets, type TargetRequirement } from './baseline';
import { weightForDate } from './loadTargets';
import { ADJUSTMENT_RULES, TARGET_RULES, type SourceType } from './rules';

/** The session on a date — what was logged, or else what is planned — or null if neither. */
export type SessionTypeOn = (date: string) => SessionType | null;

export type DayRuleName =
  | 'congested'
  | 'matchDay'
  | 'dayBeforeMatch'
  | 'dayAfterMatch'
  | 'conditioningOrGym'
  | 'technical'
  | 'rest'
  | 'baseline';

/** The one rule that sets a day's carbohydrate. */
export interface DayRule {
  name: DayRuleName;
  /** Carbohydrate target in g per kg of body weight; null leaves the baseline's carbs as they are. */
  carbsGPerKg: number | null;
  /** The published range the target sits in, when the rule has one. */
  carbRange: { min: number; max: number } | null;
  /** True when protein goes to the upper end of its range (the day after a match). */
  proteinAtUpperEnd: boolean;
  sourceType: SourceType;
  /** Completes "Tomorrow is …" and "the guideline for …". */
  dayLabel: string;
}

const A = ADJUSTMENT_RULES;

const ranged = (
  name: DayRuleName,
  rule: { value: { min: number; max: number; target: number }; sourceType: SourceType },
  dayLabel: string,
  proteinAtUpperEnd = false,
): DayRule => ({
  name,
  carbsGPerKg: rule.value.target,
  carbRange: { min: rule.value.min, max: rule.value.max },
  proteinAtUpperEnd,
  sourceType: rule.sourceType,
  dayLabel,
});

const flat = (name: DayRuleName, rule: { value: number; sourceType: SourceType }, dayLabel: string): DayRule => ({
  name,
  carbsGPerKg: rule.value,
  carbRange: null,
  proteinAtUpperEnd: false,
  sourceType: rule.sourceType,
  dayLabel,
});

const BASELINE_RULE: DayRule = {
  name: 'baseline',
  carbsGPerKg: null,
  carbRange: null,
  proteinAtUpperEnd: false,
  sourceType: TARGET_RULES.carbohydrate.sourceType,
  dayLabel: 'a day with nothing planned',
};

/** True when `date` falls inside some window of the configured length that holds enough matches. */
export function isCongested(date: string, typeOn: SessionTypeOn): boolean {
  const { minMatches, windowDays } = A.congestedMatches.value;
  for (let start = -(windowDays - 1); start <= 0; start++) {
    let matches = 0;
    for (let i = 0; i < windowDays; i++) {
      if (typeOn(addDays(date, start + i)) === 'match') matches++;
    }
    if (matches >= minMatches) return true;
  }
  return false;
}

/**
 * The rule for a day. Every rule that applies is collected and the one with the most carbohydrate
 * wins; rules never stack. A day with no session and no match either side keeps the baseline.
 */
export function dayRuleFor(date: string, typeOn: SessionTypeOn): DayRule {
  const today = typeOn(date);
  const candidates: DayRule[] = [];

  if (isCongested(date, typeOn)) {
    const { minMatches, windowDays } = A.congestedMatches.value;
    candidates.push(flat('congested', A.congestedCarbsGPerKg, `part of a run of ${minMatches} or more matches in ${windowDays} days`));
  }
  if (today === 'match') candidates.push(ranged('matchDay', A.matchDayCarbsGPerKg, 'a match day'));
  if (typeOn(addDays(date, 1)) === 'match') {
    candidates.push(ranged('dayBeforeMatch', A.dayBeforeMatchCarbsGPerKg, 'the day before a match'));
  }
  if (typeOn(addDays(date, -1)) === 'match') {
    candidates.push(ranged('dayAfterMatch', A.dayAfterMatchCarbsGPerKg, 'the day after a match', true));
  }
  if (today === 'hiit_conditioning' || today === 'gym_strength') {
    candidates.push(flat('conditioningOrGym', A.conditioningOrGymCarbsGPerKg, 'a conditioning or gym day'));
  }
  if (today === 'technical_tactical') candidates.push(flat('technical', A.technicalCarbsGPerKg, 'a technical day'));
  if (today === 'rest_day') candidates.push(flat('rest', A.restCarbsGPerKg, 'a rest day'));

  // Earlier candidates win ties, so a match today is named ahead of a match tomorrow.
  return candidates.reduce<DayRule>(
    (best, rule) => (best.carbsGPerKg === null || rule.carbsGPerKg! > best.carbsGPerKg ? rule : best),
    BASELINE_RULE,
  );
}

/** A day's targets after the day's rule: same shape as the baseline, so the Food tab can show either. */
export interface DayTargets extends BaselineTargets {
  rule: DayRule;
  carbsGPerKg: number;
  /** What the targets would be with no adjustment. */
  baseline: BaselineTargets;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Applies a day's rule to the baseline: carbohydrate from the rule's g/kg, protein and fat as in
 * the baseline (protein at the upper end the day after a match), calories recomputed from the three.
 */
export function adjustTargets(baseline: BaselineTargets, rule: DayRule): DayTargets {
  const kcal = TARGET_RULES.kcalPerGram.value;
  const isJunior = baseline.proteinGPerKg === TARGET_RULES.juniorProteinGPerKg.value;

  const proteinGPerKg =
    rule.proteinAtUpperEnd && !isJunior ? A.dayAfterMatchProteinGPerKg.value : baseline.proteinGPerKg;
  const proteinG = Math.round(proteinGPerKg * baseline.weightKg);
  const carbsG = rule.carbsGPerKg === null ? baseline.carbsG : Math.round(rule.carbsGPerKg * baseline.weightKg);
  const fatG = baseline.fatG;

  return {
    ...baseline,
    calories:
      rule.carbsGPerKg === null && proteinG === baseline.proteinG
        ? baseline.calories
        : proteinG * kcal.protein + carbsG * kcal.carbs + fatG * kcal.fat,
    proteinG,
    proteinGPerKg,
    carbsG,
    fatG,
    rule,
    carbsGPerKg: round1(carbsG / baseline.weightKg),
    baseline,
  };
}

export type DayTargetsResult =
  | { ok: true; targets: DayTargets }
  /** What the player still has to provide before targets can be calculated. */
  | { ok: false; missing: TargetRequirement[] };

/** A day's adjusted targets from the profile, a body weight and the sessions around the day. */
export function resolveDayTargets(
  profile: PlayerProfile | null,
  weightKg: number | null,
  date: string,
  typeOn: SessionTypeOn,
): DayTargetsResult {
  const baseline = resolveBaselineTargets(profile, weightKg);
  if (!baseline.ok) return baseline;
  return { ok: true, targets: adjustTargets(baseline.targets, dayRuleFor(date, typeOn)) };
}

/** Builds the lookup the rules use: a logged session wins over a plan for the same date. */
export function sessionTypeLookup(
  logged: readonly { date: string; sessionType: SessionType }[],
  planned: readonly { date: string; sessionType: SessionType }[],
): SessionTypeOn {
  const byDate = new Map<string, SessionType>();
  for (const p of planned) byDate.set(p.date, p.sessionType);
  for (const s of logged) byDate.set(s.date, s.sessionType);
  return (date) => byDate.get(date) ?? null;
}

/** Days either side of a date that can change its rule: the congested window reaches this far. */
const REACH_DAYS = A.congestedMatches.value.windowDays - 1;

/** A day's adjusted targets, loaded from the saved profile, weigh-ins, logged sessions and plans. */
export async function loadDayTargets(
  repos: {
    profile: PlayerProfileRepository;
    weight: BodyWeightRepository;
    training: TrainingSessionRepository;
    planned: PlannedSessionRepository;
  },
  date: string,
): Promise<DayTargetsResult> {
  const range = { from: addDays(date, -REACH_DAYS), to: addDays(date, REACH_DAYS) };
  const [profile, weightKg, logged, planned] = await Promise.all([
    repos.profile.get(),
    weightForDate(repos.weight, date),
    repos.training.list(range),
    repos.planned.list(range),
  ]);
  return resolveDayTargets(profile, weightKg, date, sessionTypeLookup(logged, planned));
}

/**
 * One sentence saying why a day's targets are what they are. `day` opens the sentence, e.g.
 * 'Tomorrow' or 'This day'.
 * Fixed templates; the word "estimate" appears whenever the rule's number is our own.
 */
export function explainDayTargets(day: string, t: DayTargets): string {
  const { rule } = t;
  if (rule.carbsGPerKg === null) {
    return `Nothing is planned for ${day.toLowerCase()}, so these are your baseline targets.`;
  }
  const opening = `${day} is ${rule.dayLabel}: carbs are set to ${rule.carbsGPerKg} g/kg`;
  const basis = rule.carbRange
    ? `, inside the ${rule.carbRange.min}–${rule.carbRange.max} g/kg the UEFA nutrition statement gives for ${rule.dayLabel}`
    : ' (estimate)';
  const protein =
    t.proteinGPerKg !== t.baseline.proteinGPerKg
      ? ` Protein is raised to ${t.proteinGPerKg} g/kg, the upper end of its range (estimate).`
      : '';
  return `${opening}${basis}.${protein}`;
}

/**
 * The recovery guideline after a match, with the carbohydrate worked out for the player's weight
 * when it is known.
 */
export function describeMatchRecovery(weightKg: number | null): string {
  const carbs = A.recoveryCarbs.value;
  const protein = A.recoveryProtein.value;
  const perHour = weightKg ? ` (about ${Math.round(carbs.gPerKgPerHour * weightKg)} g an hour at your weight)` : '';
  return `After today's match: about ${carbs.gPerKgPerHour} g/kg of carbohydrate an hour for ${carbs.hours} hours${perHour}, plus ${protein.minG}–${protein.maxG} g of protein every ${protein.minHours}–${protein.maxHours} hours (UEFA nutrition statement).`;
}
