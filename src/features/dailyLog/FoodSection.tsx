import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ValidationError } from '../../lib/validation';
import { pickFoodPhoto, requestFoodEstimate, type PhotoSource } from '../foodPhoto/photo';
import { MEAL_TYPES, type FoodEntry, type MealType } from '../nutrition';
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
import { ACCENT, Field, FieldError, Section, styles as ui } from './ui';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const kcal = (n: number) => `${Math.round(n).toLocaleString()} kcal`;
const grams = (n: number) => `${Math.round(n)}g`;
const macroLine = (m: { proteinG: number; carbsG: number; fatG: number }) =>
  `P ${grams(m.proteinG)} · C ${grams(m.carbsG)} · F ${grams(m.fatG)}`;

interface Editing {
  id: number;
  item: FoodItemForm;
  errors: FoodItemErrors;
}

/**
 * Food logged item by item. Each item is written as soon as it's added or updated (not on
 * "Save Day"), and the day's totals are summed by the data layer. Tapping an item edits it in place.
 */
export function FoodSection({ repos, date }: { repos: DailyLogRepos; date: string }) {
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

  return (
    <Section title="Food" subtitle="Items save as you add them">
      {loadError ? <Text style={ui.errorText}>{loadError}</Text> : null}
      {food ? (
        <>
          <View style={styles.totals}>
            <Text style={styles.totalsLabel}>Total eaten</Text>
            <Text style={styles.totalsKcal}>{kcal(food.totals.totals.calories)}</Text>
            <Text style={styles.totalsMacros}>{macroLine(food.totals.totals)}</Text>
          </View>

          {food.entries.length === 0 ? (
            <Text style={ui.hint}>No food logged for this day yet.</Text>
          ) : (
            <>
              <Text style={ui.hint}>Tap an item to edit it.</Text>
              {MEAL_TYPES.map((meal) => {
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
                            style={({ pressed }) => [styles.entryText, pressed && styles.pressed]}
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
                            style={styles.remove}
                          >
                            <Text style={styles.removeText}>✕</Text>
                          </Pressable>
                        </View>
                      ),
                    )}
                  </View>
                );
              })}
            </>
          )}
        </>
      ) : loadError ? null : (
        <ActivityIndicator />
      )}

      <View style={styles.addForm}>
        <Text style={styles.addTitle}>Add food</Text>
        <View style={styles.photoRow}>
          <PhotoButton label="📷 Take photo" onPress={() => handleScan('camera')} disabled={scanning || busy} />
          <PhotoButton label="🖼️ Choose photo" onPress={() => handleScan('library')} disabled={scanning || busy} />
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
            <Pressable
              accessibilityRole="button"
              onPress={openManualForm}
              disabled={scanning || busy}
              hitSlop={8}
              style={({ pressed }) => [styles.manualButton, (pressed || scanning) && styles.pressed]}
            >
              <Text style={styles.manualButtonText}>✏️ Add manually</Text>
            </Pressable>
          </>
        )}
      </View>
    </Section>
  );
}

function PhotoButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.photoButton, (pressed || disabled) && styles.pressed]}
    >
      <Text style={styles.photoButtonText}>{label}</Text>
    </Pressable>
  );
}

/** A one-line meal picker that expands into the four options when tapped. */
function MealDropdown({ value, onChange }: { value: MealType; onChange: (meal: MealType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Meal: ${MEAL_LABELS[value]}`}
        accessibilityHint="Opens the list of meals"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.dropdown, open && styles.dropdownOpen, pressed && styles.pressed]}
      >
        <Text style={styles.dropdownLabel}>Meal</Text>
        <Text style={styles.dropdownValue}>{MEAL_LABELS[value]}</Text>
        <Text style={styles.dropdownCaret}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.dropdownList}>
          {MEAL_TYPES.map((meal) => (
            <Pressable
              key={meal}
              accessibilityRole="button"
              accessibilityState={{ selected: meal === value }}
              onPress={() => {
                onChange(meal);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.dropdownOption, pressed && styles.dropdownOptionPressed]}
            >
              <Text style={[styles.dropdownOptionText, meal === value && styles.dropdownOptionSelected]}>
                {MEAL_LABELS[meal]}
              </Text>
              {meal === value ? <Text style={styles.dropdownCheck}>✓</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

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
      <MealDropdown value={item.mealType} onChange={(meal) => onChange('mealType', meal)} />
      <FieldError message={errors.mealType} />
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
        {props.onCancel ? (
          <Pressable
            accessibilityRole="button"
            onPress={props.onCancel}
            disabled={props.busy}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={props.onSubmit}
          disabled={props.busy}
          style={({ pressed }) => [styles.submitButton, (pressed || props.busy) && styles.pressed]}
        >
          {props.busy ? (
            <ActivityIndicator color={ACCENT} />
          ) : (
            <Text style={styles.submitText}>{props.submitLabel}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

const styles = StyleSheet.create({
  totals: { backgroundColor: '#eef7f1', borderRadius: 10, padding: 12, gap: 2 },
  totalsLabel: { fontSize: 13, color: '#3c4043' },
  totalsKcal: { fontSize: 24, fontWeight: '700', color: ACCENT },
  totalsMacros: { fontSize: 14, color: '#3c4043' },
  meal: { gap: 4, marginTop: 4 },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  mealTitle: { fontSize: 15, fontWeight: '600', color: '#202124' },
  mealKcal: { fontSize: 13, color: '#5f6368' },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dadce0',
  },
  entryText: { flex: 1, gap: 2, paddingVertical: 8 },
  entryName: { fontSize: 15, color: '#111' },
  entryMacros: { fontSize: 13, color: '#5f6368' },
  remove: { paddingHorizontal: 8, paddingVertical: 4 },
  removeText: { fontSize: 16, color: '#9aa0a6' },
  editCard: { borderWidth: 1.5, borderColor: ACCENT, borderRadius: 10, padding: 12, marginVertical: 4 },
  editor: { gap: 8 },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    gap: 8,
  },
  dropdownOpen: { borderColor: ACCENT, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  dropdownLabel: { fontSize: 14, color: '#5f6368' },
  dropdownValue: { flex: 1, fontSize: 16, color: '#111', fontWeight: '600' },
  dropdownCaret: { fontSize: 16, color: ACCENT },
  dropdownList: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: ACCENT,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  dropdownOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 },
  dropdownOptionPressed: { backgroundColor: '#eef7f1' },
  dropdownOptionText: { flex: 1, fontSize: 16, color: '#202124' },
  dropdownOptionSelected: { color: ACCENT, fontWeight: '700' },
  dropdownCheck: { fontSize: 16, color: ACCENT, fontWeight: '700' },
  addForm: { gap: 8, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eceef0' },
  addTitle: { fontSize: 15, fontWeight: '600', color: '#202124' },
  photoRow: { flexDirection: 'row', gap: 8 },
  photoButton: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: '#eef7f1' },
  photoButtonText: { color: ACCENT, fontSize: 15, fontWeight: '600' },
  scanning: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  manualButton: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  manualButtonText: { color: ACCENT, fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
  scanNote: { fontSize: 13, color: '#3c4043', backgroundColor: '#fff8e1', borderRadius: 8, padding: 10 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  submitButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitText: { color: ACCENT, fontSize: 16, fontWeight: '600' },
  cancelButton: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: '#eceef0' },
  cancelText: { color: '#3c4043', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
