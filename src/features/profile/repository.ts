import type { SqlDatabase } from '../../db/types';
import type { PlayerProfile, PlayerProfileInput } from './types';
import { assertValidProfile, type PlayerProfileFields } from './validation';

interface PlayerProfileRow {
  age: number;
  max_heart_rate: number | null;
  updated_at: string;
}

export interface PlayerProfileRepositoryOptions {
  /** Injectable clock, used for timestamps. */
  now?: () => Date;
}

/** The app tracks one player per device, so the profile is a single row. */
export class PlayerProfileRepository {
  private readonly now: () => Date;

  constructor(
    private readonly db: SqlDatabase,
    options: PlayerProfileRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /** Null until the player has saved their age. */
  async get(): Promise<PlayerProfile | null> {
    const row = await this.db.getFirstAsync<PlayerProfileRow>(
      'SELECT age, max_heart_rate, updated_at FROM player_profile WHERE id = 1',
      [],
    );
    return row ? { age: row.age, maxHeartRate: row.max_heart_rate, updatedAt: row.updated_at } : null;
  }

  async save(input: PlayerProfileInput): Promise<PlayerProfile> {
    const fields: PlayerProfileFields = { age: input.age, maxHeartRate: input.maxHeartRate ?? null };
    assertValidProfile(fields);

    await this.db.runAsync(
      `INSERT INTO player_profile (id, age, max_heart_rate, updated_at) VALUES (1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         age = excluded.age, max_heart_rate = excluded.max_heart_rate, updated_at = excluded.updated_at`,
      [fields.age, fields.maxHeartRate, this.now().toISOString()],
    );
    return (await this.get())!;
  }
}
