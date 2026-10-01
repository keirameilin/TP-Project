import { createTestDatabase } from '../../../test-utils/testDatabase';
import { PlayerProfileRepository } from '../repository';
import { validateProfile } from '../validation';

const fields = (age: number, maxHeartRate: number | null = null) =>
  validateProfile({ age, maxHeartRate }).map((i) => i.field);

describe('validateProfile', () => {
  it('accepts normal ages and measured max heart rates', () => {
    expect(fields(17)).toEqual([]);
    expect(fields(10, 120)).toEqual([]);
    expect(fields(100, 230)).toEqual([]);
  });

  it.each([9, 101, 17.5, NaN])('rejects age %p', (age) => {
    expect(fields(age)).toEqual(['age']);
  });

  it.each([119, 231, 190.5, NaN])('rejects max heart rate %p', (max) => {
    expect(fields(20, max)).toEqual(['maxHeartRate']);
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
      maxHeartRate: null,
      updatedAt: '2026-09-30T12:00:00.000Z',
    });
    await repo.save({ age: 18, maxHeartRate: 201 });
    expect(await repo.get()).toMatchObject({ age: 18, maxHeartRate: 201 });
    await repo.save({ age: 18, maxHeartRate: null });
    expect((await repo.get())?.maxHeartRate).toBeNull();
  });

  it('rejects an invalid profile without saving', async () => {
    await expect(repo.save({ age: 5 })).rejects.toThrow(/age/);
    expect(await repo.get()).toBeNull();
  });
});
