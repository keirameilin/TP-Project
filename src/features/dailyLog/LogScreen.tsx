import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ValidationError } from '../../lib/validation';
import { kgToDisplayLb } from '../bodyweight';
import { sessionCalories, sessionEffort, type PlayerInput } from '../intensity/effort';
import {
  CALORIES_SOURCE_LABELS,
  describeCalories,
  describeEffort,
  EFFORT_SOURCE_LABELS,
} from '../intensity/sessionText';
import { describePlan, type PlannedSession } from '../planning';
import { weightForDate } from '../targets';
import { RPE_MAX, RPE_MIN, SESSION_OPTIONS, type TrainingSession } from '../training';
import { DateNav } from './DateNav';
import {
  EMPTY_FORM,
  formFromRecords,
  issuesToErrors,
  parseForm,
  type DailyLogForm,
  type FormErrors,
  type FormField,
} from './form';
import { loadDay, saveDay, type DailyLogRepos } from './saveDay';
import { useSelectedDate } from './SelectedDate';
import { useDailyLogRepos } from './useDailyLogRepos';
import {
  ACCENT,
  ACCENT_TINT,
  Button,
  Chip,
  ERROR,
  Field,
  FieldError,
  INK,
  INK_SOFT,
  MUTED,
  ON_PITCH,
  Screen,
  Section,
  SURFACE_ALT,
  styles as ui,
} from './ui';

const RPE_VALUES = Array.from({ length: RPE_MAX - RPE_MIN + 1 }, (_, i) => RPE_MIN + i);

/** A word for each effort rating, shown next to the number the player picked. */
function effortWord(rpe: number): string {
  if (rpe <= 2) return 'Very easy';
  if (rpe <= 4) return 'Easy';
  if (rpe <= 6) return 'Moderate';
  if (rpe <= 8) return 'Hard';
  if (rpe === 9) return 'Very hard';
  return 'Max effort';
}

/** A word for each session rating, shown next to the number the player picked. */
function qualityWord(quality: number): string {
  if (quality <= 2) return 'Very poor';
  if (quality <= 4) return 'Poor';
  if (quality <= 6) return 'OK';
  if (quality <= 8) return 'Good';
  if (quality === 9) return 'Very good';
  return 'Excellent';
}

type Status = { kind: 'saved' | 'error'; text: string } | null;

const openReview = (date: string) => router.push({ pathname: '/review', params: { date } });

/** Used until the profile and weight have loaded: only the player's own rating can be shown. */
const UNKNOWN_PLAYER: PlayerInput = { age: null, sex: null, maxHeartRate: null, weightKg: null };

/** The Log tab: the selected day's training and body weight, saved together with "Save Day". */
export default function LogScreen() {
  const { date } = useSelectedDate();
  const { repos, error } = useDailyLogRepos();
  return (
    <Screen title="Daily Log">
      <DateNav />
      {error ? (
        <Text style={ui.onPitchText}>{`Couldn't open your log: ${error}`}</Text>
      ) : !repos ? (
        <ActivityIndicator color={ON_PITCH} style={styles.loading} />
      ) : (
        // Keyed by date so switching days starts from a clean form with no stale errors.
        <DayForm key={date} repos={repos} date={date} />
      )}
    </Screen>
  );
}

function DayForm({ repos, date }: { repos: DailyLogRepos; date: string }) {
  const [form, setForm] = useState<DailyLogForm>(EMPTY_FORM);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);
  // State updates land on the next render, so a fast double tap could slip past `saving`.
  const savingRef = useRef(false);
  // The weight as last read from the database. If the field still shows it, the player hasn't
  // edited it, so a newer weight saved on the Player tab must win over this one.
  const [pristineWeight, setPristineWeight] = useState('');
  // What was planned for this day, if anything; the plan itself is edited on the Plan tab.
  const [plan, setPlan] = useState<PlannedSession | null>(null);
  // The session as stored, and what is known about the player: the summary is worked out from these.
  const [savedTraining, setSavedTraining] = useState<TrainingSession | null>(null);
  const [player, setPlayer] = useState<PlayerInput>(UNKNOWN_PLAYER);

  /** Age, sex and max heart rate from the profile, and the weigh-in that applies to this day. */
  const readPlayer = useCallback(async (): Promise<PlayerInput> => {
    const [profile, weightKg] = await Promise.all([repos.profile.get(), weightForDate(repos.weight, date)]);
    return {
      age: profile?.age ?? null,
      sex: profile?.sex ?? null,
      maxHeartRate: profile?.maxHeartRate ?? null,
      weightKg,
    };
  }, [repos, date]);

  useEffect(() => {
    let cancelled = false;
    loadDay(repos, date).then(
      (records) => {
        if (cancelled) return;
        setSavedTraining(records.training);
        const loadedForm = formFromRecords(records);
        setForm(loadedForm);
        setPristineWeight(loadedForm.weight);
        setLoaded(true);
      },
      (e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repos, date]);

  /** The day's weigh-in as the form shows it. */
  const readWeightText = useCallback(async () => {
    const entry = await repos.weight.getByDate(date);
    return entry ? String(kgToDisplayLb(entry.weightKg)) : '';
  }, [repos, date]);

  // Runs on focus too, so a plan added on the Plan tab, or a weight saved on the Player tab,
  // shows up on return.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      repos.planned.getByDate(date).then(
        (planned) => {
          if (!cancelled) setPlan(planned);
        },
        () => {
          if (!cancelled) setPlan(null);
        },
      );
      readPlayer().then(
        (current) => {
          if (!cancelled) setPlayer(current);
        },
        () => {
          // Keep what is shown.
        },
      );
      readWeightText().then(
        (current) => {
          if (cancelled) return;
          // Leave the field alone if the player has started editing it.
          setForm((f) => (f.weight === pristineWeight ? { ...f, weight: current } : f));
          setPristineWeight(current);
        },
        () => {
          // Keep what is shown.
        },
      );
      return () => {
        cancelled = true;
      };
    }, [repos, date, readWeightText, readPlayer, pristineWeight]),
  );

  /** Copies the day's plan into the training form; the player still adds effort and saves. */
  function logAsPlanned() {
    if (!plan) return;
    setForm((f) => ({
      ...f,
      sessionType: plan.sessionType,
      duration: plan.expectedDurationMinutes === null ? f.duration : String(plan.expectedDurationMinutes),
    }));
    setErrors((e) => ({ ...e, sessionType: undefined, duration: undefined, form: undefined }));
    setStatus(null);
  }

  function update<K extends keyof DailyLogForm>(key: K, value: DailyLogForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    // "Enter a heart rate or calories" sits under the heart rate but is answered by either field.
    const alsoClears = key === 'caloriesBurned' || key === 'effortInput' ? { avgHeartRate: undefined } : {};
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined, ...alsoClears }));
    setStatus(null);
  }

  async function handleSave() {
    if (savingRef.current || !loaded) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // An untouched weight field may be out of date; save what's stored now rather than overwrite it.
      const toSave =
        form.weight === pristineWeight ? { ...form, weight: await readWeightText().catch(() => form.weight) } : form;
      const { values, errors: found } = parseForm(toSave, date);
      setErrors(found);
      if (Object.keys(found).length > 0) {
        setStatus({ kind: 'error', text: found.form ?? 'Fix the highlighted fields and try again.' });
        return;
      }

      const records = await saveDay(repos, date, values);
      setSavedTraining(records.training);
      // A new weigh-in changes the calorie estimates.
      setPlayer(await readPlayer().catch(() => player));
      const savedForm = formFromRecords(records);
      setForm(savedForm);
      setPristineWeight(savedForm.weight);
      setStatus({ kind: 'saved', text: 'Day saved' });
    } catch (e) {
      if (e instanceof ValidationError) {
        const mapped = issuesToErrors<FormField>(e.issues);
        setErrors(mapped);
        setStatus({ kind: 'error', text: mapped.form ?? 'Fix the highlighted fields and try again.' });
      } else {
        setStatus({ kind: 'error', text: `Couldn't save: ${e instanceof Error ? e.message : String(e)}` });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loadError) return <Text style={ui.onPitchText}>{`Couldn't open this day: ${loadError}`}</Text>;
  if (!loaded) return <ActivityIndicator color={ON_PITCH} style={styles.loading} />;

  const isRest = form.sessionType === 'rest_day';
  const selectedHint = SESSION_OPTIONS.find((o) => o.type === form.sessionType)?.hint;

  return (
    <>
      <Section title="Training" icon="football">
        {plan ? (
          <View style={styles.planBox}>
            <Ionicons name="calendar" size={20} color={ACCENT} />
            <View style={styles.planBoxText}>
              <Text style={styles.planLabel}>Planned</Text>
              <Text style={styles.planValue}>{describePlan(plan)}</Text>
              {plan.notes ? <Text style={ui.hint}>{plan.notes}</Text> : null}
            </View>
            {form.sessionType !== plan.sessionType ? (
              <Pressable
                accessibilityRole="button"
                onPress={logAsPlanned}
                style={({ pressed }) => [styles.planButton, pressed && ui.dimmed]}
              >
                <Text style={styles.planButtonText}>Log as planned</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.tiles}>
          {SESSION_OPTIONS.map((o) => {
            const selected = form.sessionType === o.type;
            return (
              <Pressable
                key={o.type}
                accessibilityRole="button"
                accessibilityLabel={o.label}
                accessibilityHint={o.hint}
                accessibilityState={{ selected }}
                // Tapping the selected type again clears the section.
                onPress={() => update('sessionType', selected ? null : o.type)}
                style={({ pressed }) => [styles.tile, selected && styles.tileSelected, pressed && ui.dimmed]}
              >
                <Ionicons name={o.icon} size={22} color={selected ? '#fff' : ACCENT} />
                <Text style={[styles.tileText, selected && styles.tileTextSelected]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {selectedHint ? <Text style={ui.hint}>{selectedHint}</Text> : null}
        <FieldError message={errors.sessionType} />

        {form.sessionType && !isRest ? (
          <>
            <Field
              label="Duration (minutes)"
              value={form.duration}
              onChangeText={(t) => update('duration', t)}
              error={errors.duration}
              keyboardType="number-pad"
              placeholder="e.g. 90"
              fullWidth
            />
            <Text style={[ui.label, styles.effortLabel]}>How hard was it? (effort)</Text>
            <View style={styles.effortChoice}>
              <Chip
                label="Rate it myself"
                selected={form.effortInput === 'rating'}
                onPress={() => update('effortInput', 'rating')}
              />
              <Chip
                label="Use my watch numbers"
                selected={form.effortInput === 'watch'}
                onPress={() => update('effortInput', 'watch')}
              />
            </View>

            {form.effortInput === 'rating' ? (
              <>
                <View style={styles.effortHeader}>
                  <Text style={[ui.label, styles.effortLabel]}>Effort</Text>
                  <Text style={styles.effortValue}>
                    {form.rpe === null ? '1 = very easy · 10 = max' : `${form.rpe} · ${effortWord(form.rpe)}`}
                  </Text>
                </View>
                <View style={styles.rpeRow}>
                  {RPE_VALUES.map((n) => {
                    const selected = form.rpe === n;
                    return (
                      <Pressable
                        key={n}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Effort ${n}, ${effortWord(n)}`}
                        onPress={() => update('rpe', n)}
                        style={[styles.rpeButton, selected && ui.selected]}
                      >
                        <Text style={[styles.rpeText, selected && ui.selectedText]}>{n}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <FieldError message={errors.rpe} />
              </>
            ) : (
              <>
                <Text style={ui.hint}>
                  Enter your average heart rate, calories burned, or both. Your effort level is worked out from them.
                </Text>
                <View style={ui.grid}>
                  <Field
                    label="Average heart rate (bpm)"
                    value={form.avgHeartRate}
                    onChangeText={(t) => update('avgHeartRate', t)}
                    error={errors.avgHeartRate}
                    keyboardType="number-pad"
                    placeholder="e.g. 150"
                  />
                  <Field
                    label="Max heart rate (bpm)"
                    value={form.peakHeartRate}
                    onChangeText={(t) => update('peakHeartRate', t)}
                    error={errors.peakHeartRate}
                    keyboardType="number-pad"
                    placeholder="e.g. 185"
                    hint="Highest in this session (optional)"
                  />
                  <Field
                    label="Calories burned (kcal)"
                    value={form.caloriesBurned}
                    onChangeText={(t) => update('caloriesBurned', t)}
                    error={errors.caloriesBurned}
                    placeholder="e.g. 650"
                    hint="The total for the whole session, not per hour."
                    fullWidth
                  />
                </View>
              </>
            )}

            <View style={styles.effortHeader}>
              <Text style={[ui.label, styles.effortLabel]}>How did the session go?</Text>
              <Text style={styles.effortValue}>
                {form.sessionQuality === null
                  ? '1 = very poor · 10 = excellent'
                  : `${form.sessionQuality} · ${qualityWord(form.sessionQuality)}`}
              </Text>
            </View>
            <Text style={ui.hint}>How well you played or trained, not how hard it felt.</Text>
            <View style={styles.rpeRow}>
              {RPE_VALUES.map((n) => {
                const selected = form.sessionQuality === n;
                return (
                  <Pressable
                    key={n}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Session went ${n} out of 10, ${qualityWord(n)}`}
                    onPress={() => update('sessionQuality', n)}
                    style={[styles.rpeButton, selected && ui.selected]}
                  >
                    <Text style={[styles.rpeText, selected && ui.selectedText]}>{n}</Text>
                  </Pressable>
                );
              })}
            </View>
            <FieldError message={errors.sessionQuality} />

            <Field
              label="Sleep last night (hours, optional)"
              value={form.sleepHours}
              onChangeText={(t) => update('sleepHours', t)}
              error={errors.sleepHours}
              placeholder="e.g. 7.5"
              fullWidth
            />
          </>
        ) : null}
      </Section>

      {savedTraining ? <SessionSummary session={savedTraining} player={player} /> : null}

      <Section title="Body weight" subtitle="Optional" icon="scale-outline">
        <Field
          label="Weight (lb)"
          value={form.weight}
          onChangeText={(t) => update('weight', t)}
          error={errors.weight}
          placeholder="e.g. 160"
          fullWidth
        />
      </Section>

      {status ? (
        <View style={styles.statusBox}>
          <Ionicons
            name={status.kind === 'error' ? 'alert-circle' : 'checkmark-circle'}
            size={20}
            color={status.kind === 'error' ? ERROR : ACCENT}
          />
          <Text style={[styles.status, status.kind === 'error' && styles.statusError]}>{status.text}</Text>
        </View>
      ) : null}

      <Button label="Save Day" variant="onPitch" icon="checkmark" onPress={handleSave} busy={saving} />

      {savedTraining?.sessionType === 'rest_day' ? (
        <Button label="Tomorrow’s targets" variant="onPitch" icon="flame" onPress={() => openReview(date)} />
      ) : savedTraining && savedTraining.sessionQuality !== null ? (
        <Button label="Day review" variant="onPitch" icon="analytics" onPress={() => openReview(date)} />
      ) : savedTraining ? (
        <Text style={ui.onPitchText}>Rate how the session went and save to open the day review.</Text>
      ) : null}
    </>
  );
}

/**
 * The saved session's effort level and calories burned, each with a label for where it came from.
 * Each is worked out from one source only; nothing here sets one source against another.
 */
function SessionSummary({ session, player }: { session: TrainingSession; player: PlayerInput }) {
  if (session.sessionType === 'rest_day') {
    return (
      <Section title="Session summary" icon="pulse">
        <Text style={ui.hint}>Rest day: no effort level and no training calories.</Text>
      </Section>
    );
  }

  const effort = sessionEffort(session, player);
  const calories = sessionCalories(session, player);
  return (
    <Section title="Session summary" icon="pulse" subtitle="Updates when you save">
      <SummaryRow
        label="Effort level"
        value={effort.effort ? `${effort.effort.level} / 10` : '—'}
        source={effort.effort ? EFFORT_SOURCE_LABELS[effort.effort.source] : null}
        lines={describeEffort(effort)}
      />
      <SummaryRow
        label="Calories burned"
        value={calories.calories ? `${calories.calories.kcal.toLocaleString()} kcal` : '—'}
        source={calories.calories ? CALORIES_SOURCE_LABELS[calories.calories.source] : null}
        lines={describeCalories(calories)}
      />
    </Section>
  );
}

function SummaryRow(props: { label: string; value: string; source: string | null; lines: string[] }) {
  return (
    <View
      style={styles.summaryRow}
      accessible
      accessibilityLabel={`${props.label}: ${props.value}${props.source ? `, ${props.source}` : ''}. ${props.lines.join(' ')}`}
    >
      <View style={styles.summaryHeader}>
        <Text style={ui.label}>{props.label}</Text>
        {props.source ? <Text style={styles.sourceTag}>{props.source}</Text> : null}
      </View>
      <Text style={styles.summaryValue}>{props.value}</Text>
      {props.lines.map((line) => (
        <Text key={line} style={ui.hint}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 24 },
  effortChoice: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryRow: { gap: 4 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  summaryValue: { fontSize: 24, fontWeight: '700', color: INK },
  sourceTag: {
    fontSize: 12,
    fontWeight: '600',
    color: ACCENT,
    backgroundColor: ACCENT_TINT,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  planBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: ACCENT_TINT,
    borderRadius: 14,
    padding: 12,
  },
  planBoxText: { flex: 1, gap: 1 },
  planLabel: { fontSize: 12, fontWeight: '600', color: MUTED },
  planValue: { fontSize: 16, fontWeight: '700', color: ACCENT },
  planButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#fff' },
  planButtonText: { color: ACCENT, fontSize: 14, fontWeight: '700' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Three to a row; the last row's two tiles stretch to fill it.
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: SURFACE_ALT,
  },
  tileSelected: { backgroundColor: ACCENT },
  tileText: { fontSize: 14, fontWeight: '600', color: INK_SOFT },
  tileTextSelected: { color: '#fff' },
  effortHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  effortLabel: { marginBottom: 6 },
  effortValue: { fontSize: 13, fontWeight: '600', color: MUTED },
  rpeRow: { flexDirection: 'row', gap: 4 },
  rpeButton: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: SURFACE_ALT,
  },
  rpeText: { fontSize: 15, fontWeight: '600', color: INK_SOFT },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  status: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: INK },
  statusError: { color: ERROR },
});
