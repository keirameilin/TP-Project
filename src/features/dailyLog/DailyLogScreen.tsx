import { useEffect, useRef, useState } from 'react';
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
import { addDays, toLocalDateString } from '../../lib/dates';
import { ValidationError } from '../../lib/validation';
import { RPE_MAX, RPE_MIN, type SessionType } from '../training';
import { FoodSection } from './FoodSection';
import {
  EMPTY_FORM,
  formFromRecords,
  issuesToErrors,
  parseForm,
  type DailyLogForm,
  type FormErrors,
  type FormField,
} from './form';
import { createDailyLogRepos, loadDay, saveDay, type DailyLogRepos } from './saveDay';
import { ACCENT, Chip, Field, FieldError, Section, styles as ui } from './ui';

const SESSION_OPTIONS: { type: SessionType; label: string; hint: string }[] = [
  { type: 'match', label: 'Match', hint: 'Competitive game' },
  { type: 'hiit_conditioning', label: 'Conditioning', hint: 'Sprints, fitness drills, high-intensity running' },
  { type: 'technical_tactical', label: 'Technical', hint: 'Passing, shooting, decision-making' },
  { type: 'gym_strength', label: 'Gym', hint: 'Gym conditioning' },
  { type: 'rest_day', label: 'Rest', hint: 'No training today' },
];

const RPE_VALUES = Array.from({ length: RPE_MAX - RPE_MIN + 1 }, (_, i) => RPE_MIN + i);

type Status = { kind: 'saved' | 'error'; text: string } | null;

export default function DailyLogScreen() {
  // Only changes via the arrows, so a save just after midnight still lands on the day shown.
  const [date, setDate] = useState(() => toLocalDateString(new Date()));
  const [repos, setRepos] = useState<DailyLogRepos | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<DailyLogForm>(EMPTY_FORM);
  // The date `form` was loaded for; while it differs from `date` the day is still loading.
  const [formDate, setFormDate] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);
  // State updates land on the next render, so a fast double tap could slip past `saving`.
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getDatabase().then(
      (db) => {
        if (!cancelled) setRepos(createDailyLogRepos(db));
      },
      (e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!repos) return;
    let cancelled = false;
    loadDay(repos, date).then(
      (records) => {
        if (cancelled) return;
        setForm(formFromRecords(records));
        setFormDate(date);
      },
      (e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repos, date]);

  function goToDate(next: string) {
    setDate(next);
    setErrors({});
    setStatus(null);
  }

  function update<K extends keyof DailyLogForm>(key: K, value: DailyLogForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
    setStatus(null);
  }

  async function handleSave() {
    if (!repos || savingRef.current || formDate !== date) return;
    const { values, errors: found } = parseForm(form, date);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setStatus({ kind: 'error', text: found.form ?? 'Fix the highlighted fields and try again.' });
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      setForm(formFromRecords(await saveDay(repos, date, values)));
      setStatus({ kind: 'saved', text: 'Day saved.' });
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

  if (loadError) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <Text style={ui.errorText}>{`Couldn't open your log: ${loadError}`}</Text>
      </SafeAreaView>
    );
  }

  if (!repos || formDate === null) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const today = toLocalDateString(new Date());
  const canGoForward = date < today;
  const dayLoaded = formDate === date;
  const isRest = form.sessionType === 'rest_day';
  const selectedHint = SESSION_OPTIONS.find((o) => o.type === form.sessionType)?.hint;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Daily Log</Text>
          <View style={styles.dateNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              onPress={() => goToDate(addDays(date, -1))}
              hitSlop={8}
              style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
            >
              <Text style={styles.arrowText}>‹</Text>
            </Pressable>
            <View style={styles.dateText}>
              <Text style={styles.dayLabel}>{dayLabel(date, today)}</Text>
              <Text style={styles.date}>{formatDisplayDate(date)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next day"
              accessibilityState={{ disabled: !canGoForward }}
              onPress={() => goToDate(addDays(date, 1))}
              disabled={!canGoForward}
              hitSlop={8}
              style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed, !canGoForward && styles.hidden]}
            >
              <Text style={styles.arrowText}>›</Text>
            </Pressable>
          </View>
          {date !== today ? (
            <Pressable accessibilityRole="button" onPress={() => goToDate(today)} style={styles.backToToday}>
              <Text style={styles.backToTodayText}>Back to today</Text>
            </Pressable>
          ) : null}

          {dayLoaded ? (
            <>
              <Section title="Training">
                <View style={ui.chips}>
                  {SESSION_OPTIONS.map((o) => (
                    <Chip
                      key={o.type}
                      label={o.label}
                      selected={form.sessionType === o.type}
                      // Tapping the selected type again clears the section.
                      onPress={() => update('sessionType', form.sessionType === o.type ? null : o.type)}
                    />
                  ))}
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
                    <Text style={ui.label}>Effort (1 = very easy, 10 = max)</Text>
                    <View style={styles.rpeRow}>
                      {RPE_VALUES.map((n) => (
                        <Pressable
                          key={n}
                          accessibilityRole="button"
                          accessibilityState={{ selected: form.rpe === n }}
                          accessibilityLabel={`Effort ${n}`}
                          onPress={() => update('rpe', n)}
                          style={[styles.rpeButton, form.rpe === n && ui.selected]}
                        >
                          <Text style={[styles.rpeText, form.rpe === n && ui.selectedText]}>{n}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <FieldError message={errors.rpe} />
                  </>
                ) : null}
              </Section>

              {/* Keyed by date so switching days resets its list and half-typed item. */}
              <FoodSection key={date} repos={repos} date={date} />

              <Section title="Body weight" subtitle="Optional">
                <Field
                  label="Weight (kg)"
                  value={form.weight}
                  onChangeText={(t) => update('weight', t)}
                  error={errors.weight}
                  placeholder="e.g. 72.5"
                  fullWidth
                />
              </Section>

              {status ? (
                <Text style={[styles.status, status.kind === 'error' ? ui.errorText : styles.savedText]}>
                  {status.text}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={handleSave}
                disabled={saving}
                style={({ pressed }) => [styles.saveButton, (pressed || saving) && styles.saveButtonPressed]}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Day</Text>}
              </Pressable>
            </>
          ) : (
            <ActivityIndicator style={styles.dayLoading} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' });
}

function formatDisplayDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: '#f4f5f7' },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#111' },
  dateNav: { flexDirection: 'row', alignItems: 'center', marginTop: -8 },
  dateText: { flex: 1, alignItems: 'center' },
  dayLabel: { fontSize: 18, fontWeight: '600', color: '#111' },
  date: { fontSize: 14, color: '#5f6368' },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  arrowPressed: { opacity: 0.6 },
  arrowText: { fontSize: 28, lineHeight: 30, color: ACCENT },
  hidden: { opacity: 0 },
  backToToday: { alignSelf: 'center', marginTop: -8 },
  backToTodayText: { color: ACCENT, fontSize: 14, fontWeight: '600' },
  dayLoading: { marginTop: 24 },
  rpeRow: { flexDirection: 'row', gap: 4 },
  rpeButton: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#fff',
  },
  rpeText: { fontSize: 15, color: '#202124' },
  status: { fontSize: 15, textAlign: 'center' },
  savedText: { color: ACCENT, fontWeight: '600' },
  saveButton: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonPressed: { opacity: 0.7 },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
