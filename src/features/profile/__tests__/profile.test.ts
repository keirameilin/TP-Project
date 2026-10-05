import { createTestDatabase } from '../../../test-utils/testDatabase';
import { PlayerProfileRepository } from '../repository';
import { validateProfile, type PlayerProfileFields } from '../validation';

const valid: PlayerProfileFields = { age: 17, sex: null, heightCm: null, level: null, maxHeartRate: null };
const fields = (overrides: Partial<PlayerProfileFields>) =>
  validateProfile({ ...valid, ...overrides }).map((i) => i.field);

describe('validateProfile', () => {
  it('accepts a profile with only an age, and a complete one', () => {
    expect(fields({})).toEqual([]);
    expect(fields({ age: 10, maxHeartRate: 120, heightCm: 100, sex: 'female', level: 'recreational' })).toEqual([]);
    expect(fields({ age: 100, maxHeartRate: 230, heightCm: 250, sex: 'male', level: 'professional' })).toEqual([]);
  });

  it.each([9, 101, 17.5, NaN])('rejects age %p', (age) => {
    expect(fields({ age })).toEqual(['age']);
  });

  it.each([119, 231, 190.5, NaN])('rejects max heart rate %p', (maxHeartRate) => {
    expect(fields({ maxHeartRate })).toEqual(['maxHeartRate']);
  });

  it.each([99.9, 250.1, 1.8, NaN])('rejects height %p cm', (heightCm) => {
    expect(fields({ heightCm })).toEqual(['heightCm']);
  });

  it('rejects unknown sex and level values', () => {
    expect(fields({ sex: 'other' as never, level: 'elite' as never })).toEqual(['sex', 'level']);
  });
});

describe('PlayerProfileRepository', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let repo: PlayerProfileRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repo = new PlayerProfileRepository(db, { now: () => new Date('2026-09-30T12:00:00Z') });
  });
  afterEach(() => db.close());

  it('is empty until saved', async () => {
    expect(await repo.get()).toBeNull();
  });

  it('saves and updates the single profile row', async () => {
    expect(await repo.save({ age: 17 })).toEqual({
      age: 17,
      sex: null,
      heightCm: null,
      level: null,
      maxHeartRate: null,
      updatedAt: '2026-09-30T12:00:00.000Z',
    });

    await repo.save({ age: 18, sex: 'female', heightCm: 168.5, level: 'competitive', maxHeartRate: 201 });
    expect(await repo.get()).toMatchObject({
      age: 18,
      sex: 'female',
      heightCm: 168.5,
      level: 'competitive',
      maxHeartRate: 201,
    });

    // Saving replaces the whole profile, so omitted optional fields are cleared.
    await repo.save({ age: 18, sex: 'female' });
    expect(await repo.get()).toMatchObject({ sex: 'female', heightCm: null, level: null, maxHeartRate: null });
  });

  it('rejects an invalid profile without saving', async () => {
    await expect(repo.save({ age: 5 })).rejects.toThrow(/age/);
    await expect(repo.save({ age: 20, heightCm: 18 })).rejects.toThrow(/heightCm/);
    expect(await repo.get()).toBeNull();
  });
});
