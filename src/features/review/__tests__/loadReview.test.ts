import { addDays } from '../../../lib/dates';
import { createTestDatabase } from '../../../test-utils/testDatabase';
import { createDailyLogRepos, type DailyLogRepos } from '../../dailyLog/saveDay';
import type { SessionType } from '../../training/types';
import { loadDayReview } from '../loadReview';

const TODAY = '2026-10-10';
const YESTERDAY = addDays(TODAY, -1);
const TOMORROW = addDays(TODAY, 1);

let db: Awaited<ReturnType<typeof createTestDatabase>>;
let repos: DailyLogRepos;

beforeEach(async () => {
  db = await createTestDatabase();
  // "Now" is well before the dates used, so plans can be made for any of them.
  repos = createDailyLogRepos(db, { now: () => new Date(2026, 7, 1, 12) });
  // 25-year-old professional man, 180 cm, 75 kg: baseline 3330 kcal, 135 g protein, 93 g fat, 488 g carbs.
  await repos.profile.save({ age: 25, sex: 'male', heightCm: 180, level: 'professional', maxHeartRate: 190 });
  await repos.weight.log({ date: '2026-08-01', weightKg: 75 });
});
afterEach(() => db.close());

const logSession = (date: string, sessionType: SessionType, quality: number | null, extra: object = {}) =>
  repos.training.create(
    sessionType === 'rest_day'
      ? { date, sessionType }
      : { date, sessionType, durationMinutes: 90, rpe: 8, sessionQuality: quality, ...extra },
  );

/** Logs one food item for a day and marks the day Complete (or leaves the mark as given). */
async function eat(date: string, carbsG: number, proteinG: number, calories: number, status: 'complete' | 'incomplete' | null = 'complete') {
  await repos.food.create({ date, mealType: 'lunch', foodName: 'Food', calories, proteinG, carbsG, fatG: 50 });
  await repos.logDays.setStatus(date, status);
}

describe('a match day', () => {
  beforeEach(async () => {
    await logSession(TODAY, 'match', 3, { sleepHours: 5 });
    await eat(YESTERDAY, 307.5, 80, 2100); // the day before a match: target 525 g carbs
    await eat(TODAY, 525, 135, 3477); // match day: on target
  });

  it('summarises the session and reviews both days against their own targets', async () => {
    const data = await loadDayReview(repos, TODAY);
    expect(data.session).toMatchObject({ sessionType: 'match', durationMinutes: 90, sessionQuality: 3 });
    expect(data.effort?.effort).toEqual({ source: 'rating', level: 8, durationMinutes: 90, trainingLoad: 720 });
    // Nothing entered: 9.5 MET × 75 kg × 1.5 h = 1068.75 → 1069 kcal, from the session type.
    expect(data.calories?.calories).toEqual({ source: 'estimated', method: 'session_type', kcal: 1069 });
    expect(data.today).toMatchObject({
      eaten: { calories: 3477, carbsG: 525, proteinG: 135 },
      status: 'complete',
      targets: { calories: 3477, carbsG: 525 },
    });
    expect(data.review?.outcome).toBe('bad');
    expect(data.review?.findings.map((f) => f.text)).toEqual([
      'Yesterday you ate 4.1 g/kg of carbs. The soccer guideline for the day before a match is 6–8 g/kg.',
      'You logged 5 hours of sleep last night, under 6 hours (estimate). That may be another factor.',
      'Yesterday you ate 80 g of protein, 41% under your 135 g target.',
    ]);
    expect(data.review?.patternMissing[0]).toBe(
      'At least 8 rated sessions that follow a day with food marked Complete (you have 1).',
    );
  });

  it('shows the recovery guideline and tomorrow as the day after a match', async () => {
    const { tomorrow } = await loadDayReview(repos, TODAY);
    expect(tomorrow.date).toBe(TOMORROW);
    expect(tomorrow.planned).toBeNull();
    // 6 × 75 = 450 g carbs, 2.2 × 75 = 165 g protein, 660 + 1800 + 837 = 3297 kcal
    expect(tomorrow.targets).toMatchObject({ ok: true, targets: { calories: 3297, carbsG: 450, proteinG: 165, fatG: 93 } });
    expect(tomorrow.explanation).toMatch(/^Tomorrow is the day after a match: carbs are set to 6 g\/kg/);
    expect(tomorrow.recovery).toBe(
      "After today's match: about 1 g/kg of carbohydrate an hour for 4 hours (about 75 g an hour at your weight), plus 20–25 g of protein every 3–4 hours (UEFA nutrition statement).",
    );
  });

  it('cannot assess nutrition while today’s food is not marked Complete', async () => {
    await repos.logDays.setStatus(TODAY, 'incomplete');
    const { review } = await loadDayReview(repos, TODAY);
    expect(review?.findings.map((f) => f.kind)).toEqual(['sleep']);
    expect(review?.cannotAssess[0]).toMatch(/^Today's food is marked Incomplete, so the nutrition side can't be assessed/);
  });
});

describe('tomorrow’s targets', () => {
  it('follows a match planned for tomorrow', async () => {
    await logSession(TODAY, 'gym_strength', 6);
    await repos.planned.create({ date: TOMORROW, sessionType: 'match', expectedDurationMinutes: 90 });
    const { tomorrow } = await loadDayReview(repos, TODAY);
    expect(tomorrow.planned).toMatchObject({ sessionType: 'match' });
    expect(tomorrow.targets).toMatchObject({ ok: true, targets: { calories: 3477, carbsG: 525, proteinG: 135 } });
    expect(tomorrow.explanation).toBe(
      'Tomorrow is a match day: carbs are set to 7 g/kg, inside the 6–8 g/kg the UEFA nutrition statement gives for a match day.',
    );
    expect(tomorrow.recovery).toBeNull();
  });

  it('shows the baseline when nothing is planned', async () => {
    await logSession(TODAY, 'gym_strength', 6);
    const { tomorrow } = await loadDayReview(repos, TODAY);
    expect(tomorrow.planned).toBeNull();
    expect(tomorrow.targets).toMatchObject({ ok: true, targets: { calories: 3330, carbsG: 488, proteinG: 135, fatG: 93 } });
    expect(tomorrow.explanation).toBe('Nothing is planned for tomorrow, so these are your baseline targets.');
  });

  it('uses today as the day before when a match is planned the day after tomorrow', async () => {
    await logSession(TODAY, 'technical_tactical', 6);
    await repos.planned.create({ date: TOMORROW, sessionType: 'rest_day' });
    await repos.planned.create({ date: addDays(TODAY, 2), sessionType: 'match' });
    const { tomorrow } = await loadDayReview(repos, TODAY);
    // A rest day (3 g/kg) the day before a match (7 g/kg): the higher rule wins.
    expect(tomorrow.targets).toMatchObject({ ok: true, targets: { rule: { name: 'dayBeforeMatch' }, carbsG: 525 } });
  });

  it('says what is missing when targets can’t be calculated', async () => {
    const empty = await createTestDatabase();
    const emptyRepos = createDailyLogRepos(empty);
    await emptyRepos.training.create({ date: TODAY, sessionType: 'match', durationMinutes: 90, rpe: 8, sessionQuality: 5 });
    const data = await loadDayReview(emptyRepos, TODAY);
    expect(data.tomorrow.targets).toEqual({ ok: false, missing: ['age', 'sex', 'height', 'playing level', 'body weight'] });
    expect(data.tomorrow.explanation).toBeNull();
    // With no weight the recovery guideline is still shown, without the per-hour figure.
    expect(data.tomorrow.recovery).toMatch(/about 1 g\/kg of carbohydrate an hour for 4 hours, plus/);
    empty.close();
  });
});

describe('days without a review', () => {
  it('gives a rest day no review, only tomorrow’s targets', async () => {
    await logSession(TODAY, 'rest_day', null);
    await repos.planned.create({ date: TOMORROW, sessionType: 'hiit_conditioning' });
    const data = await loadDayReview(repos, TODAY);
    expect(data.review).toBeNull();
    expect(data.effort).toBeNull();
    expect(data.calories).toBeNull();
    // 5 × 75 = 375 g carbs; 540 + 1500 + 837 = 2877 kcal
    expect(data.tomorrow.targets).toMatchObject({ ok: true, targets: { calories: 2877, carbsG: 375 } });
    expect(data.tomorrow.explanation).toBe('Tomorrow is a conditioning or gym day: carbs are set to 5 g/kg (estimate).');
  });

  it('gives no review for a session without a rating, or a day with nothing logged', async () => {
    await logSession(TODAY, 'match', null);
    expect((await loadDayReview(repos, TODAY)).review).toBeNull();
    const empty = await loadDayReview(repos, addDays(TODAY, -20));
    expect(empty).toMatchObject({ session: null, review: null, effort: null });
  });
});

describe('personal pattern from the logs', () => {
  it('uses only rated sessions whose day before has food marked Complete', async () => {
    // Eight gym sessions two days apart, each with the day before logged. A gym day's neighbour has
    // nothing planned, so the day before each session is a baseline day: 488 g carbs.
    //   four at 488 g (100%) rated 8, 8, 7, 8 → 7.75 → 7.8
    //   three at 244 g (50%) rated 5, 6, 4 → 5
    //   one at 390 g (80%), rated 6, in neither group
    const plan: [number, number][] = [
      [488, 8],
      [488, 8],
      [488, 7],
      [488, 8],
      [244, 5],
      [244, 6],
      [244, 4],
      [390, 6],
    ];
    for (const [i, [carbs, quality]] of plan.entries()) {
      const date = addDays('2026-09-02', i * 2);
      await eat(addDays(date, -1), carbs, 135, 3330);
      await logSession(date, 'gym_strength', quality);
    }
    // Not counted: an unrated session, a rest day, and a session after a day marked Incomplete.
    await eat('2026-09-19', 100, 135, 3330);
    await logSession('2026-09-20', 'gym_strength', null);
    await eat('2026-09-21', 100, 135, 3330);
    await logSession('2026-09-22', 'rest_day', null);
    await eat('2026-09-23', 100, 135, 3330, 'incomplete');
    await logSession('2026-09-24', 'gym_strength', 2);

    await logSession(TODAY, 'gym_strength', 5);
    await eat(TODAY, 375, 135, 2877);
    const { review } = await loadDayReview(repos, TODAY);
    expect(review?.patternMissing).toEqual([]);
    expect(review?.findings.map((f) => f.text)).toContain(
      'Pattern in your logs: your 4 sessions after days with at least 90% of your carb target averaged 7.8 for how they went. Your 3 after days under 70% averaged 5.',
    );
  });
});
