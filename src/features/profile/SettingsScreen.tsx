import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDatabase } from '../../db/database';
import { toLocalDateString } from '../../lib/dates';
import { ValidationError } from '../../lib/validation';
import {
  BodyWeightRepository,
  describeMaintenance,
  getMaintenanceEstimate,
  kgToDisplayLb,
  lbToKg,
  validateBodyWeight,
  WEIGHT_RANGE_LB_MESSAGE,
  type MaintenanceResult,
} from '../bodyweight';
import { ACCENT, Dropdown, Field, ON_PITCH, PITCH, Section, styles as ui, type DropdownOption } from '../dailyLog/ui';
import { FoodEntryRepository, FoodLogDayRepository } from '../nutrition';
import { explainTargets, loadBaselineTargets, type TargetsResult } from '../targets';
import { cmToFeetInches, feetInchesToCm } from './height';
import { PlayerProfileRepository } from './repository';
import type { PlayerLevel, Sex } from './types';

type ErrorField = 'age' | 'weightKg' | 'sex' | 'heightCm' | 'level' | 'maxHeartRate' | 'form';
type Errors = Partial<Record<ErrorField, string>>;

const LABELS: Record<Exclude<ErrorField, 'form'>, string> = {
  age: 'Age',
  weightKg: 'Weight',
  sex: 'Sex',
  heightCm: 'Height',
  level: 'Playing level',
  maxHeartRate: 'Max heart rate',
};

/** The stored range is 100–250 cm; shown in the units the player types. */
const HEIGHT_RANGE_MESSAGE = 'Height must be between 3 ft 4 in and 8 ft 2 in';

const SEX_OPTIONS: DropdownOption<Sex>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const LEVEL_OPTIONS: DropdownOption<PlayerLevel>[] = [
  { value: 'recreational', label: 'Recreational', hint: 'About 1–3 sessions or games a week' },
  { value: 'competitive', label: 'Competitive', hint: 'Club or academy: about 4–5 sessions a week plus a match' },
  { value: 'professional', label: 'Professional', hint: 'Full-time: training most days plus matches' },
];

interface Repos {
  profile: PlayerProfileRepository;
  weight: BodyWeightRepository;
  food: FoodEntryRepository;
  logDays: FoodLogDayRepository;
}

/** The maintenance estimate from the last 28 days of logged food and weigh-ins. */
const loadMaintenance = (r: Repos) =>
  getMaintenanceEstimate({ bodyWeight: r.weight, food: r.food, logDays: r.logDays });

/** Blank → null; accepts a comma decimal separator; garbage → NaN for the validator to reject. */
const parseNumber = (text: string) => (text.trim() === '' ? null : Number(text.trim().replace(',', '.')));

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function SettingsScreen() {
  const [repos, setRepos] = useState<Repos | null>(null);
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [weight, setWeight] = useState('');
  // The latest logged weigh-in in pounds, so saving only logs a new one when the number changed.
  const [savedWeightLb, setSavedWeightLb] = useState<number | null>(null);
  const [level, setLevel] = useState<PlayerLevel | null>(null);
  const [maxHr, setMaxHr] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // Targets for today from the saved profile; refreshed after each save.
  const [targets, setTargets] = useState<TargetsResult | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDatabase().then(
      async (db) => {
        const r: Repos = {
          profile: new PlayerProfileRepository(db),
          weight: new BodyWeightRepository(db),
          food: new FoodEntryRepository(db),
          logDays: new FoodLogDayRepository(db),
        };
        const [profile, weighIns, result, estimate] = await Promise.all([
          r.profile.get(),
          r.weight.list(), // newest first
          loadBaselineTargets(r, toLocalDateString(new Date())),
          loadMaintenance(r),
        ]);
        if (cancelled) return;
        const latestWeightLb = weighIns[0] ? kgToDisplayLb(weighIns[0].weightKg) : null;
        const height = profile?.heightCm != null ? cmToFeetInches(profile.heightCm) : null;
        setAge(profile ? String(profile.age) : '');
        setSex(profile?.sex ?? null);
        setFeet(height ? String(height.feet) : '');
        setInches(height ? String(height.inches) : '');
        setWeight(latestWeightLb !== null ? String(latestWeightLb) : '');
        setSavedWeightLb(latestWeightLb);
        setLevel(profile?.level ?? null);
        setMaxHr(profile?.maxHeartRate != null ? String(profile.maxHeartRate) : '');
        setTargets(result);
        setMaintenance(estimate);
        setRepos(r);
      },
      (e) => {
        if (!cancelled) setErrors({ form: `Couldn't open settings: ${errorMessage(e)}` });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  /** Marks the form as edited and clears that field's error. */
  function edited(field: ErrorField) {
    setSaved(false);
    setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));
  }

  async function handleSave() {
    if (!repos || saving) return;
    const today = toLocalDateString(new Date());
    const found: Errors = {};

    const parsedAge = parseNumber(age);
    if (parsedAge === null) found.age = 'Age is required';

    // Height is typed as feet and inches but stored in cm.
    const ft = parseNumber(feet);
    const inch = parseNumber(inches);
    let heightCm: number | null = null;
    if (ft !== null || inch !== null) {
      if (ft === null || !Number.isInteger(ft) || ft < 0) {
        found.heightCm = 'Enter feet as a whole number';
      } else if (inch !== null && !(inch >= 0 && inch < 12)) {
        found.heightCm = 'Inches must be from 0 to 11';
      } else {
        heightCm = feetInchesToCm({ feet: ft, inches: inch ?? 0 });
      }
    }

    // Checked up front so a bad weight can't leave the profile saved without it.
    // Typed in pounds, stored in kg.
    const weightLb = parseNumber(weight);
    const weightKg = weightLb === null ? null : lbToKg(weightLb);
    if (weightKg !== null && validateBodyWeight({ date: today, weightKg }).some((i) => i.field === 'weightKg')) {
      found.weightKg = WEIGHT_RANGE_LB_MESSAGE;
    }

    if (parsedAge === null || Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    setSaving(true);
    try {
      await repos.profile.save({ age: parsedAge, sex, heightCm, level, maxHeartRate: parseNumber(maxHr) });
      // Weight is stored as a weigh-in, the same record the Daily Log writes.
      if (weightKg !== null && weightLb !== savedWeightLb) {
        await repos.weight.log({ date: today, weightKg });
        setSavedWeightLb(weightLb);
      }
      setTargets(await loadBaselineTargets(repos, today));
      setMaintenance(await loadMaintenance(repos));
      setErrors({});
      setSaved(true);
    } catch (e) {
      if (e instanceof ValidationError) {
        const next: Errors = {};
        for (const issue of e.issues) {
          const field = issue.field as keyof typeof LABELS;
          next[field] ??=
            field === 'heightCm'
              ? HEIGHT_RANGE_MESSAGE
              : field === 'weightKg'
                ? WEIGHT_RANGE_LB_MESSAGE
                : `${LABELS[field]} ${issue.message}`;
        }
        setErrors(next);
      } else {
        setErrors({ form: `Couldn't save: ${errorMessage(e)}` });
      }
    } finally {
      setSaving(false);
    }
  }

  const parsedAge = parseNumber(age);
  const estimatedMax =
    parsedAge !== null && Number.isInteger(parsedAge) && parsedAge > 0 ? 220 - parsedAge : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.back}>
            <Text style={styles.backText}>‹ Daily Log</Text>
          </Pressable>
          <Text style={styles.title}>Player settings</Text>

          {repos ? (
            <>
              <Section title="About you">
                <Text style={ui.hint}>Used to estimate your daily calorie and macro targets.</Text>
                <View style={ui.grid}>
                  <Field
                    label="Age"
                    value={age}
                    onChangeText={(t) => {
                      setAge(t);
                      edited('age');
                    }}
                    error={errors.age}
                    keyboardType="number-pad"
                    placeholder="e.g. 17"
                  />
                  <Field
                    label="Weight (lb)"
                    value={weight}
                    onChangeText={(t) => {
                      setWeight(t);
                      edited('weightKg');
                    }}
                    error={errors.weightKg}
                    placeholder="e.g. 160"
                  />
                  <Field
                    label="Height (ft)"
                    value={feet}
                    onChangeText={(t) => {
                      setFeet(t);
                      edited('heightCm');
                    }}
                    error={errors.heightCm}
                    keyboardType="number-pad"
                    placeholder="e.g. 5"
                  />
                  <Field
                    label="Height (in)"
                    value={inches}
                    onChangeText={(t) => {
                      setInches(t);
                      edited('heightCm');
                    }}
                    placeholder="e.g. 10"
                  />
                </View>

                <View style={styles.dropdowns}>
                  <Dropdown
                    label="Sex"
                    value={sex}
                    options={SEX_OPTIONS}
                    onChange={(value) => {
                      setSex(value);
                      edited('sex');
                    }}
                    error={errors.sex}
                  />
                  <Dropdown
                    label="Playing level"
                    value={level}
                    options={LEVEL_OPTIONS}
                    onChange={(value) => {
                      setLevel(value);
                      edited('level');
                    }}
                    error={errors.level}
                  />
                </View>

                <Field
                  label="Max heart rate (optional)"
                  value={maxHr}
                  onChangeText={(t) => {
                    setMaxHr(t);
                    edited('maxHeartRate');
                  }}
                  error={errors.maxHeartRate}
                  keyboardType="number-pad"
                  placeholder={estimatedMax ? `Estimated ${estimatedMax} bpm` : 'e.g. 198'}
                  fullWidth
                />
                <Text style={ui.hint}>Only fill this in if you’ve measured it. Otherwise it’s estimated as 220 − age.</Text>

                {errors.form ? <Text style={ui.errorText}>{errors.form}</Text> : null}
                {saved ? <Text style={styles.savedText}>Saved.</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={handleSave}
                  disabled={saving}
                  style={({ pressed }) => [styles.saveButton, (pressed || saving) && styles.pressed]}
                >
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
                </Pressable>
              </Section>

              <Section title="Baseline daily targets">
                {targets ? <TargetsView result={targets} /> : <ActivityIndicator color={ACCENT} />}
              </Section>

              <Section title="Maintenance from your logs">
                {maintenance ? (
                  <MaintenanceView result={maintenance} baselineKcal={targets?.ok ? targets.targets.calories : null} />
                ) : (
                  <ActivityIndicator color={ACCENT} />
                )}
              </Section>
            </>
          ) : errors.form ? (
            <Text style={styles.loadError}>{errors.form}</Text>
          ) : (
            <ActivityIndicator color={ON_PITCH} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TargetsView({ result }: { result: TargetsResult }) {
  if (!result.ok) {
    const missing = result.missing.map((m) => (m === 'body weight' ? 'weight' : m));
    return <Text style={ui.hint}>Add your {missing.join(', ')} above and save to see your targets.</Text>;
  }

  const t = result.targets;
  const perKg = (grams: number) => `${(grams / t.weightKg).toFixed(1)} g/kg`;
  return (
    <View style={styles.gap}>
      <View style={styles.calorieBox}>
        <Text style={styles.calories}>{t.calories.toLocaleString()} kcal</Text>
        <Text style={styles.caloriesLabel}>per day to maintain weight</Text>
      </View>
      <View style={styles.macroRow}>
        <Macro label="Protein" grams={t.proteinG} detail={perKg(t.proteinG)} />
        <Macro label="Carbs" grams={t.carbsG} detail={perKg(t.carbsG)} />
        <Macro label="Fat" grams={t.fatG} detail={perKg(t.fatG)} />
      </View>
      <Text style={styles.explainTitle}>How this was calculated</Text>
      {explainTargets(t).map((line) => (
        <Text key={line.rule} style={ui.hint}>
          {line.text}
        </Text>
      ))}
      <Text style={ui.hint}>
        Based on a weight of {kgToDisplayLb(t.weightKg)} lb. These targets aren’t adjusted for match or rest
        days yet.
      </Text>
    </View>
  );
}

/** What the player's own logged food and weigh-ins say their maintenance calories are. */
function MaintenanceView({ result, baselineKcal }: { result: MaintenanceResult; baselineKcal: number | null }) {
  const difference = result.status === 'ok' && baselineKcal !== null ? result.maintenanceKcal - baselineKcal : null;
  return (
    <View style={styles.gap}>
      {result.status === 'ok' ? (
        <View style={styles.calorieBox}>
          <Text style={styles.calories}>≈ {result.maintenanceKcal.toLocaleString()} kcal</Text>
          <Text style={styles.caloriesLabel}>per day, estimated from what you logged</Text>
        </View>
      ) : null}
      {describeMaintenance(result).map((line) => (
        <Text key={line} style={ui.hint}>
          {line}
        </Text>
      ))}
      {difference !== null ? (
        <Text style={ui.hint}>
          {Math.abs(difference) < 50
            ? 'That matches your formula-based target above.'
            : `That is ${Math.abs(difference).toLocaleString()} kcal ${difference > 0 ? 'higher' : 'lower'} than your formula-based target above.`}
        </Text>
      ) : null}
      <Text style={ui.hint}>
        This compares the calories you logged with how your weight changed. It is an estimate, and it gets
        better the more days and weigh-ins you log.
      </Text>
    </View>
  );
}

function Macro({ label, grams, detail }: { label: string; grams: number; detail: string }) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValue}>{grams} g</Text>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroDetail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: PITCH },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  back: { alignSelf: 'flex-start' },
  backText: { color: ON_PITCH, fontSize: 16, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: ON_PITCH, marginTop: -8 },
  loadError: { color: ON_PITCH, fontSize: 15 },
  gap: { gap: 8 },
  explainTitle: { fontSize: 14, fontWeight: '600', color: '#3c4043', marginTop: 4 },
  dropdowns: { gap: 8, marginTop: 4 },
  savedText: { color: ACCENT, fontWeight: '600' },
  saveButton: { backgroundColor: ACCENT, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  calorieBox: { backgroundColor: '#eef7f1', borderRadius: 10, padding: 12, alignItems: 'center' },
  calories: { fontSize: 28, fontWeight: '800', color: ACCENT },
  caloriesLabel: { fontSize: 13, color: '#3c4043' },
  macroRow: { flexDirection: 'row', gap: 8 },
  macro: { flex: 1, backgroundColor: '#f4f5f7', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  macroValue: { fontSize: 18, fontWeight: '700', color: '#111' },
  macroLabel: { fontSize: 13, color: '#3c4043' },
  macroDetail: { fontSize: 11, color: '#5f6368', marginTop: 2 },
});
