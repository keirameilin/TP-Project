import type { LogDayStatus, Macros } from '../nutrition/types';
import type { DayTargets } from '../targets/adjust';
import { REVIEW_RULES } from '../targets/rules';

const R = REVIEW_RULES;

/** One day's food set against that day's targets. */
export interface DayNutrition {
  /** What was logged; null when nothing was. */
  eaten: Macros | null;
  /** The player's Complete/Incomplete mark from the Food tab; null when unmarked. */
  status: LogDayStatus | null;
  /** Null when the profile or a body weight is missing, so there is nothing to compare with. */
  targets: DayTargets | null;
}

/** A past rated session and how the day before it compared with that day's carb target. */
export interface PatternSession {
  date: string;
  /** Session quality, 1–10. */
  quality: number;
  /** Carbs eaten the day before ÷ that day's carb target. Only days marked Complete are passed in. */
  carbFraction: number;
}

export interface ReviewInput {
  /** How the session went, 1–10. */
  quality: number;
  /** Hours slept the night before; null when not entered. */
  sleepHours: number | null;
  today: DayNutrition;
  yesterday: DayNutrition;
  /** Every rated session whose day before has food marked Complete and a carb target. */
  history: PatternSession[];
}

export type Outcome = 'good' | 'bad' | 'neutral';

export interface Finding {
  kind: 'shortfall' | 'lined_up' | 'sleep' | 'pattern';
  text: string;
}

export interface DayReview {
  outcome: Outcome;
  /** At most REVIEW_RULES.maxFindings, most relevant first. */
  findings: Finding[];
  /** Shown when there are no findings. */
  nothingStandsOut: string | null;
  /** Why part of the review couldn't be done (food not marked Complete, no targets). */
  cannotAssess: string[];
  /** "Not enough data yet" and exactly what is missing; empty when the pattern could be worked out. */
  patternMissing: string[];
}

export const NOTHING_STANDS_OUT = 'Nothing in your logged data explains this session.';

/** Good, bad, or neither, from the player's own session rating. */
export function outcomeFor(quality: number): Outcome {
  if (quality >= R.goodSessionMin.value) return 'good';
  if (quality <= R.badSessionMax.value) return 'bad';
  return 'neutral';
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const whole = (n: number) => Math.round(n).toLocaleString();
const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Comparison {
  /** How far under target, as a fraction of the target (negative when over). */
  shortfall: number;
  shortText: string;
  metText: string;
}

/** Carbs, protein and calories for one day against its targets, each with both its sentences. */
function compareDay(day: 'Yesterday' | 'Today', eaten: Macros, t: DayTargets): Comparison[] {
  const carbsGPerKg = round1(eaten.carbsG / t.weightKg);
  const { rule } = t;

  let carbShort: string;
  let carbMet: string;
  if (rule.carbsGPerKg === null) {
    carbShort = `${day} you ate ${whole(eaten.carbsG)} g of carbs, ${percent(1 - eaten.carbsG / t.carbsG)} under your ${whole(t.carbsG)} g baseline target.`;
    carbMet = `${day} you ate ${whole(eaten.carbsG)} g of carbs, in line with your ${whole(t.carbsG)} g baseline target.`;
  } else if (rule.carbRange) {
    const range = `${rule.carbRange.min}–${rule.carbRange.max} g/kg`;
    carbShort = `${day} you ate ${carbsGPerKg} g/kg of carbs. The soccer guideline for ${rule.dayLabel} is ${range}.`;
    carbMet = `${day} you ate ${carbsGPerKg} g/kg of carbs, in line with the ${range} soccer guideline for ${rule.dayLabel}.`;
  } else {
    carbShort = `${day} you ate ${carbsGPerKg} g/kg of carbs. This app's target for ${rule.dayLabel} is ${rule.carbsGPerKg} g/kg (estimate).`;
    carbMet = `${day} you ate ${carbsGPerKg} g/kg of carbs, in line with this app's ${rule.carbsGPerKg} g/kg target for ${rule.dayLabel} (estimate).`;
  }

  const simple = (name: string, unit: string, ate: number, target: number, spaced = true): Comparison => {
    const amount = (n: number) => `${whole(n)}${spaced ? ' ' : ''}${unit}`;
    const of = name ? ` of ${name}` : '';
    return {
      shortfall: 1 - ate / target,
      shortText: `${day} you ate ${amount(ate)}${of}, ${percent(1 - ate / target)} under your ${amount(target)} target.`,
      metText: `${day} you ate ${amount(ate)}${of}, in line with your ${amount(target)} target.`,
    };
  };

  return [
    { shortfall: 1 - eaten.carbsG / t.carbsG, shortText: carbShort, metText: carbMet },
    simple('protein', 'g', eaten.proteinG, t.proteinG),
    simple('', 'kcal', eaten.calories, t.calories),
  ];
}

const ZERO: Macros = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/** Why a day's food can't be used, or null when it can. A Complete day with no entries counts as zero. */
function unusable(day: 'Today' | 'Yesterday', n: DayNutrition): string | null {
  const possessive = `${day}'s`;
  if (n.status === 'incomplete') return `${possessive} food is marked Incomplete`;
  if (n.status === null) return n.eaten ? `${possessive} food isn't marked Complete` : `${possessive} food isn't logged`;
  return null;
}

export interface PatternResult {
  /** The finding, when there is enough data. */
  text: string | null;
  missing: string[];
}

/**
 * The player's own pattern: session ratings after days at or above the high carb fraction against
 * ratings after days below the low one. Needs enough sessions overall and in each group.
 */
export function carbPattern(history: PatternSession[]): PatternResult {
  const { highFraction, lowFraction, minSessions, minPerGroup } = R.carbPattern.value;
  const high = history.filter((s) => s.carbFraction >= highFraction);
  const low = history.filter((s) => s.carbFraction < lowFraction);

  const missing: string[] = [];
  if (history.length < minSessions) {
    missing.push(
      `At least ${minSessions} rated sessions that follow a day with food marked Complete (you have ${history.length}).`,
    );
  }
  if (high.length < minPerGroup) {
    missing.push(
      `At least ${minPerGroup} of them after a day with ${percent(highFraction)} or more of your carb target (you have ${high.length}).`,
    );
  }
  if (low.length < minPerGroup) {
    missing.push(
      `At least ${minPerGroup} of them after a day under ${percent(lowFraction)} of your carb target (you have ${low.length}).`,
    );
  }
  if (missing.length > 0) return { text: null, missing };

  const average = (group: PatternSession[]) => round1(group.reduce((sum, s) => sum + s.quality, 0) / group.length);
  return {
    text: `Pattern in your logs: your ${plural(high.length, 'session', 'sessions')} after days with at least ${percent(highFraction)} of your carb target averaged ${average(high)} for how they went. Your ${low.length} after days under ${percent(lowFraction)} averaged ${average(low)}.`,
    missing: [],
  };
}

/**
 * Builds the review from the player's logged numbers alone. Every sentence is a fixed template;
 * nothing here claims that one thing caused another.
 */
export function buildDayReview(input: ReviewInput): DayReview {
  const outcome = outcomeFor(input.quality);
  const cannotAssess: string[] = [];
  const nutrition: Comparison[] = [];

  const todayProblem = unusable('Today', input.today);
  if (todayProblem) {
    cannotAssess.push(`${todayProblem}, so the nutrition side can't be assessed. Log it and mark the day Complete on the Food tab.`);
  } else if (!input.today.targets) {
    cannotAssess.push("Your food can't be compared with targets until your profile and weight are set on the Player tab.");
  } else {
    const yesterdayProblem = unusable('Yesterday', input.yesterday);
    if (yesterdayProblem) {
      cannotAssess.push(`${yesterdayProblem}, so only today's food was checked.`);
    } else if (input.yesterday.targets) {
      nutrition.push(...compareDay('Yesterday', input.yesterday.eaten ?? ZERO, input.yesterday.targets));
    }
    nutrition.push(...compareDay('Today', input.today.eaten ?? ZERO, input.today.targets));
  }

  const pattern = carbPattern(input.history);
  const patternFinding: Finding[] = pattern.text ? [{ kind: 'pattern', text: pattern.text }] : [];

  let ordered: Finding[];
  if (outcome === 'good') {
    // A session that went well: what lined up with the targets, not what fell short.
    const linedUp: Finding[] = nutrition
      .filter((c) => 1 - c.shortfall >= R.metTargetFraction.value)
      .map((c) => ({ kind: 'lined_up', text: c.metText }));
    ordered = [...linedUp.slice(0, 1), ...patternFinding, ...linedUp.slice(1)];
  } else {
    const shortfalls: Finding[] = nutrition
      .filter((c) => c.shortfall > R.shortfallFraction.value)
      .sort((a, b) => b.shortfall - a.shortfall)
      .map((c) => ({ kind: 'shortfall', text: c.shortText }));
    const sleep: Finding[] =
      input.sleepHours !== null && input.sleepHours < R.lowSleepHours.value
        ? [
            {
              kind: 'sleep',
              text: `You logged ${plural(input.sleepHours, 'hour', 'hours')} of sleep last night, under ${R.lowSleepHours.value} hours (estimate). That may be another factor.`,
            },
          ]
        : [];
    // The biggest shortfall first, then sleep and the pattern so food alone can't crowd them out.
    ordered = [...shortfalls.slice(0, 1), ...sleep, ...patternFinding, ...shortfalls.slice(1)];
  }
  const findings = ordered.slice(0, R.maxFindings.value);

  return {
    outcome,
    findings,
    nothingStandsOut: findings.length === 0 ? NOTHING_STANDS_OUT : null,
    cannotAssess,
    patternMissing: pattern.missing,
  };
}
