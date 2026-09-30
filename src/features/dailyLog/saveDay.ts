import type { SqlDatabase } from '../../db/types';
import { BodyWeightRepository, type BodyWeightEntry } from '../bodyweight';
import { FoodEntryRepository, type DailyTotals, type FoodEntry } from '../nutrition';
import { TrainingSessionRepository, type TrainingSession } from '../training';
import type { DailyLogValues } from './form';

export interface DailyLogRepos {
  training: TrainingSessionRepository;
  food: FoodEntryRepository;
  weight: BodyWeightRepository;
}

export interface DayRecords {
  training: TrainingSession | null;
  weight: BodyWeightEntry | null;
}

export interface DayFood {
  entries: FoodEntry[];
  totals: DailyTotals;
}

export function createDailyLogRepos(db: SqlDatabase, options: { now?: () => Date } = {}): DailyLogRepos {
  return {
    training: new TrainingSessionRepository(db, options),
    food: new FoodEntryRepository(db, options),
    weight: new BodyWeightRepository(db, options),
  };
}

export async function loadDay(repos: DailyLogRepos, date: string): Promise<DayRecords> {
  const [training, weight] = await Promise.all([
    repos.training.getByDate(date),
    repos.weight.getByDate(date),
  ]);
  return { training, weight };
}

/** The day's food entries (in meal order) plus their running totals. */
export async function loadDayFood(repos: DailyLogRepos, date: string): Promise<DayFood> {
  const [entries, totals] = await Promise.all([
    repos.food.listByDate(date),
    repos.food.getDailyTotals(date),
  ]);
  return { entries, totals };
}

/**
 * Writes training and body weight for a date: creates records the first time, updates them on
 * later saves (so "Save Day" can be pressed repeatedly), and deletes a section that was cleared.
 * Food isn't part of this — each item is saved when it's added.
 */
export async function saveDay(repos: DailyLogRepos, date: string, values: DailyLogValues): Promise<DayRecords> {
  const existing = await loadDay(repos, date);

  let training = existing.training;
  if (values.training) {
    training = training
      ? await repos.training.update(training.id, values.training)
      : await repos.training.create({ date, ...values.training });
  } else if (training) {
    await repos.training.delete(training.id);
    training = null;
  }

  let weight = existing.weight;
  if (values.weightKg !== null) {
    weight = await repos.weight.log({ date, weightKg: values.weightKg });
  } else if (weight) {
    await repos.weight.delete(weight.id);
    weight = null;
  }

  return { training, weight };
}
