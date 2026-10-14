import { addDays } from '../../lib/dates';
import type { DailyLogRepos } from '../dailyLog/saveDay';
import { sessionCalories, sessionEffort, type CaloriesResult, type EffortResult, type PlayerInput } from '../intensity/effort';
import type { DailyMacros, LogDayStatus } from '../nutrition/types';
import type { PlannedSession } from '../planning';
import {
  describeMatchRecovery,
  explainDayTargets,
  resolveDayTargets,
  sessionTypeLookup,
  type DayTargets,
  type DayTargetsResult,
} from '../targets/adjust';
import type { TrainingSession } from '../training/types';
import { buildDayReview, type DayNutrition, type DayReview, type PatternSession } from './review';

export interface TomorrowTargets {
  date: string;
  planned: PlannedSession | null;
  targets: DayTargetsResult;
  /** One sentence on why the targets are what they are; null when they can't be calculated. */
  explanation: string | null;
  /** The post-match recovery guideline; only after a match today. */
  recovery: string | null;
}

export interface DayReviewData {
  date: string;
  /** The day's saved session; null when nothing is logged. */
  session: TrainingSession | null;
  /** Effort level with its source; null on a rest day. */
  effort: EffortResult | null;
  /** Calories burned with its source; null on a rest day. */
  calories: CaloriesResult | null;
  /** The day's food against the day's targets, for the nutrition card. */
  today: DayNutrition;
  /** Null on rest days and for sessions without a session rating: those get no review. */
  review: DayReview | null;
  tomorrow: TomorrowTargets;
}

/**
 * Everything the Day Review shows for a date, worked out from what the player has logged: the
 * session, both days' food against their targets, the personal carb pattern, and tomorrow's targets.
 */
export async function loadDayReview(repos: DailyLogRepos, date: string): Promise<DayReviewData> {
  const [profile, weighIns, sessions, plans, dailyMacros, logDays] = await Promise.all([
    repos.profile.get(),
    repos.weight.list(), // newest first
    repos.training.list(),
    repos.planned.list(),
    repos.food.getDailyMacros(),
    repos.logDays.list(),
  ]);

  const typeOn = sessionTypeLookup(sessions, plans);
  const macrosByDate = new Map<string, DailyMacros>(dailyMacros.map((m) => [m.date, m]));
  const statusByDate = new Map<string, LogDayStatus>(logDays.map((d) => [d.date, d.status]));

  /** The latest weigh-in on or before a date, else the first one after it (as the Food tab does). */
  const weightOn = (day: string): number | null => {
    const before = weighIns.find((w) => w.date <= day);
    if (before) return before.weightKg;
    return weighIns.length > 0 ? weighIns[weighIns.length - 1].weightKg : null;
  };
  const targetsOn = (day: string): DayTargetsResult => resolveDayTargets(profile, weightOn(day), day, typeOn);
  const okTargets = (day: string): DayTargets | null => {
    const result = targetsOn(day);
    return result.ok ? result.targets : null;
  };
  const nutritionOn = (day: string): DayNutrition => ({
    eaten: macrosByDate.get(day) ?? null,
    status: statusByDate.get(day) ?? null,
    targets: okTargets(day),
  });

  const session = sessions.find((s) => s.date === date) ?? null;
  const weightKg = weightOn(date);
  const isRated = session !== null && session.sessionType !== 'rest_day' && session.sessionQuality !== null;

  const history: PatternSession[] = [];
  for (const s of sessions) {
    if (s.date > date || s.sessionType === 'rest_day' || s.sessionQuality === null) continue;
    const dayBefore = addDays(s.date, -1);
    const targets = okTargets(dayBefore);
    if (statusByDate.get(dayBefore) !== 'complete' || !targets || targets.carbsG <= 0) continue;
    history.push({
      date: s.date,
      quality: s.sessionQuality,
      carbFraction: (macrosByDate.get(dayBefore)?.carbsG ?? 0) / targets.carbsG,
    });
  }

  const tomorrowDate = addDays(date, 1);
  const tomorrowTargets = targetsOn(tomorrowDate);
  const tomorrow: TomorrowTargets = {
    date: tomorrowDate,
    planned: plans.find((p) => p.date === tomorrowDate) ?? null,
    targets: tomorrowTargets,
    explanation: tomorrowTargets.ok ? explainDayTargets('Tomorrow', tomorrowTargets.targets) : null,
    recovery: session?.sessionType === 'match' ? describeMatchRecovery(weightKg) : null,
  };

  const player: PlayerInput = {
    age: profile?.age ?? null,
    sex: profile?.sex ?? null,
    maxHeartRate: profile?.maxHeartRate ?? null,
    weightKg,
  };
  const trained = session !== null && session.sessionType !== 'rest_day';

  return {
    date,
    session,
    effort: trained ? sessionEffort(session, player) : null,
    calories: trained ? sessionCalories(session, player) : null,
    today: nutritionOn(date),
    review: isRated
      ? buildDayReview({
          quality: session.sessionQuality!,
          sleepHours: session.sleepHours,
          today: nutritionOn(date),
          yesterday: nutritionOn(addDays(date, -1)),
          history,
        })
      : null,
    tomorrow,
  };
}
