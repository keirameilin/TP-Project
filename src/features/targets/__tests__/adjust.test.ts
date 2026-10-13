import { addDays } from '../../../lib/dates';
import { createTestDatabase } from '../../../test-utils/testDatabase';
import { createDailyLogRepos } from '../../dailyLog/saveDay';
import type { SessionType } from '../../training/types';
import {
  adjustTargets,
  dayRuleFor,
  describeMatchRecovery,
  explainDayTargets,
  isCongested,
  loadDayTargets,
  sessionTypeLookup,
  type SessionTypeOn,
} from '../adjust';
import { baselineTargets } from '../baseline';
import { ADJUSTMENT_RULES, REVIEW_RULES, SOURCE_TYPES, type Rule } from '../rules';

const D = '2026-10-10';
/** Sessions keyed by days from D, e.g. `{ 0: 'gym_strength', 1: 'match' }`. */
const days = (byOffset: Record<number, SessionType>): SessionTypeOn => {
  const byDate = new Map(Object.entries(byOffset).map(([offset, type]) => [addDays(D, Number(offset)), type]));
  return (date) => byDate.get(date) ?? null;
};

// A 25-year-old professional man, 180 cm, 75 kg:
//   resting 10×75 + 6.25×180 − 5×25 + 5 = 1755 kcal; × 1.9 = 3334.5 → 3330 kcal
//   protein 1.8 × 75 = 135 g; fat 25% × 3330 ÷ 9 = 92.5 → 93 g; carbs (3330 − 540 − 837) ÷ 4 = 488 g
const baseline = baselineTargets({ sex: 'male', age: 25, heightCm: 180, weightKg: 75, level: 'professional' });
const targetsFor = (byOffset: Record<number, SessionType>) => adjustTargets(baseline, dayRuleFor(D, days(byOffset)));

it('starts from the expected baseline', () => {
  expect(baseline).toMatchObject({ calories: 3330, proteinG: 135, fatG: 93, carbsG: 488 });
});

describe('dayRuleFor', () => {
  it.each([
    [{ 0: 'match' }, 'matchDay', 7],
    [{ 1: 'match' }, 'dayBeforeMatch', 7],
    [{ [-1]: 'match' }, 'dayAfterMatch', 6],
    [{ 0: 'hiit_conditioning' }, 'conditioningOrGym', 5],
    [{ 0: 'gym_strength' }, 'conditioningOrGym', 5],
    [{ 0: 'technical_tactical' }, 'technical', 4],
    [{ 0: 'rest_day' }, 'rest', 3],
    [{}, 'baseline', null],
  ] as const)('%j → %s', (byOffset, name, carbs) => {
    expect(dayRuleFor(D, days(byOffset as Record<number, SessionType>))).toMatchObject({ name, carbsGPerKg: carbs });
  });

  it('lets the rule with the most carbohydrate win, without stacking', () => {
    // Gym today, match tomorrow: 7 beats 5.
    expect(dayRuleFor(D, days({ 0: 'gym_strength', 1: 'match' })).name).toBe('dayBeforeMatch');
    // Rest today, match yesterday: 6 beats 3.
    expect(dayRuleFor(D, days({ [-1]: 'match', 0: 'rest_day' })).name).toBe('dayAfterMatch');
    // Technical today, match in two days: the match is too far off to count.
    expect(dayRuleFor(D, days({ 0: 'technical_tactical', 2: 'match' })).name).toBe('technical');
    // A match four days ago is too far back to count; today's match sets the rule.
    expect(dayRuleFor(D, days({ [-4]: 'match', 0: 'match' })).name).toBe('matchDay');
  });

  it('puts two matches inside four days at the top of the range', () => {
    expect(dayRuleFor(D, days({ [-1]: 'match', 0: 'match' }))).toMatchObject({ name: 'congested', carbsGPerKg: 8 });
    expect(dayRuleFor(D, days({ 0: 'match', 3: 'match' })).name).toBe('congested');
    // A training day between two matches three days apart.
    expect(dayRuleFor(D, days({ [-1]: 'match', 0: 'technical_tactical', 2: 'match' })).name).toBe('congested');
  });

  it('does not call matches four or more days apart congested', () => {
    expect(isCongested(D, days({ 0: 'match', 4: 'match' }))).toBe(false);
    // Both are close to D, but no four-day window holds D and both matches.
    expect(isCongested(D, days({ [-2]: 'match', 2: 'match' }))).toBe(false);
    // Two close matches that ended before the window can reach D.
    expect(isCongested(D, days({ [-5]: 'match', [-4]: 'match' }))).toBe(false);
  });
});

describe('adjustTargets', () => {
  it('sets carbs from g/kg, keeps protein and fat, and recomputes calories from the three', () => {
    // 7 × 75 = 525 g carbs; 135×4 + 525×4 + 93×9 = 3477 kcal
    expect(targetsFor({ 0: 'match' })).toMatchObject({ carbsG: 525, proteinG: 135, fatG: 93, calories: 3477, carbsGPerKg: 7 });
    // 8 × 75 = 600 g; 540 + 2400 + 837 = 3777
    expect(targetsFor({ [-1]: 'match', 0: 'match' })).toMatchObject({ carbsG: 600, proteinG: 135, calories: 3777 });
    // 5 × 75 = 375 g; 540 + 1500 + 837 = 2877
    expect(targetsFor({ 0: 'gym_strength' })).toMatchObject({ carbsG: 375, proteinG: 135, calories: 2877 });
    // 4 × 75 = 300 g; 540 + 1200 + 837 = 2577
    expect(targetsFor({ 0: 'technical_tactical' })).toMatchObject({ carbsG: 300, calories: 2577 });
    // 3 × 75 = 225 g; 540 + 900 + 837 = 2277
    expect(targetsFor({ 0: 'rest_day' })).toMatchObject({ carbsG: 225, calories: 2277 });
  });

  it('raises protein to the upper end the day after a match', () => {
    // 6 × 75 = 450 g carbs; 2.2 × 75 = 165 g protein; 660 + 1800 + 837 = 3297 kcal
    expect(targetsFor({ [-1]: 'match' })).toMatchObject({
      carbsG: 450,
      proteinG: 165,
      proteinGPerKg: 2.2,
      fatG: 93,
      calories: 3297,
    });
  });

  it('keeps a junior on the junior protein rule the day after a match', () => {
    const junior = baselineTargets({ sex: 'male', age: 16, heightCm: 180, weightKg: 75, level: 'competitive' });
    expect(junior.proteinG).toBe(120); // 1.6 × 75
    expect(adjustTargets(junior, dayRuleFor(D, days({ [-1]: 'match' })))).toMatchObject({ proteinG: 120, proteinGPerKg: 1.6 });
  });

  it('leaves the baseline untouched when nothing is planned', () => {
    expect(targetsFor({})).toMatchObject({ calories: 3330, proteinG: 135, carbsG: 488, fatG: 93 });
  });
});

describe('explanations', () => {
  it('quotes the UEFA range for sourced rules', () => {
    expect(explainDayTargets('Tomorrow', targetsFor({ 0: 'match' }))).toBe(
      'Tomorrow is a match day: carbs are set to 7 g/kg, inside the 6–8 g/kg the UEFA nutrition statement gives for a match day.',
    );
    expect(explainDayTargets('Tomorrow', targetsFor({ 1: 'match' }))).toBe(
      'Tomorrow is the day before a match: carbs are set to 7 g/kg, inside the 6–8 g/kg the UEFA nutrition statement gives for the day before a match.',
    );
  });

  it('says "estimate" wherever the number is our own', () => {
    expect(explainDayTargets('Tomorrow', targetsFor({ 0: 'gym_strength' }))).toBe(
      'Tomorrow is a conditioning or gym day: carbs are set to 5 g/kg (estimate).',
    );
    expect(explainDayTargets('Tomorrow', targetsFor({ 0: 'technical_tactical' }))).toBe(
      'Tomorrow is a technical day: carbs are set to 4 g/kg (estimate).',
    );
    expect(explainDayTargets('Tomorrow', targetsFor({ 0: 'rest_day' }))).toBe(
      'Tomorrow is a rest day: carbs are set to 3 g/kg (estimate).',
    );
    expect(explainDayTargets('Tomorrow', targetsFor({ [-1]: 'match', 0: 'match' }))).toBe(
      'Tomorrow is part of a run of 2 or more matches in 4 days: carbs are set to 8 g/kg (estimate).',
    );
    expect(explainDayTargets('Tomorrow', targetsFor({ [-1]: 'match' }))).toBe(
      'Tomorrow is the day after a match: carbs are set to 6 g/kg, inside the 6–8 g/kg the UEFA nutrition statement gives for the day after a match. Protein is raised to 2.2 g/kg, the upper end of its range (estimate).',
    );
  });

  it('says so when nothing is planned', () => {
    expect(explainDayTargets('Tomorrow', targetsFor({}))).toBe(
      'Nothing is planned for tomorrow, so these are your baseline targets.',
    );
  });

  it('gives the match recovery guideline, scaled to the player when the weight is known', () => {
    expect(describeMatchRecovery(75)).toBe(
      "After today's match: about 1 g/kg of carbohydrate an hour for 4 hours (about 75 g an hour at your weight), plus 20–25 g of protein every 3–4 hours (UEFA nutrition statement).",
    );
    expect(describeMatchRecovery(null)).toBe(
      "After today's match: about 1 g/kg of carbohydrate an hour for 4 hours, plus 20–25 g of protein every 3–4 hours (UEFA nutrition statement).",
    );
  });
});

describe('sessionTypeLookup', () => {
  it('uses what was logged over what was planned for the same day', () => {
    const typeOn = sessionTypeLookup(
      [{ date: D, sessionType: 'rest_day' }],
      [
        { date: D, sessionType: 'match' },
        { date: addDays(D, 1), sessionType: 'match' },
      ],
    );
    expect(typeOn(D)).toBe('rest_day');
    expect(typeOn(addDays(D, 1))).toBe('match');
    expect(typeOn(addDays(D, 2))).toBeNull();
  });
});

describe('loadDayTargets', () => {
  it('reads the profile, weight, logged sessions and plans', async () => {
    const db = await createTestDatabase();
    const repos = createDailyLogRepos(db, { now: () => new Date(2026, 9, 10, 12) });
    await repos.profile.save({ age: 25, sex: 'male', heightCm: 180, level: 'professional' });
    await repos.weight.log({ date: D, weightKg: 75 });
    await repos.planned.create({ date: addDays(D, 1), sessionType: 'match' });
    await repos.training.create({ date: D, sessionType: 'gym_strength', durationMinutes: 60, rpe: 6 });

    const today = await loadDayTargets(repos, D);
    expect(today).toMatchObject({ ok: true, targets: { rule: { name: 'dayBeforeMatch' }, carbsG: 525, calories: 3477 } });
    const tomorrow = await loadDayTargets(repos, addDays(D, 1));
    expect(tomorrow).toMatchObject({ ok: true, targets: { rule: { name: 'matchDay' } } });
    const nextWeek = await loadDayTargets(repos, addDays(D, 7));
    expect(nextWeek).toMatchObject({ ok: true, targets: { rule: { name: 'baseline' }, calories: 3330 } });
    db.close();
  });

  it('says what is missing when the profile is incomplete', async () => {
    const db = await createTestDatabase();
    const repos = createDailyLogRepos(db);
    expect(await loadDayTargets(repos, D)).toEqual({
      ok: false,
      missing: ['age', 'sex', 'height', 'playing level', 'body weight'],
    });
    db.close();
  });
});

describe('ADJUSTMENT_RULES and REVIEW_RULES', () => {
  const all = [...Object.entries(ADJUSTMENT_RULES), ...Object.entries(REVIEW_RULES)] as [string, Rule<unknown>][];

  it.each(all)('%s has a valid source type and a matching reference', (_name, rule) => {
    expect(SOURCE_TYPES).toContain(rule.sourceType);
    if (rule.sourceType === 'sourced') expect(rule.reference).toMatch(/^UEFA statement p\. \d+$/);
    if (rule.sourceType === 'estimate') expect(rule.reference).toBeNull();
  });

  it('marks only what the UEFA statement says as sourced', () => {
    const sourced = all.filter(([, r]) => r.sourceType === 'sourced').map(([name]) => name);
    expect(sourced).toEqual([
      'matchDayCarbsGPerKg',
      'dayBeforeMatchCarbsGPerKg',
      'dayAfterMatchCarbsGPerKg',
      'recoveryCarbs',
      'recoveryProtein',
    ]);
    expect(Object.values(REVIEW_RULES).every((r) => r.sourceType === 'estimate')).toBe(true);
  });
});
