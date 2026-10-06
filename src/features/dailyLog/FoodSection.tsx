import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ValidationError } from '../../lib/validation';
import { pickFoodPhoto, requestFoodEstimate, type PhotoSource } from '../foodPhoto/photo';
import { MEAL_TYPES, type FoodEntry, type LogDayStatus, type Macros, type MealType } from '../nutrition';
import type { BaselineTargets, TargetsResult } from '../targets';
import {
  defaultMealType,
  emptyFoodItem,
  foodItemFromEntry,
  foodItemFromEstimate,
  issuesToErrors,
  parseFoodItem,
  type FoodItemErrors,
  type FoodItemField,
  type FoodItemForm,
} from './form';
import { loadDayFood, type DailyLogRepos, type DayFood } from './saveDay';
import {
  ACCENT,
  ACCENT_TINT,
  BORDER,
  Button,
  Chip,
  Dropdown,
  FAINT,
  Field,
  FieldError,
  INK,
  INK_SOFT,
  MACRO_COLORS,
  MUTED,
  ON_PITCH,
  ProgressBar,
  Section,
  SURFACE_ALT,
  styles as ui,
  type IconName,
} from './ui';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/** Shown when the day's calories pass the target. */
const OVER_TARGET = '#d97706';

const whole = (n: number) => Math.round(n).toLocaleString();
const kcal = (n: number) => `${whole(n)} kcal`;
const grams = (n: number) => `${Math.round(n)}g`;
const macroLine = (m: { proteinG: number; carbsG: number; fatG: number }) =>
  `P ${grams(m.proteinG)} · C ${grams(m.carbsG)} · F ${grams(m.fatG)}`;

interface Editing {
  id: number;
  item: FoodItemForm;
  errors: FoodItemErrors;
}

/**
 * The day's food as three cards: intake against targets, the items by meal, and adding food.
 * Each item is written as soon as it's added or updated, and the totals are summed by the data
 * layer. Tapping an item edits it in place.
 */
export function FoodSection(props: { repos: DailyLogRepos; date: string; targets: TargetsResult | null }) {
  const { repos, date, targets } = props;
  const [food, setFood] = useState<DayFood | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [item, setItem] = useState<FoodItemForm>(() => emptyFoodItem(defaultMealType(new Date())));
  const [errors, setErrors] = useState<FoodItemErrors>({});
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Shown under the photo buttons after an estimate fills the form.
  const [scanNote, setScanNote] = useState<string | null>(null);
  // The add form stays hidden until a photo estimate fills it or the user picks "Add manually".
  const [formOpen, setFormOpen] = useState(false);

  const refresh = useCallback(async () => {
    setFood(await loadDayFood(repos, date));
  }, [repos, date]);

  useEffect(() => {
    let cancelled = false;
    loadDayFood(repos, date).then(
      (loaded) => {
        if (!cancelled) setFood(loaded);
      },
      (e) => {
        if (!cancelled) setLoadError(`Couldn't load food: ${errorMessage(e)}`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repos, date]);

  function updateNew<K extends keyof FoodItemForm>(key: K, value: FoodItemForm[K]) {
    setItem((i) => ({ ...i, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  }

  function updateEditing<K extends keyof FoodItemForm>(key: K, value: FoodItemForm[K]) {
    setEditing((ed) =>
      ed && { ...ed, item: { ...ed.item, [key]: value }, errors: { ...ed.errors, [key]: undefined, form: undefined } },
    );
  }

  /**
   * Validates and writes one item (create when `id` is null, else update). Returns the errors to
   * show, or null on success.
   */
  async function submit(form: FoodItemForm, id: number | null): Promise<FoodItemErrors | null> {
    const { entry, errors: found } = parseFoodItem(form, date);
    if (Object.keys(found).length > 0) return found;

    setBusy(true);
    try {
      if (id === null) {
        await repos.food.create(entry);
      } else if (!(await repos.food.update(id, entry))) {
        await refresh();
        return { form: 'This item no longer exists.' };
      }
      await refresh();
      return null;
    } catch (e) {
      return e instanceof ValidationError
        ? issuesToErrors<FoodItemField>(e.issues)
        : { form: `Couldn't save food: ${errorMessage(e)}` };
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    if (busy) return;
    const found = await submit(item, null);
    if (found) {
      setErrors(found);
    } else {
      closeForm();
    }
  }

  function openManualForm() {
    setItem(emptyFoodItem(item.mealType));
    setErrors({});
    setScanNote(null);
    setFormOpen(true);
  }

  /** Back to the photo buttons. Keeps the meal selected — people usually log several items per meal. */
  function closeForm() {
    setItem(emptyFoodItem(item.mealType));
    setErrors({});
    setScanNote(null);
    setFormOpen(false);
  }

  /** Marks the day's food log complete or incomplete; tapping the current mark clears it. */
  async function markLog(status: LogDayStatus) {
    if (!food) return;
    try {
      await repos.logDays.setStatus(date, food.logStatus === status ? null : status);
      await refresh();
    } catch (e) {
      setErrors({ form: `Couldn't update the day: ${errorMessage(e)}` });
    }
  }

  /** Photo → Claude estimate → fills the add form for the user to check before adding. */
  async function handleScan(source: PhotoSource) {
    if (scanning || busy) return;
    setScanning(true);
    setErrors({});
    setScanNote(null);
    try {
      const image = await pickFoodPhoto(source);
      if (!image) return;
      const estimate = await requestFoodEstimate(image);
      setItem((current) => foodItemFromEstimate(estimate, current.mealType));
      setScanNote(
        `Estimated from photo${estimate.portion ? ` (${estimate.portion})` : ''}. Check the numbers, then tap Add food.`,
      );
      setFormOpen(true);
    } catch (e) {
      setErrors({ form: errorMessage(e) });
    } finally {
      setScanning(false);
    }
  }

  async function handleUpdate() {
    if (busy || !editing) return;
    const found = await submit(editing.item, editing.id);
    setEditing(found ? { ...editing, errors: found } : null);
  }

  function startEditing(entry: FoodEntry) {
    setEditing({ id: entry.id, item: foodItemFromEntry(entry), errors: {} });
  }

  function confirmRemove(entry: FoodEntry) {
    Alert.alert(`Remove ${entry.foodName}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await repos.food.delete(entry.id);
            setEditing((ed) => (ed?.id === entry.id ? null : ed));
            await refresh();
          } catch (e) {
            setErrors({ form: `Couldn't remove food: ${errorMessage(e)}` });
          }
        },
      },
    ]);
  }

  if (loadError) return <Text style={ui.onPitchText}>{loadError}</Text>;
  if (!food) return <ActivityIndicator color={ON_PITCH} style={styles.loading} />;

  return (
    <>
      <Section title="Intake" icon="flame">
        <Intake eaten={food.totals.totals} target={targets?.ok ? targets.targets : null} />
        {targets && !targets.ok ? (
          <Button
            label="Set up your daily targets"
            variant="secondary"
            icon="person"
            onPress={() => router.push('/player')}
          />
        ) : null}

        <View style={styles.logStatus}>
          <Text style={styles.logStatusLabel}>Is everything you ate logged?</Text>
          <View style={styles.logStatusButtons}>
            <Chip label="Complete" selected={food.logStatus === 'complete'} onPress={() => markLog('complete')} />
            <Chip
              label="Incomplete"
              selected={food.logStatus === 'incomplete'}
              onPress={() => markLog('incomplete')}
            />
          </View>
        </View>
        {food.logStatus === 'incomplete' ? (
          <Text style={ui.hint}>This day is left out of your maintenance estimate.</Text>
        ) : null}
      </Section>

      <Section
        title="Meals"
        icon="restaurant"
        subtitle={food.entries.length > 0 ? 'Tap an item to edit' : undefined}
      >
        {food.entries.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="restaurant-outline" size={28} color={FAINT} />
            <Text style={styles.emptyText}>Nothing logged for this day yet</Text>
          </View>
        ) : (
          MEAL_TYPES.map((meal) => {
            const entries = food.entries.filter((e) => e.mealType === meal);
            if (entries.length === 0) return null;
            return (
              <View key={meal} style={styles.meal}>
                <View style={styles.mealHeader}>
                  <Text style={styles.mealTitle}>{MEAL_LABELS[meal]}</Text>
                  <Text style={styles.mealKcal}>{kcal(food.totals.byMeal[meal].calories)}</Text>
                </View>
                {entries.map((entry) =>
                  editing?.id === entry.id ? (
                    <View key={entry.id} style={styles.editCard}>
                      <FoodItemEditor
                        item={editing.item}
                        errors={editing.errors}
                        onChange={updateEditing}
                        onSubmit={handleUpdate}
                        submitLabel="Update"
                        busy={busy}
                        onCancel={() => setEditing(null)}
                      />
                    </View>
                  ) : (
                    <View key={entry.id} style={styles.entry}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${entry.foodName}`}
                        onPress={() => startEditing(entry)}
                        style={({ pressed }) => [styles.entryText, pressed && ui.dimmed]}
                      >
                        <Text style={styles.entryName}>{entry.foodName}</Text>
                        <Text style={styles.entryMacros}>
                          {kcal(entry.calories)} · {macroLine(entry)}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${entry.foodName}`}
                        onPress={() => confirmRemove(entry)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.remove, pressed && ui.dimmed]}
                      >
                        <Ionicons name="close" size={16} color={MUTED} />
                      </Pressable>
                    </View>
                  ),
                )}
              </View>
            );
          })
        )}
      </Section>

      <Section title="Add food" icon="add-circle" subtitle="Saves as you add">
        <View style={styles.photoRow}>
          <PhotoTile
            icon="camera"
            label="Take photo"
            onPress={() => handleScan('camera')}
            disabled={scanning || busy}
          />
          <PhotoTile
            icon="images"
            label="Choose photo"
            onPress={() => handleScan('library')}
            disabled={scanning || busy}
          />
        </View>
        {scanning ? (
          <View style={styles.scanning}>
            <ActivityIndicator color={ACCENT} />
            <Text style={ui.hint}>Estimating macros from your photo…</Text>
          </View>
        ) : null}
        {scanNote ? <Text style={styles.scanNote}>{scanNote}</Text> : null}
        {formOpen ? (
          <FoodItemEditor
            item={item}
            errors={errors}
            onChange={updateNew}
            onSubmit={handleAdd}
            submitLabel="Add food"
            busy={busy}
            onCancel={closeForm}
          />
        ) : (
          <>
            {/* Photo errors would otherwise live inside the hidden form. */}
            <FieldError message={errors.form} />
            <Button
              label="Add manually"
              variant="quiet"
              icon="create-outline"
              onPress={openManualForm}
              disabled={scanning || busy}
            />
          </>
        )}
      </Section>
    </>
  );
}

/** Calories with a progress bar, then protein, carbs and fat side by side; bars appear once targets exist. */
function Intake({ eaten, target }: { eaten: Macros; target: BaselineTargets | null }) {
  const remaining = target ? target.calories - Math.round(eaten.calories) : null;
  const over = remaining !== null && remaining < 0;
  return (
    <View style={styles.intake}>
      <View style={styles.caloriesRow}>
        <Text style={styles.caloriesValue}>{whole(eaten.calories)}</Text>
        <Text style={styles.caloriesUnit}>{target ? `of ${target.calories.toLocaleString()} kcal` : 'kcal eaten'}</Text>
      </View>
      {target ? (
        <>
          <ProgressBar
            progress={eaten.calories / target.calories}
            color={over ? OVER_TARGET : ACCENT}
            height={10}
            label="Calories eaten against target"
            max={target.calories}
            now={Math.round(eaten.calories)}
          />
          <Text style={[styles.remaining, over && { color: OVER_TARGET }]}>
            {over ? `${whole(-remaining)} kcal over your target` : `${whole(remaining ?? 0)} kcal left`}
          </Text>
        </>
      ) : null}
      <View style={styles.macros}>
        <MacroStat label="Protein" color={MACRO_COLORS.protein} eaten={eaten.proteinG} target={target?.proteinG} />
        <MacroStat label="Carbs" color={MACRO_COLORS.carbs} eaten={eaten.carbsG} target={target?.carbsG} />
        <MacroStat label="Fat" color={MACRO_COLORS.fat} eaten={eaten.fatG} target={target?.fatG} />
      </View>
    </View>
  );
}

function MacroStat(props: { label: string; color: string; eaten: number; target?: number }) {
  const { eaten, target } = props;
  return (
    <View
      style={styles.macro}
      accessible
      accessibilityLabel={`${props.label}: ${Math.round(eaten)} grams${target ? ` of ${target}` : ''}`}
    >
      <View style={styles.macroLabelRow}>
        <View style={[styles.macroDot, { backgroundColor: props.color }]} />
        <Text style={styles.macroLabel}>{props.label}</Text>
      </View>
      <Text style={styles.macroValue}>
        {Math.round(eaten)}
        <Text style={styles.macroTarget}>{target ? ` / ${target} g` : ' g'}</Text>
      </Text>
      {target ? <ProgressBar progress={eaten / target} color={props.color} height={6} /> : null}
    </View>
  );
}

function PhotoTile(props: { icon: IconName; label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [styles.photoTile, (pressed || props.disabled) && ui.dimmed]}
    >
      <Ionicons name={props.icon} size={26} color={ACCENT} />
      <Text style={styles.photoTileText}>{props.label}</Text>
    </Pressable>
  );
}

const MEAL_OPTIONS = MEAL_TYPES.map((meal) => ({ value: meal, label: MEAL_LABELS[meal] }));

function FoodItemEditor(props: {
  item: FoodItemForm;
  errors: FoodItemErrors;
  onChange: <K extends keyof FoodItemForm>(key: K, value: FoodItemForm[K]) => void;
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
  onCancel?: () => void;
}) {
  const { item, errors, onChange } = props;
  return (
    <View style={styles.editor}>
      <Dropdown
        label="Meal"
        value={item.mealType}
        options={MEAL_OPTIONS}
        onChange={(meal) => onChange('mealType', meal)}
        error={errors.mealType}
      />
      <View style={ui.grid}>
        <Field
          label="Food"
          value={item.foodName}
          onChangeText={(t) => onChange('foodName', t)}
          error={errors.foodName}
          placeholder="e.g. Chicken wrap"
          keyboardType="default"
          fullWidth
        />
        <Field
          label="Calories (kcal)"
          value={item.calories}
          onChangeText={(t) => onChange('calories', t)}
          error={errors.calories}
        />
        <Field
          label="Protein (g)"
          value={item.protein}
          onChangeText={(t) => onChange('protein', t)}
          error={errors.protein}
        />
        <Field label="Carbs (g)" value={item.carbs} onChangeText={(t) => onChange('carbs', t)} error={errors.carbs} />
        <Field label="Fat (g)" value={item.fat} onChangeText={(t) => onChange('fat', t)} error={errors.fat} />
      </View>
      <FieldError message={errors.form} />
      <View style={styles.buttons}>
        {props.onCancel ? <Button label="Cancel" variant="quiet" onPress={props.onCancel} disabled={props.busy} /> : null}
        <Button label={props.submitLabel} onPress={props.onSubmit} busy={props.busy} grow />
      </View>
    </View>
  );
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

const styles = StyleSheet.create({
  loading: { marginTop: 24 },
  intake: { gap: 8 },
  caloriesRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  caloriesValue: { fontSize: 40, fontWeight: '800', letterSpacing: -1, color: INK },
  caloriesUnit: { fontSize: 15, fontWeight: '600', color: MUTED },
  remaining: { fontSize: 14, fontWeight: '600', color: ACCENT },
  macros: { flexDirection: 'row', gap: 10, marginTop: 6 },
  macro: { flex: 1, gap: 6, backgroundColor: SURFACE_ALT, borderRadius: 14, padding: 12 },
  macroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroLabel: { fontSize: 13, fontWeight: '600', color: INK_SOFT },
  macroValue: { fontSize: 18, fontWeight: '800', color: INK },
  macroTarget: { fontSize: 12, fontWeight: '500', color: MUTED },
  logStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  logStatusLabel: { fontSize: 14, fontWeight: '500', color: INK_SOFT },
  logStatusButtons: { flexDirection: 'row', gap: 8 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  emptyText: { fontSize: 14, color: MUTED },
  meal: { gap: 2, marginTop: 4 },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 },
  mealTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: MUTED },
  mealKcal: { fontSize: 13, fontWeight: '600', color: MUTED },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  entryText: { flex: 1, gap: 2, paddingVertical: 10 },
  entryName: { fontSize: 16, fontWeight: '600', color: INK },
  entryMacros: { fontSize: 13, color: MUTED },
  remove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE_ALT,
  },
  editCard: { borderWidth: 1.5, borderColor: ACCENT, borderRadius: 14, padding: 12, marginVertical: 6 },
  editor: { gap: 6 },
  photoRow: { flexDirection: 'row', gap: 10 },
  photoTile: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: ACCENT_TINT,
  },
  photoTileText: { color: ACCENT, fontSize: 15, fontWeight: '700' },
  scanning: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanNote: { fontSize: 13, lineHeight: 18, color: '#713f12', backgroundColor: '#fef9c3', borderRadius: 12, padding: 12 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
