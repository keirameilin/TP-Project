import { toLocalDateString } from '../../lib/dates';
import type { SqlDatabase } from '../../db/types';
import {
  MEAL_TYPES,
  type DailyCalories,
  type DailyTotals,
  type FoodEntry,
  type FoodEntryPatch,
  type Macros,
  type MealType,
  type NewFoodEntry,
} from './types';
import { assertValidFoodEntry, type FoodEntryFields } from './validation';

interface FoodEntryRow {
  id: number;
  date: string;
  meal_type: MealType;
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  'id, date, meal_type, food_name, calories, protein_g, carbs_g, fat_g, created_at, updated_at';

/** Sorts entries within a day by meal (breakfast → snack), then by when they were logged. */
const MEAL_ORDER_SQL = `CASE meal_type ${MEAL_TYPES.map((m, i) => `WHEN '${m}' THEN ${i}`).join(' ')} END`;

function fromRow(row: FoodEntryRow): FoodEntry {
  return {
    id: row.id,
    date: row.date,
    mealType: row.meal_type,
    foodName: row.food_name,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const zeroMacros = (): Macros => ({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });

/** Rounds away floating-point noise from summing REAL columns (e.g. 0.1 + 0.2). */
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface FoodEntryRepositoryOptions {
  /** Injectable clock, used for the default date and timestamps. */
  now?: () => Date;
}

export class FoodEntryRepository {
  private readonly now: () => Date;

  constructor(
    private readonly db: SqlDatabase,
    options: FoodEntryRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async create(input: NewFoodEntry): Promise<FoodEntry> {
    const fields: FoodEntryFields = {
      date: input.date ?? toLocalDateString(this.now()),
      mealType: input.mealType,
      foodName: input.foodName?.trim(),
      calories: input.calories,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
    };
    assertValidFoodEntry(fields);

    const timestamp = this.now().toISOString();
    const result = await this.db.runAsync(
      `INSERT INTO food_entries
         (date, meal_type, food_name, calories, protein_g, carbs_g, fat_g, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fields.date,
        fields.mealType,
        fields.foodName,
        fields.calories,
        fields.proteinG,
        fields.carbsG,
        fields.fatG,
        timestamp,
        timestamp,
      ],
    );
    return (await this.getById(result.lastInsertRowId))!;
  }

  async getById(id: number): Promise<FoodEntry | null> {
    const row = await this.db.getFirstAsync<FoodEntryRow>(
      `SELECT ${COLUMNS} FROM food_entries WHERE id = ?`,
      [id],
    );
    return row ? fromRow(row) : null;
  }

  /** All entries for one day, in meal order. */
  async listByDate(date: string): Promise<FoodEntry[]> {
    return this.list({ from: date, to: date });
  }

  /** Lists entries newest day first (meal order within a day), optionally limited to an inclusive date range. */
  async list(range: { from?: string; to?: string } = {}): Promise<FoodEntry[]> {
    const rows = await this.db.getAllAsync<FoodEntryRow>(
      `SELECT ${COLUMNS} FROM food_entries
       WHERE (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)
       ORDER BY date DESC, ${MEAL_ORDER_SQL}, id`,
      [range.from ?? null, range.from ?? null, range.to ?? null, range.to ?? null],
    );
    return rows.map(fromRow);
  }

  /** Sums calories and macros for a day, overall and per meal. Days with no entries return zeros. */
  async getDailyTotals(date: string): Promise<DailyTotals> {
    const rows = await this.db.getAllAsync<{
      meal_type: MealType;
      entry_count: number;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    }>(
      `SELECT meal_type, COUNT(*) AS entry_count, SUM(calories) AS calories,
              SUM(protein_g) AS protein_g, SUM(carbs_g) AS carbs_g, SUM(fat_g) AS fat_g
       FROM food_entries WHERE date = ? GROUP BY meal_type`,
      [date],
    );

    const byMeal = Object.fromEntries(MEAL_TYPES.map((m) => [m, zeroMacros()])) as Record<
      MealType,
      Macros
    >;
    const totals = zeroMacros();
    let entryCount = 0;

    for (const row of rows) {
      byMeal[row.meal_type] = {
        calories: round1(row.calories),
        proteinG: round1(row.protein_g),
        carbsG: round1(row.carbs_g),
        fatG: round1(row.fat_g),
      };
      totals.calories += row.calories;
      totals.proteinG += row.protein_g;
      totals.carbsG += row.carbs_g;
      totals.fatG += row.fat_g;
      entryCount += row.entry_count;
    }

    return {
      date,
      entryCount,
      totals: {
        calories: round1(totals.calories),
        proteinG: round1(totals.proteinG),
        carbsG: round1(totals.carbsG),
        fatG: round1(totals.fatG),
      },
      byMeal,
    };
  }

  /**
   * Total calories per day over an inclusive date range, oldest first.
   * Only days with at least one entry are returned — an unlogged day is unknown, not zero.
   */
  async getDailyCalories(range: { from: string; to: string }): Promise<DailyCalories[]> {
    const rows = await this.db.getAllAsync<DailyCalories>(
      `SELECT date, SUM(calories) AS calories FROM food_entries
       WHERE date >= ? AND date <= ?
       GROUP BY date ORDER BY date`,
      [range.from, range.to],
    );
    return rows.map((r) => ({ date: r.date, calories: round1(r.calories) }));
  }

  /**
   * Applies a partial update; the merged result is re-validated as a whole.
   * Returns null if the entry does not exist.
   */
  async update(id: number, patch: FoodEntryPatch): Promise<FoodEntry | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const fields: FoodEntryFields = {
      date: patch.date ?? existing.date,
      mealType: patch.mealType ?? existing.mealType,
      foodName: patch.foodName !== undefined ? patch.foodName?.trim() : existing.foodName,
      calories: patch.calories ?? existing.calories,
      proteinG: patch.proteinG ?? existing.proteinG,
      carbsG: patch.carbsG ?? existing.carbsG,
      fatG: patch.fatG ?? existing.fatG,
    };
    assertValidFoodEntry(fields);

    await this.db.runAsync(
      `UPDATE food_entries
       SET date = ?, meal_type = ?, food_name = ?, calories = ?, protein_g = ?, carbs_g = ?,
           fat_g = ?, updated_at = ?
       WHERE id = ?`,
      [
        fields.date,
        fields.mealType,
        fields.foodName,
        fields.calories,
        fields.proteinG,
        fields.carbsG,
        fields.fatG,
        this.now().toISOString(),
        id,
      ],
    );
    return this.getById(id);
  }

  /** Returns true if an entry was deleted. */
  async delete(id: number): Promise<boolean> {
    const result = await this.db.runAsync('DELETE FROM food_entries WHERE id = ?', [id]);
    return result.changes > 0;
  }
}
