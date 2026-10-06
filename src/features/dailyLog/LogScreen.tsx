import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ValidationError } from '../../lib/validation';
import { kgToDisplayLb } from '../bodyweight';
import { describePlan, type PlannedSession } from '../planning';
import { RPE_MAX, RPE_MIN, SESSION_OPTIONS } from '../training';
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

type Status = { kind: 'saved' | 'error'; text: string } | null;

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

  useEffect(() => {
    let cancelled = false;
    loadDay(repos, date).then(
      (records) => {
        if (cancelled) return;
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
    }, [repos, date, readWeightText, pristineWeight]),
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
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
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

      const savedForm = formFromRecords(await saveDay(repos, date, values));
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
        ) : null}
      </Section>

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
    </>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 24 },
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
