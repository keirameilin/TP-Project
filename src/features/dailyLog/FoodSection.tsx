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
  BORDER,
  Button,
  CARD_BORDER,
  Chip,
  Dropdown,
  FAINT,
  Field,
  FieldError,
  INK,
  INK_SOFT,
  MACRO_COLORS,
  MacroTile,
  MUTED,
  ON_PITCH,
  PAPER,
  PAPER_INK,
  ProgressBar,
  Section,
  SURFACE_ALT,
  styles as ui,
  type IconName,
} from './ui';

const MEAL_ICONS: Record<MealType, IconName> = {
  breakfast: 'cafe',
  lunch: 'fast-food',
  dinner: 'restaurant',
  snack: 'nutrition',
};

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/** Shown when the day's calories pass the target. */
const OVER_TARGET = '#fbbf24';

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
export function FoodSection(props: {
  repos: DailyLogRepos;
  date: string;
  targets: TargetsResult | null;
  /** One sentence on how the day's training set the targets. */
  targetNote?: string | null;
}) {
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

  /** Photo → AI estimate → fills the add form for the user to check before adding. */
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
      <View style={ui.section}>
        <Intake eaten={food.totals.totals} target={targets?.ok ? targets.targets : null} />
        {props.targetNote ? (
          <View style={styles.targetNote}>
            <Ionicons name="flash" size={14} color={ACCENT} />
            <Text style={[ui.hint, styles.targetNoteText]}>{props.targetNote}</Text>
          </View>
        ) : null}
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
      </View>

      <Section
        title="Meals"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add food"
            onPress={openManualForm}
            hitSlop={8}
            style={({ pressed }) => pressed && ui.dimmed}
          >
            <Text style={styles.addLink}>+ Add food</Text>
          </Pressable>
        }
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
                  <View style={styles.mealIcon}>
                    <Ionicons name={MEAL_ICONS[meal]} size={22} color={ACCENT} />
                  </View>
                  <View style={styles.mealHeaderText}>
                    <View style={styles.mealTitleRow}>
                      <Text style={styles.mealTitle}>{MEAL_LABELS[meal]}</Text>
                      <Text style={styles.mealKcal}>{kcal(food.totals.byMeal[meal].calories)}</Text>
                    </View>
                    <MacroLine macros={food.totals.byMeal[meal]} />
                  </View>
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
                          {kcal(entry.calories)} · {macroLine(entry)} · tap to edit
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${entry.foodName}`}
                        onPress={() => confirmRemove(entry)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.remove, pressed && ui.dimmed]}
                      >
                        <Ionicons name="close" size={14} color={MUTED} />
                      </Pressable>
                    </View>
                  ),
                )}
              </View>
            );
          })
        )}
      </Section>

      <Section title="Add food" subtitle="Saves as you add">
        <View style={styles.photoRow}>
          <PhotoTile
            icon="camera-outline"
            label="Take photo"
            caption="Scan your food"
            onPress={() => handleScan('camera')}
            disabled={scanning || busy}
          />
          <PhotoTile
            icon="image-outline"
            label="Choose photo"
            caption="From your gallery"
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
              variant="secondary"
              onPress={openManualForm}
              disabled={scanning || busy}
            />
          </>
        )}
      </Section>
    </>
  );
}

/** Calories with a progress bar, then protein, carbs and fat as coloured tiles; bars appear once targets exist. */
function Intake({ eaten, target }: { eaten: Macros; target: BaselineTargets | null }) {
  const remaining = target ? target.calories - Math.round(eaten.calories) : null;
  const over = remaining !== null && remaining < 0;
  const amount = (ate: number, goal?: number) => (goal ? `${Math.round(ate)} / ${goal}g` : `${Math.round(ate)} g`);
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
        <MacroTile
          macro="protein"
          label="Protein"
          value={amount(eaten.proteinG, target?.proteinG)}
          progress={target ? eaten.proteinG / target.proteinG : undefined}
        />
        <MacroTile
          macro="carbs"
          label="Carbs"
          value={amount(eaten.carbsG, target?.carbsG)}
          progress={target ? eaten.carbsG / target.carbsG : undefined}
        />
        <MacroTile
          macro="fat"
          label="Fat"
          value={amount(eaten.fatG, target?.fatG)}
          progress={target ? eaten.fatG / target.fatG : undefined}
        />
      </View>
    </View>
  );
}

/** "P 28g  C 32g  F 8g" with each letter in its macro's colour. */
function MacroLine({ macros }: { macros: { proteinG: number; carbsG: number; fatG: number } }) {
  const part = (letter: string, color: string, value: number) => (
    <Text style={styles.macroPart}>
      <Text style={{ color, fontWeight: '700' }}>{letter}</Text>
      {` ${grams(value)}`}
    </Text>
  );
  return (
    <View style={styles.macroLine} accessible accessibilityLabel={macroLine(macros)}>
      {part('P', MACRO_COLORS.protein, macros.proteinG)}
      {part('C', MACRO_COLORS.carbs, macros.carbsG)}
      {part('F', MACRO_COLORS.fat, macros.fatG)}
    </View>
  );
}

function PhotoTile(props: { icon: IconName; label: string; caption: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.caption}
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [styles.photoTile, (pressed || props.disabled) && ui.dimmed]}
    >
      <Ionicons name={props.icon} size={30} color={ACCENT} />
      <Text style={styles.photoTileText}>{props.label}</Text>
      <Text style={styles.photoTileCaption}>{props.caption}</Text>
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
  caloriesUnit: { fontSize: 15, fontWeight: '600', color: INK_SOFT },
  remaining: { fontSize: 14, fontWeight: '600', color: INK },
  macros: { flexDirection: 'row', gap: 8, marginTop: 4 },
  targetNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  targetNoteText: { flex: 1 },
  logStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  logStatusLabel: { fontSize: 14, fontWeight: '500', color: INK_SOFT },
  logStatusButtons: { flexDirection: 'row', gap: 8 },
  addLink: { fontSize: 14, fontWeight: '700', color: ACCENT },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  emptyText: { fontSize: 14, color: MUTED },
  meal: { gap: 2, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  mealIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE_ALT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  mealHeaderText: { flex: 1, gap: 2 },
  mealTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  mealTitle: { fontSize: 15, fontWeight: '700', color: INK },
  mealKcal: { fontSize: 13, fontWeight: '600', color: INK_SOFT },
  macroLine: { flexDirection: 'row', gap: 12 },
  macroPart: { fontSize: 12, color: MUTED },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 54 },
  entryText: { flex: 1, gap: 1, paddingVertical: 6 },
  entryName: { fontSize: 14, fontWeight: '600', color: INK_SOFT },
  entryMacros: { fontSize: 12, color: MUTED },
  remove: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE_ALT,
  },
  editCard: { borderWidth: 1, borderColor: ACCENT, borderRadius: 12, padding: 12, marginVertical: 6 },
  editor: { gap: 6 },
  photoRow: { flexDirection: 'row', gap: 10 },
  photoTile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 18,
    borderRadius: 12,
    backgroundColor: SURFACE_ALT,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  photoTileText: { color: INK, fontSize: 15, fontWeight: '700' },
  photoTileCaption: { color: ACCENT, fontSize: 12 },
  scanning: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  scanNote: {
    fontSize: 13,
    lineHeight: 18,
    color: PAPER_INK,
    backgroundColor: PAPER,
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
  },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
