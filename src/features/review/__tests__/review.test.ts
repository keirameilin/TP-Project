import type { Macros } from '../../nutrition/types';
import { adjustTargets, dayRuleFor, type DayTargets, type SessionTypeOn } from '../../targets/adjust';
import { baselineTargets } from '../../targets/baseline';
import type { SessionType } from '../../training/types';
import {
  buildDayReview,
  carbPattern,
  NOTHING_STANDS_OUT,
  outcomeFor,
  type DayNutrition,
  type PatternSession,
  type ReviewInput,
} from '../review';

// A 25-year-old professional man, 180 cm, 75 kg: baseline 3330 kcal, 135 g protein, 93 g fat, 488 g carbs.
const baseline = baselineTargets({ sex: 'male', age: 25, heightCm: 180, weightKg: 75, level: 'professional' });
const D = '2026-10-10';
const only = (date: string, type: SessionType): SessionTypeOn => (d) => (d === date ? type : null);

/** Targets for a day of the given kind, built by the real engine. */
const targets = {
  // 7 g/kg → 525 g carbs, 3477 kcal
  dayBeforeMatch: adjustTargets(baseline, dayRuleFor('2026-10-09', only(D, 'match'))),
  matchDay: adjustTargets(baseline, dayRuleFor(D, only(D, 'match'))),
  // 5 g/kg → 375 g carbs, 2877 kcal
  gymDay: adjustTargets(baseline, dayRuleFor(D, only(D, 'gym_strength'))),
  nothingPlanned: adjustTargets(baseline, dayRuleFor(D, () => null)),
};

const ate = (carbsG: number, proteinG: number, calories: number): Macros => ({ carbsG, proteinG, calories, fatG: 90 });
const complete = (eaten: Macros, t: DayTargets): DayNutrition => ({ eaten, status: 'complete', targets: t });
const onTarget = (t: DayTargets) => complete(ate(t.carbsG, t.proteinG, t.calories), t);

/** A match day reviewed with both days' food Complete and on target, unless overridden. */
const review = (overrides: Partial<ReviewInput>) =>
  buildDayReview({
    quality: 3,
    sleepHours: 8,
    today: onTarget(targets.matchDay),
    yesterday: onTarget(targets.dayBeforeMatch),
    history: [],
    ...overrides,
  });
const texts = (overrides: Partial<ReviewInput>) => review(overrides).findings.map((f) => f.text);

describe('outcomeFor', () => {
  it('treats 7 or higher as good and 4 or lower as bad', () => {
    expect([1, 4, 5, 6, 7, 10].map(outcomeFor)).toEqual(['bad', 'bad', 'neutral', 'neutral', 'good', 'good']);
  });
});

describe('guideline findings after a session that went badly', () => {
  // Yesterday: 307.5 g carbs ÷ 75 kg = 4.1 g/kg, 41% under 525 g. Protein 80 g, 41% under 135 g.
  // Calories 2100, 40% under 3477.
  const lowYesterday = complete(ate(307.5, 80, 2100), targets.dayBeforeMatch);

  it('flags each shortfall over 25%, biggest first, with the player’s numbers', () => {
    expect(texts({ yesterday: lowYesterday })).toEqual([
      'Yesterday you ate 4.1 g/kg of carbs. The soccer guideline for the day before a match is 6–8 g/kg.',
      'Yesterday you ate 80 g of protein, 41% under your 135 g target.',
      'Yesterday you ate 2,100 kcal, 40% under your 3,477 kcal target.',
    ]);
  });

  it('flags today’s food too', () => {
    // 300 g ÷ 75 = 4 g/kg, 43% under 525 g.
    expect(texts({ today: complete(ate(300, 135, 3477), targets.matchDay) })).toEqual([
      'Today you ate 4 g/kg of carbs. The soccer guideline for a match day is 6–8 g/kg.',
    ]);
  });

  it('does not flag a shortfall of exactly 25% or less', () => {
    // 393.75 g is exactly 25% under 525 g; 102 g protein is 24% under 135 g.
    const result = review({ yesterday: complete(ate(393.75, 102, 3477), targets.dayBeforeMatch) });
    expect(result.findings).toEqual([]);
    expect(result.nothingStandsOut).toBe(NOTHING_STANDS_OUT);
  });

  it('says "estimate" when the day’s carb target is the app’s own', () => {
    // 150 g ÷ 75 = 2 g/kg against 5 g/kg.
    expect(texts({ today: complete(ate(150, 135, 2877), targets.gymDay), yesterday: onTarget(targets.nothingPlanned) })).toEqual([
      "Today you ate 2 g/kg of carbs. This app's target for a conditioning or gym day is 5 g/kg (estimate).",
    ]);
  });

  it('compares with the baseline on a day with nothing planned', () => {
    // 200 g is 59% under 488 g.
    expect(texts({ today: complete(ate(200, 135, 3330), targets.nothingPlanned) })).toEqual([
      'Today you ate 200 g of carbs, 59% under your 488 g baseline target.',
    ]);
  });

  it('lists at most three findings, keeping room for sleep', () => {
    expect(texts({ yesterday: lowYesterday, sleepHours: 5 })).toEqual([
      'Yesterday you ate 4.1 g/kg of carbs. The soccer guideline for the day before a match is 6–8 g/kg.',
      'You logged 5 hours of sleep last night, under 6 hours (estimate). That may be another factor.',
      'Yesterday you ate 80 g of protein, 41% under your 135 g target.',
    ]);
  });

  it('treats a neutral session the same way', () => {
    expect(review({ quality: 5, yesterday: lowYesterday })).toMatchObject({ outcome: 'neutral' });
    expect(texts({ quality: 5, yesterday: lowYesterday })).toHaveLength(3);
  });
});

describe('sleep', () => {
  it('lists sleep under 6 hours as another possible factor', () => {
    expect(texts({ sleepHours: 5.5 })).toEqual([
      'You logged 5.5 hours of sleep last night, under 6 hours (estimate). That may be another factor.',
    ]);
    expect(texts({ sleepHours: 1 })[0]).toMatch(/^You logged 1 hour of sleep/);
  });

  it('says nothing about 6 hours or more, or sleep that was not entered', () => {
    expect(texts({ sleepHours: 6 })).toEqual([]);
    expect(texts({ sleepHours: null })).toEqual([]);
  });

  it('names sleep among the things the app can’t see only when it was not entered', () => {
    expect(review({ sleepHours: null }).blindSpots).toBe(
      "This app can't see sleep (not entered for this session), hydration, stress or illness. What it shows is a pattern in your logs, not proof of what caused the session to go this way.",
    );
    expect(review({ sleepHours: 8 }).blindSpots).toBe(
      "This app can't see hydration, stress or illness. What it shows is a pattern in your logs, not proof of what caused the session to go this way.",
    );
  });
});

describe('a session that went well', () => {
  it('shows what lined up instead of what fell short', () => {
    const result = review({ quality: 8 });
    expect(result.outcome).toBe('good');
    expect(result.findings.map((f) => f.text)).toEqual([
      'Yesterday you ate 7 g/kg of carbs, in line with the 6–8 g/kg soccer guideline for the day before a match.',
      'Yesterday you ate 135 g of protein, in line with your 135 g target.',
      'Yesterday you ate 3,477 kcal, in line with your 3,477 kcal target.',
    ]);
  });

  it('counts 90% of a target as lining up, and ignores shortfalls and short sleep', () => {
    // Yesterday: carbs 472.5 g = exactly 90% of 525 g (6.3 g/kg); protein and calories well under.
    // Today: everything well under.
    const result = review({
      quality: 9,
      sleepHours: 4,
      yesterday: complete(ate(472.5, 60, 1500), targets.dayBeforeMatch),
      today: complete(ate(100, 60, 1500), targets.matchDay),
    });
    expect(result.findings).toEqual([
      {
        kind: 'lined_up',
        text: 'Yesterday you ate 6.3 g/kg of carbs, in line with the 6–8 g/kg soccer guideline for the day before a match.',
      },
    ]);
  });

  it('says nothing stands out when nothing lined up', () => {
    const low = ate(100, 60, 1500);
    const result = review({ quality: 8, yesterday: complete(low, targets.dayBeforeMatch), today: complete(low, targets.matchDay) });
    expect(result.findings).toEqual([]);
    expect(result.nothingStandsOut).toBe('Nothing in your logged data explains this session.');
  });
});

describe('food that can’t be used', () => {
  const low = ate(100, 60, 1500);

  it('does not assess nutrition when today’s food is Incomplete, unmarked or missing', () => {
    const cases: [DayNutrition, string][] = [
      [{ eaten: low, status: 'incomplete', targets: targets.matchDay }, "Today's food is marked Incomplete"],
      [{ eaten: low, status: null, targets: targets.matchDay }, "Today's food isn't marked Complete"],
      [{ eaten: null, status: null, targets: targets.matchDay }, "Today's food isn't logged"],
    ];
    for (const [today, reason] of cases) {
      const result = review({ today, yesterday: complete(low, targets.dayBeforeMatch) });
      expect(result.findings).toEqual([]);
      expect(result.cannotAssess).toEqual([
        `${reason}, so the nutrition side can't be assessed. Log it and mark the day Complete on the Food tab.`,
      ]);
    }
  });

  it('still lists sleep when the food can’t be assessed', () => {
    const result = review({ today: { eaten: null, status: null, targets: targets.matchDay }, sleepHours: 4 });
    expect(result.findings.map((f) => f.kind)).toEqual(['sleep']);
  });

  it('checks only today when yesterday’s food is not marked Complete', () => {
    const result = review({
      yesterday: { eaten: low, status: 'incomplete', targets: targets.dayBeforeMatch },
      today: complete(ate(300, 135, 3477), targets.matchDay),
    });
    expect(result.findings.map((f) => f.text)).toEqual([
      'Today you ate 4 g/kg of carbs. The soccer guideline for a match day is 6–8 g/kg.',
    ]);
    expect(result.cannotAssess).toEqual(["Yesterday's food is marked Incomplete, so only today's food was checked."]);
  });

  it('counts a day marked Complete with nothing logged as zero', () => {
    const result = review({ today: { eaten: null, status: 'complete', targets: targets.matchDay } });
    expect(result.findings[0].text).toBe('Today you ate 0 g/kg of carbs. The soccer guideline for a match day is 6–8 g/kg.');
  });

  it('says targets are needed when the profile is incomplete', () => {
    const result = review({ today: { eaten: low, status: 'complete', targets: null } });
    expect(result.findings).toEqual([]);
    expect(result.cannotAssess[0]).toMatch(/until your profile and weight are set on the Player tab/);
  });
});

describe('personal pattern', () => {
  const session = (quality: number, carbFraction: number, i: number): PatternSession => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    quality,
    carbFraction,
  });
  // Four after days at 90% or more: (8 + 8 + 7 + 8) ÷ 4 = 7.75 → 7.8.
  // Three after days under 70%: (5 + 6 + 4) ÷ 3 = 5. One in between (80%), counted in neither group.
  const enough = [
    [8, 1.0],
    [8, 0.95],
    [7, 0.92],
    [8, 0.9],
    [5, 0.5],
    [6, 0.6],
    [4, 0.69],
    [6, 0.8],
  ].map(([q, f], i) => session(q, f, i));

  it('compares the two groups once there is enough data', () => {
    expect(carbPattern(enough)).toEqual({
      text: 'Pattern in your logs: your 4 sessions after days with at least 90% of your carb target averaged 7.8 for how they went. Your 3 after days under 70% averaged 5.',
      missing: [],
    });
  });

  it('is listed as a finding, ahead of smaller shortfalls', () => {
    const lowYesterday = complete(ate(307.5, 80, 2100), targets.dayBeforeMatch);
    const result = review({ yesterday: lowYesterday, sleepHours: 5, history: enough });
    expect(result.findings.map((f) => f.kind)).toEqual(['shortfall', 'sleep', 'pattern']);
    expect(result.patternMissing).toEqual([]);
  });

  it('is shown for a session that went well too', () => {
    expect(review({ quality: 8, history: enough }).findings.map((f) => f.kind)).toEqual(['lined_up', 'pattern', 'lined_up']);
  });

  it('says exactly what is missing with too few sessions', () => {
    const few = [session(8, 1.0, 0), session(6, 0.8, 1), session(7, 0.75, 2)];
    expect(carbPattern(few)).toEqual({
      text: null,
      missing: [
        'At least 8 rated sessions that follow a day with food marked Complete (you have 3).',
        'At least 2 of them after a day with 90% or more of your carb target (you have 1).',
        'At least 2 of them after a day under 70% of your carb target (you have 0).',
      ],
    });
    expect(review({ history: few }).patternMissing).toHaveLength(3);
  });

  it('names only the group that is short when there are enough sessions', () => {
    const oneLow = enough.map((s, i) => (i === 4 || i === 5 ? { ...s, carbFraction: 0.8 } : s));
    expect(carbPattern(oneLow).missing).toEqual([
      'At least 2 of them after a day under 70% of your carb target (you have 1).',
    ]);
  });
});

describe('wording', () => {
  it('never claims that something caused the session to go the way it did', () => {
    const everything = review({
      yesterday: complete(ate(307.5, 80, 2100), targets.dayBeforeMatch),
      today: complete(ate(100, 60, 1500), targets.matchDay),
      sleepHours: 4,
    });
    const good = review({ quality: 9 });
    for (const text of [...everything.findings, ...good.findings].map((f) => f.text)) {
      expect(text).not.toMatch(/because|caused|due to|led to|result of/i);
    }
  });
});
