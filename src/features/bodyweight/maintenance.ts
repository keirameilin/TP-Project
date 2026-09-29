import { addDays, daysBetween, toLocalDateString } from '../../lib/dates';
import type { DailyCalories, LogDayStatus } from '../nutrition/types';
import type { FoodLogDayRepository } from '../nutrition/logDayRepository';
import type { FoodEntryRepository } from '../nutrition/repository';
import type { BodyWeightRepository } from './repository';

/**
 * Approximate energy content of 1 kg of body-mass change (mixed fat and lean tissue).
 * It's a population average, so treat the result as an estimate, not a measurement.
 */
export const KCAL_PER_KG = 7700;

export const DEFAULT_WINDOW_DAYS = 28;
/** Minimum data before an estimate is meaningful; below this, water-weight noise dominates. */
export const MIN_WEIGH_INS = 3;
export const MIN_WEIGH_IN_SPAN_DAYS = 7;
export const MIN_LOGGED_INTAKE_DAYS = 7;

/**
 * An unmarked day below this fraction of the median logged day is probably missing
 * a meal. It's left out of the estimate and returned for the user to confirm.
 */
export const SUSPECT_INTAKE_FRACTION = 0.6;
/** Fewer reference days than this and the median is too unreliable to flag anything. */
export const MIN_DAYS_FOR_SUSPECT_CHECK = 5;

export interface DayStatus {
  date: string;
  status: LogDayStatus;
}

export interface IntakeDayClassification {
  /** Days that feed the average: marked complete, or unmarked and not suspiciously low. */
  included: DailyCalories[];
  /** Unmarked days that look incomplete; excluded until the user marks them complete. */
  suspect: DailyCalories[];
  /** Days the user marked incomplete; always excluded. */
  markedIncomplete: DailyCalories[];
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Decides which days' intake to trust. The user's own mark always wins: `complete`
 * days count even when low (sick day, fasting — with no entries they count as 0 kcal),
 * `incomplete` days never count. Unmarked days count unless they fall well below the
 * median, which usually means a forgotten meal.
 */
export function classifyIntakeDays(
  dailyIntake: DailyCalories[],
  dayStatuses: DayStatus[] = [],
): IntakeDayClassification {
  const statusByDate = new Map(dayStatuses.map((d) => [d.date, d.status]));
  const logged = new Set(dailyIntake.map((d) => d.date));
  const days = [
    ...dailyIntake,
    ...dayStatuses
      .filter((d) => d.status === 'complete' && !logged.has(d.date))
      .map((d) => ({ date: d.date, calories: 0 })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const markedIncomplete = days.filter((d) => statusByDate.get(d.date) === 'incomplete');
  const candidates = days.filter((d) => statusByDate.get(d.date) !== 'incomplete');

  const threshold =
    candidates.length >= MIN_DAYS_FOR_SUSPECT_CHECK
      ? median(candidates.map((d) => d.calories)) * SUSPECT_INTAKE_FRACTION
      : -Infinity;
  const isSuspect = (d: DailyCalories) =>
    !statusByDate.has(d.date) && d.calories < threshold;

  return {
    included: candidates.filter((d) => !isSuspect(d)),
    suspect: candidates.filter(isSuspect),
    markedIncomplete,
  };
}

export interface MaintenanceInput {
  /** Inclusive analysis window, YYYY-MM-DD. */
  from: string;
  to: string;
  weighIns: { date: string; weightKg: number }[];
  /** Calories per logged day. Days missing from this list are treated as unlogged, not as zero. */
  dailyIntake: DailyCalories[];
  /** User's complete/incomplete marks; unmarked days are simply absent. */
  dayStatuses?: DayStatus[];
}

/** How the window's logged days were treated, so the UI can explain and prompt. */
interface IntakeCoverage {
  /** Days whose intake fed the average. */
  loggedIntakeDays: number;
  /** Unmarked, unusually low days left out of the estimate — ask the user to confirm them. */
  suspectDays: DailyCalories[];
  /** Days the user marked incomplete, left out of the estimate. */
  incompleteDays: number;
}

export type InsufficientDataReason = 'too_few_weigh_ins' | 'weigh_in_span_too_short' | 'too_few_logged_days';

export interface MaintenanceEstimate extends IntakeCoverage {
  status: 'ok';
  from: string;
  to: string;
  /** Mean calories over the included days (see classifyIntakeDays). */
  avgIntakeKcal: number;
  windowDays: number;
  weighInCount: number;
  /** Slope of the least-squares weight trend; negative means losing. */
  trendKgPerWeek: number;
  /** Intake at which the trend would be flat: avg intake minus the energy stored/released per day. */
  maintenanceKcal: number;
  /** avgIntake − maintenance: positive is a surplus, negative a deficit. */
  balanceKcal: number;
}

export interface InsufficientData extends IntakeCoverage {
  status: 'insufficient_data';
  reasons: InsufficientDataReason[];
  weighInCount: number;
}

export type MaintenanceResult = MaintenanceEstimate | InsufficientData;

/**
 * Least-squares slope of weight vs. day. Uses every weigh-in rather than just the
 * first and last, so a single bloated or dehydrated morning doesn't skew the result.
 */
function slopeKgPerDay(points: { x: number; y: number }[]): number {
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  return num / den;
}

/**
 * Estimates actual maintenance calories from logged intake and the body-weight trend
 * ("adaptive TDEE"): if you ate X kcal/day on average and gained Y kg/day, maintenance
 * is X − Y × KCAL_PER_KG.
 *
 * Consistent under-logging mostly cancels out (maintenance is then measured in "logged
 * calories", the same currency the user budgets in). Occasional gaps don't, so days
 * marked incomplete or that look incomplete are left out — see classifyIntakeDays.
 */
export function estimateMaintenance(input: MaintenanceInput): MaintenanceResult {
  const inWindow = (date: string) => date >= input.from && date <= input.to;
  const weighIns = input.weighIns.filter((w) => inWindow(w.date));
  const { included: intake, suspect, markedIncomplete } = classifyIntakeDays(
    input.dailyIntake.filter((d) => inWindow(d.date)),
    input.dayStatuses?.filter((d) => inWindow(d.date)),
  );
  const coverage: IntakeCoverage = {
    loggedIntakeDays: intake.length,
    suspectDays: suspect,
    incompleteDays: markedIncomplete.length,
  };

  const dates = weighIns.map((w) => w.date).sort();
  const span = dates.length > 0 ? daysBetween(dates[0], dates[dates.length - 1]) : 0;

  const reasons: InsufficientDataReason[] = [];
  if (weighIns.length < MIN_WEIGH_INS) reasons.push('too_few_weigh_ins');
  if (span < MIN_WEIGH_IN_SPAN_DAYS) reasons.push('weigh_in_span_too_short');
  if (intake.length < MIN_LOGGED_INTAKE_DAYS) reasons.push('too_few_logged_days');
  if (reasons.length > 0) {
    return {
      status: 'insufficient_data',
      reasons,
      weighInCount: weighIns.length,
      ...coverage,
    };
  }

  const slope = slopeKgPerDay(
    weighIns.map((w) => ({ x: daysBetween(input.from, w.date), y: w.weightKg })),
  );
  const avgIntake = intake.reduce((s, d) => s + d.calories, 0) / intake.length;
  const maintenance = avgIntake - slope * KCAL_PER_KG;

  return {
    status: 'ok',
    from: input.from,
    to: input.to,
    avgIntakeKcal: Math.round(avgIntake),
    ...coverage,
    windowDays: daysBetween(input.from, input.to) + 1,
    weighInCount: weighIns.length,
    trendKgPerWeek: Math.round(slope * 7 * 100) / 100,
    maintenanceKcal: Math.round(maintenance),
    balanceKcal: Math.round(avgIntake - maintenance),
  };
}

/** Loads the last `windowDays` (ending `to`, default today) from both logs and estimates maintenance. */
export async function getMaintenanceEstimate(
  repos: { bodyWeight: BodyWeightRepository; food: FoodEntryRepository; logDays: FoodLogDayRepository },
  options: { to?: string; windowDays?: number; now?: () => Date } = {},
): Promise<MaintenanceResult> {
  const to = options.to ?? toLocalDateString((options.now ?? (() => new Date()))());
  const from = addDays(to, -((options.windowDays ?? DEFAULT_WINDOW_DAYS) - 1));

  const [weighIns, dailyIntake, dayStatuses] = await Promise.all([
    repos.bodyWeight.list({ from, to }),
    repos.food.getDailyCalories({ from, to }),
    repos.logDays.list({ from, to }),
  ]);
  return estimateMaintenance({ from, to, weighIns, dailyIntake, dayStatuses });
}
