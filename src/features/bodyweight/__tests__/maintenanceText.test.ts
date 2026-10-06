import type { InsufficientData, MaintenanceEstimate } from '../maintenance';
import { describeMaintenance } from '../maintenanceText';
import { lbToKg } from '../types';

const estimate: MaintenanceEstimate = {
  status: 'ok',
  from: '2026-09-08',
  to: '2026-10-05',
  avgIntakeKcal: 2850,
  windowDays: 28,
  weighInCount: 6,
  trendKgPerWeek: 0,
  maintenanceKcal: 2850,
  balanceKcal: 0,
  loggedIntakeDays: 21,
  suspectDays: [],
  incompleteDays: 0,
};

const insufficient: InsufficientData = {
  status: 'insufficient_data',
  reasons: ['too_few_weigh_ins', 'weigh_in_span_too_short', 'too_few_logged_days'],
  weighInCount: 1,
  loggedIntakeDays: 2,
  suspectDays: [],
  incompleteDays: 0,
};

describe('describeMaintenance', () => {
  it('says what a finished estimate is based on', () => {
    expect(describeMaintenance(estimate)).toEqual([
      'Based on the last 28 days: 21 days of logged food and 6 weigh-ins.',
      'You ate about 2,850 kcal a day and your weight held steady.',
    ]);
  });

  it('gives the weight trend in pounds a week', () => {
    const losing = describeMaintenance({ ...estimate, trendKgPerWeek: -lbToKg(0.5) });
    expect(losing[1]).toBe('You ate about 2,850 kcal a day and your weight fell about 0.5 lb a week.');
    const gaining = describeMaintenance({ ...estimate, trendKgPerWeek: lbToKg(1.2) });
    expect(gaining[1]).toContain('rose about 1.2 lb a week');
  });

  it('lists exactly what is missing when there is not enough data', () => {
    expect(describeMaintenance(insufficient)).toEqual([
      'Not enough data yet. Over the last 28 days this needs:',
      '• At least 3 weigh-ins (you have 1).',
      '• Weigh-ins at least 7 days apart.',
      '• At least 7 days of logged food (you have 2).',
    ]);
    expect(describeMaintenance({ ...insufficient, reasons: ['too_few_logged_days'] })).toEqual([
      'Not enough data yet. Over the last 28 days this needs:',
      '• At least 7 days of logged food (you have 2).',
    ]);
  });

  it('mentions low days that were left out, and days marked incomplete', () => {
    const lines = describeMaintenance({
      ...estimate,
      suspectDays: [
        { date: '2026-09-20', calories: 900 },
        { date: '2026-09-27', calories: 700 },
      ],
      incompleteDays: 1,
    });
    expect(lines[2]).toBe(
      "2 unusually low days were left out as possibly incomplete (2026-09-20, 2026-09-27). Mark them complete on the Daily Log if they're right.",
    );
    expect(lines[3]).toBe('1 day marked incomplete was left out.');
    expect(describeMaintenance({ ...estimate, suspectDays: [{ date: '2026-09-20', calories: 900 }] })[2]).toContain(
      '1 unusually low day was left out',
    );
  });
});
