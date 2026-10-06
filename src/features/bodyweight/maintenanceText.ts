import {
  MIN_LOGGED_INTAKE_DAYS,
  MIN_WEIGH_IN_SPAN_DAYS,
  MIN_WEIGH_INS,
  type MaintenanceResult,
} from './maintenance';
import { kgToLb } from './types';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A weekly trend below this (about a tenth of a pound) reads as "steady". */
const STEADY_LB_PER_WEEK = 0.1;

/**
 * Plain-language lines describing a maintenance estimate: what it's based on when there is one,
 * or exactly what data is still missing when there isn't.
 */
export function describeMaintenance(result: MaintenanceResult): string[] {
  const lines: string[] = [];

  if (result.status === 'ok') {
    const trendLb = kgToLb(result.trendKgPerWeek);
    const trend =
      Math.abs(trendLb) < STEADY_LB_PER_WEEK
        ? 'held steady'
        : `${trendLb > 0 ? 'rose' : 'fell'} about ${Math.abs(trendLb).toFixed(1)} lb a week`;
    lines.push(
      `Based on the last ${result.windowDays} days: ${plural(result.loggedIntakeDays, 'day', 'days')} of logged food and ${plural(result.weighInCount, 'weigh-in', 'weigh-ins')}.`,
      `You ate about ${result.avgIntakeKcal.toLocaleString()} kcal a day and your weight ${trend}.`,
    );
  } else {
    lines.push('Not enough data yet. Over the last 28 days this needs:');
    if (result.reasons.includes('too_few_weigh_ins')) {
      lines.push(`• At least ${MIN_WEIGH_INS} weigh-ins (you have ${result.weighInCount}).`);
    }
    if (result.reasons.includes('weigh_in_span_too_short')) {
      lines.push(`• Weigh-ins at least ${MIN_WEIGH_IN_SPAN_DAYS} days apart.`);
    }
    if (result.reasons.includes('too_few_logged_days')) {
      lines.push(`• At least ${MIN_LOGGED_INTAKE_DAYS} days of logged food (you have ${result.loggedIntakeDays}).`);
    }
  }

  if (result.suspectDays.length > 0) {
    lines.push(
      `${plural(result.suspectDays.length, 'unusually low day was', 'unusually low days were')} left out as possibly incomplete (${result.suspectDays.map((d) => d.date).join(', ')}). Mark them complete on the Daily Log if they're right.`,
    );
  }
  if (result.incompleteDays > 0) {
    lines.push(`${plural(result.incompleteDays, 'day', 'days')} marked incomplete ${result.incompleteDays === 1 ? 'was' : 'were'} left out.`);
  }
  return lines;
}
