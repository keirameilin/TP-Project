import type { SqlDatabase } from '../../db/types';
import type { HealthSource, WorkoutAnalysis, WorkoutMetrics } from './types';

interface WorkoutMetricsRow {
  date: string;
  source: HealthSource;
  workout_count: number;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  active_kcal: number | null;
  avg_heart_rate: number | null;
  peak_heart_rate: number | null;
  heart_rate_minutes: number;
  zone1_minutes: number;
  zone2_minutes: number;
  zone3_minutes: number;
  zone4_minutes: number;
  zone5_minutes: number;
  trimp: number;
  max_heart_rate: number;
  imported_at: string;
}

const COLUMNS = `date, source, workout_count, start_time, end_time, duration_minutes, active_kcal,
  avg_heart_rate, peak_heart_rate, heart_rate_minutes, zone1_minutes, zone2_minutes, zone3_minutes,
  zone4_minutes, zone5_minutes, trimp, max_heart_rate, imported_at`;

function fromRow(r: WorkoutMetricsRow): WorkoutMetrics {
  return {
    date: r.date,
    source: r.source,
    workoutCount: r.workout_count,
    startTime: r.start_time,
    endTime: r.end_time,
    durationMinutes: r.duration_minutes,
    activeKcal: r.active_kcal,
    avgHeartRate: r.avg_heart_rate,
    peakHeartRate: r.peak_heart_rate,
    heartRateMinutes: r.heart_rate_minutes,
    zoneMinutes: [r.zone1_minutes, r.zone2_minutes, r.zone3_minutes, r.zone4_minutes, r.zone5_minutes],
    trimp: r.trimp,
    maxHeartRate: r.max_heart_rate,
    importedAt: r.imported_at,
  };
}

export interface WorkoutMetricsRepositoryOptions {
  /** Injectable clock, used for timestamps. */
  now?: () => Date;
}

/** Watch metrics per day. Importing again for a date replaces the previous import. */
export class WorkoutMetricsRepository {
  private readonly now: () => Date;

  constructor(
    private readonly db: SqlDatabase,
    options: WorkoutMetricsRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async getByDate(date: string): Promise<WorkoutMetrics | null> {
    const row = await this.db.getFirstAsync<WorkoutMetricsRow>(
      `SELECT ${COLUMNS} FROM workout_metrics WHERE date = ?`,
      [date],
    );
    return row ? fromRow(row) : null;
  }

  async save(date: string, source: HealthSource, a: WorkoutAnalysis): Promise<WorkoutMetrics> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO workout_metrics (${COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        date,
        source,
        a.workoutCount,
        a.startTime,
        a.endTime,
        a.durationMinutes,
        a.activeKcal,
        a.avgHeartRate,
        a.peakHeartRate,
        a.heartRateMinutes,
        ...a.zoneMinutes,
        a.trimp,
        a.maxHeartRate,
        this.now().toISOString(),
      ],
    );
    return (await this.getByDate(date))!;
  }

  /** Returns true if metrics were deleted. */
  async delete(date: string): Promise<boolean> {
    const result = await this.db.runAsync('DELETE FROM workout_metrics WHERE date = ?', [date]);
    return result.changes > 0;
  }
}
