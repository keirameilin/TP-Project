import {
  analyzeWorkouts,
  compareEffort,
  kcalPerHour,
  kcalPerKgPerHour,
  maxHeartRateFor,
  measuredEffort,
  zoneFor,
} from '../metrics';
import type { HeartRateSample, WorkoutInput } from '../types';

const MIN = 60_000;
const START = Date.UTC(2026, 8, 30, 17, 0);

/** Heart-rate samples every 5 s at a constant bpm for `minutes`, starting `offsetMin` into the workout. */
function steady(bpm: number, minutes: number, offsetMin = 0): HeartRateSample[] {
  return Array.from({ length: (minutes * MIN) / 5000 }, (_, i) => ({
    time: START + offsetMin * MIN + i * 5000,
    bpm,
  }));
}

const workout = (minutes: number, heartRate: HeartRateSample[], activeKcal: number | null = 600): WorkoutInput => ({
  start: START,
  end: START + minutes * MIN,
  activeKcal,
  heartRate,
});

describe('maxHeartRateFor', () => {
  it('estimates 220 − age, or uses a measured max', () => {
    expect(maxHeartRateFor({ age: 20, maxHeartRate: null })).toBe(200);
    expect(maxHeartRateFor({ age: 20, maxHeartRate: 205 })).toBe(205);
  });
});

it.each([
  [99, 0],
  [100, 1],
  [119, 1],
  [120, 2],
  [140, 3],
  [160, 4],
  [179, 4],
  [180, 5],
  [210, 5],
])('puts %p bpm (max 200) in zone %p', (bpm, zone) => {
  expect(zoneFor(bpm, 200)).toBe(zone);
});

describe('analyzeWorkouts', () => {
  it('returns null with no workouts', () => {
    expect(analyzeWorkouts([], 200)).toBeNull();
  });

  it('time-weights samples into zones and scores TRIMP', () => {
    // 30 min in zone 2 (130 bpm), then 30 min in zone 4 (170 bpm), max HR 200.
    const a = analyzeWorkouts([workout(60, [...steady(130, 30), ...steady(170, 30, 30)])], 200)!;
    expect(a.zoneMinutes).toEqual([0, 30, 0, 30, 0]);
    expect(a.trimp).toBe(30 * 2 + 30 * 4);
    expect(a.avgHeartRate).toBe(150);
    expect(a.peakHeartRate).toBe(170);
    expect(a.durationMinutes).toBe(60);
    expect(a.heartRateMinutes).toBe(60);
    expect(a.activeKcal).toBe(600);
    expect(a.maxHeartRate).toBe(200);
  });

  it('caps gaps so a watch that lost contact does not count the gap', () => {
    // One sample, then nothing for the rest of a 30-minute workout: counts for 1 minute only.
    const a = analyzeWorkouts([workout(30, [{ time: START, bpm: 170 }])], 200)!;
    expect(a.heartRateMinutes).toBe(1);
    expect(a.zoneMinutes[3]).toBe(1);
  });

  it('ignores samples outside the workout window and sorts the rest', () => {
    const samples = [...steady(170, 10)].reverse();
    samples.push({ time: START - 5 * MIN, bpm: 199 }, { time: START + 20 * MIN, bpm: 199 });
    const a = analyzeWorkouts([workout(10, samples)], 200)!;
    expect(a.peakHeartRate).toBe(170);
    expect(a.heartRateMinutes).toBe(10);
  });

  it('combines several workouts and keeps calories null when none were recorded', () => {
    const second: WorkoutInput = {
      start: START + 120 * MIN,
      end: START + 150 * MIN,
      activeKcal: null,
      heartRate: steady(150, 30, 120),
    };
    const a = analyzeWorkouts([workout(60, steady(130, 60), null), second], 200)!;
    expect(a.workoutCount).toBe(2);
    expect(a.durationMinutes).toBe(90);
    expect(a.activeKcal).toBeNull();
    expect(a.startTime).toBe(new Date(START).toISOString());
    expect(a.endTime).toBe(new Date(START + 150 * MIN).toISOString());
  });
});

describe('measuredEffort', () => {
  it('doubles the average zone onto a 1–10 scale', () => {
    expect(measuredEffort({ trimp: 60 * 4, heartRateMinutes: 60 })).toBe(8);
    expect(measuredEffort({ trimp: 60 * 2.5, heartRateMinutes: 60 })).toBe(5);
    expect(measuredEffort({ trimp: 0, heartRateMinutes: 60 })).toBe(1);
  });

  it('needs at least 5 minutes of heart-rate data', () => {
    expect(measuredEffort({ trimp: 16, heartRateMinutes: 4 })).toBeNull();
  });
});

describe('calorie rates', () => {
  it('computes kcal per hour and per kg per hour', () => {
    expect(kcalPerHour({ activeKcal: 600, durationMinutes: 90 })).toBe(400);
    expect(kcalPerKgPerHour({ activeKcal: 600, durationMinutes: 90 }, 80)).toBe(5);
  });

  it('returns null without calories, duration or weight', () => {
    expect(kcalPerHour({ activeKcal: null, durationMinutes: 90 })).toBeNull();
    expect(kcalPerHour({ activeKcal: 600, durationMinutes: 0 })).toBeNull();
    expect(kcalPerKgPerHour({ activeKcal: 600, durationMinutes: 90 }, null)).toBeNull();
  });
});

it('compares a rating with the measured effort, allowing 1 point either way', () => {
  expect(compareEffort(8, 7)).toBe('matches');
  expect(compareEffort(6, 7)).toBe('matches');
  expect(compareEffort(9, 7)).toBe('rated_higher');
  expect(compareEffort(5, 7)).toBe('rated_lower');
});
