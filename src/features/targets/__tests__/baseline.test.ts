import { createTestDatabase } from '../../../test-utils/testDatabase';
import { BodyWeightRepository } from '../../bodyweight';
import { PlayerProfileRepository, type PlayerProfile } from '../../profile';
import {
  baselineTargets,
  bmrMifflinStJeor,
  proteinGPerKgFor,
  resolveBaselineTargets,
  type BaselineInput,
} from '../baseline';
import { loadBaselineTargets, weightForDate } from '../loadTargets';

const male: BaselineInput = { sex: 'male', age: 25, heightCm: 180, weightKg: 75, level: 'recreational' };
const female: BaselineInput = { sex: 'female', age: 22, heightCm: 165, weightKg: 60, level: 'professional' };

describe('bmrMifflinStJeor', () => {
  it('matches the published formula for men and women', () => {
    // 10×75 + 6.25×180 − 5×25 + 5
    expect(bmrMifflinStJeor(male)).toBe(1755);
    // 10×60 + 6.25×165 − 5×22 − 161
    expect(bmrMifflinStJeor(female)).toBe(1360.25);
  });
});

describe('baselineTargets', () => {
  it('scales BMR by the playing level and splits it into macros', () => {
    // 1755 × 1.55 = 2720; protein 1.8 × 75; fat 25% of 2720 ÷ 9; carbs = the rest ÷ 4
    expect(baselineTargets(male)).toEqual({
      bmr: 1755,
      level: 'recreational',
      activityFactor: 1.55,
      calories: 2720,
      proteinG: 135,
      proteinGPerKg: 1.8,
      fatG: 76,
      carbsG: 374,
      weightKg: 75,
    });
    // 1360.25 × 1.9 = 2584 → 2580
    expect(baselineTargets(female)).toMatchObject({
      bmr: 1360,
      calories: 2580,
      proteinG: 108,
      fatG: 72,
      carbsG: 375,
    });
  });

  it('uses 1.6 g/kg of protein for players under 18 and 1.8 from 18 up', () => {
    const at = (age: number) => baselineTargets({ ...male, age });
    expect(at(17)).toMatchObject({ proteinGPerKg: 1.6, proteinG: 120 }); // 1.6 × 75
    expect(at(12)).toMatchObject({ proteinGPerKg: 1.6, proteinG: 120 });
    expect(at(18)).toMatchObject({ proteinGPerKg: 1.8, proteinG: 135 }); // 1.8 × 75
    // The calories protein gives up go to carbs, so the macros still add up to the calorie target.
    const junior = at(17);
    expect(Math.abs(junior.proteinG * 4 + junior.carbsG * 4 + junior.fatG * 9 - junior.calories)).toBeLessThanOrEqual(10);
    expect(proteinGPerKgFor(17)).toBe(1.6);
    expect(proteinGPerKgFor(18)).toBe(1.8);
  });

  it('gives higher levels more calories and carbs but the same protein', () => {
    const [rec, comp, pro] = (['recreational', 'competitive', 'professional'] as const).map((level) =>
      baselineTargets({ ...male, level }),
    );
    expect(rec.calories).toBeLessThan(comp.calories);
    expect(comp.calories).toBeLessThan(pro.calories);
    expect(rec.carbsG).toBeLessThan(pro.carbsG);
    expect(new Set([rec.proteinG, comp.proteinG, pro.proteinG]).size).toBe(1);
  });

  it.each([male, female, { ...male, level: 'professional' as const, weightKg: 92, heightCm: 193 }])(
    'macros add back up to the calorie target (%#)',
    (input) => {
      const t = baselineTargets(input);
      expect(Math.abs(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9 - t.calories)).toBeLessThanOrEqual(10);
    },
  );
});

describe('resolveBaselineTargets', () => {
  const profile: PlayerProfile = {
    age: 25,
    sex: 'male',
    heightCm: 180,
    level: 'recreational',
    maxHeartRate: null,
    updatedAt: '2026-10-04T12:00:00.000Z',
  };

  it('returns targets when everything is known', () => {
    expect(resolveBaselineTargets(profile, 75)).toEqual({ ok: true, targets: baselineTargets(male) });
  });

  it('lists what is missing', () => {
    expect(resolveBaselineTargets(null, null)).toEqual({
      ok: false,
      missing: ['age', 'sex', 'height', 'playing level', 'body weight'],
    });
    expect(resolveBaselineTargets({ ...profile, heightCm: null }, 75)).toEqual({ ok: false, missing: ['height'] });
    expect(resolveBaselineTargets(profile, null)).toEqual({ ok: false, missing: ['body weight'] });
  });
});

describe('loading targets for a date', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let repos: { profile: PlayerProfileRepository; weight: BodyWeightRepository };

  beforeEach(async () => {
    db = await createTestDatabase();
    repos = { profile: new PlayerProfileRepository(db), weight: new BodyWeightRepository(db) };
  });
  afterEach(() => db.close());

  it('uses the latest weigh-in on or before the date', async () => {
    await repos.weight.log({ date: '2026-09-20', weightKg: 74 });
    await repos.weight.log({ date: '2026-09-28', weightKg: 75 });
    await repos.weight.log({ date: '2026-10-02', weightKg: 76 });
    expect(await weightForDate(repos.weight, '2026-09-30')).toBe(75);
    expect(await weightForDate(repos.weight, '2026-10-02')).toBe(76);
  });

  it('falls back to the first weigh-in after the date, or null with none', async () => {
    expect(await weightForDate(repos.weight, '2026-09-30')).toBeNull();
    await repos.weight.log({ date: '2026-10-05', weightKg: 77 });
    await repos.weight.log({ date: '2026-10-03', weightKg: 76 });
    expect(await weightForDate(repos.weight, '2026-09-30')).toBe(76);
  });

  it('combines the saved profile with the weigh-in', async () => {
    expect(await loadBaselineTargets(repos, '2026-09-30')).toMatchObject({ ok: false });

    await repos.profile.save({ age: 25, sex: 'male', heightCm: 180, level: 'recreational' });
    expect(await loadBaselineTargets(repos, '2026-09-30')).toEqual({ ok: false, missing: ['body weight'] });

    await repos.weight.log({ date: '2026-09-30', weightKg: 75 });
    expect(await loadBaselineTargets(repos, '2026-09-30')).toEqual({ ok: true, targets: baselineTargets(male) });
  });
});
