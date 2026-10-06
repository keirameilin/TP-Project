import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { ACCENT, Dropdown, Field, ON_PITCH, ON_PITCH_MUTED, PITCH, styles as ui } from '../dailyLog/ui';
import { SESSION_OPTIONS } from '../training/labels';
import {
  describePlan,
  EMPTY_PLAN_FORM,
  parsePlanForm,
  planFormFromSession,
  planIssuesToErrors,
  type PlanForm,
  type PlanFormErrors,
} from './planForm';
import { PlannedSessionRepository } from './repository';
import { NONE_PLANNED, WINDOW_DAYS, type PlannedDay } from './types';
import { DuplicatePlannedDateError } from './validation';

const TYPE_OPTIONS = SESSION_OPTIONS.map((o) => ({ value: o.type, label: o.label, hint: o.hint }));

interface Week {
  days: PlannedDay[];
  matchCount: number;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const shortDate = (date: string) =>
  parseDate(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function dayName(date: string, today: string): string | null {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  if (date === addDays(today, -1)) return 'Yesterday';
  return null;
}

/**
 * The 7-day plan: each day shows its planned session or "None planned". Tapping a day adds or
 * edits its plan. Past days can't get a new plan, but an existing one can be edited or removed.
 */
export default function PlanScreen() {
  const [repo, setRepo] = useState<PlannedSessionRepository | null>(null);
  const [today] = useState(() => toLocalDateString(new Date()));
  const [startDate, setStartDate] = useState(today);
  const [week, setWeek] = useState<Week | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_PLAN_FORM);
  const [errors, setErrors] = useState<PlanFormErrors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDatabase().then(
      (db) => {
        if (!cancelled) setRepo(new PlannedSessionRepository(db));
      },
      (e) => {
        if (!cancelled) setLoadError(`Couldn't open your plan: ${errorMessage(e)}`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const loadWeek = useCallback(
    async (r: PlannedSessionRepository, start: string): Promise<Week> => {
      const [days, matchCount] = await Promise.all([r.getLookahead(start), r.countMatchesInWindow(start)]);
      return { days, matchCount };
    },
    [],
  );

  useEffect(() => {
    if (!repo) return;
    let cancelled = false;
    loadWeek(repo, startDate).then(
      (loaded) => {
        if (!cancelled) setWeek(loaded);
      },
      (e) => {
        if (!cancelled) setLoadError(`Couldn't load your plan: ${errorMessage(e)}`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repo, startDate, loadWeek]);

  function goToWeek(start: string) {
    setEditingDate(null);
    setErrors({});
    setStartDate(start);
  }

  function startEditing(day: PlannedDay) {
    setForm(planFormFromSession(day.session));
    setErrors({});
    setEditingDate(day.date);
  }

  function update<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  }

  async function handleSave(day: PlannedDay) {
    if (!repo || busy) return;
    const { values, errors: found } = parsePlanForm(form);
    if (!values) {
      setErrors(found);
      return;
    }
    setBusy(true);
    try {
      if (day.session) await repo.update(day.session.id, values);
      else await repo.create({ date: day.date, ...values });
      setWeek(await loadWeek(repo, startDate));
      setEditingDate(null);
    } catch (e) {
      if (e instanceof ValidationError) setErrors(planIssuesToErrors(e.issues));
      else if (e instanceof DuplicatePlannedDateError) setErrors({ form: 'A session is already planned for this day.' });
      else setErrors({ form: `Couldn't save: ${errorMessage(e)}` });
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(day: PlannedDay) {
    const session = day.session;
    if (!repo || !session) return;
    Alert.alert(`Remove the plan for ${shortDate(day.date)}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await repo.delete(session.id);
            setWeek(await loadWeek(repo, startDate));
            setEditingDate(null);
          } catch (e) {
            setErrors({ form: `Couldn't remove: ${errorMessage(e)}` });
          }
        },
      },
    ]);
  }

  const endDate = addDays(startDate, WINDOW_DAYS - 1);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.back}>
            <Text style={styles.backText}>‹ Daily Log</Text>
          </Pressable>
          <Text style={styles.title}>Upcoming training</Text>

          <View style={styles.weekNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous 7 days"
              onPress={() => goToWeek(addDays(startDate, -WINDOW_DAYS))}
              hitSlop={8}
              style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
            >
              <Text style={styles.arrowText}>‹</Text>
            </Pressable>
            <View style={styles.weekText}>
              <Text style={styles.weekLabel}>{startDate === today ? 'Next 7 days' : '7 days'}</Text>
              <Text style={styles.weekRange}>{`${shortDate(startDate)} – ${shortDate(endDate)}`}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Following 7 days"
              onPress={() => goToWeek(addDays(startDate, WINDOW_DAYS))}
              hitSlop={8}
              style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
            >
              <Text style={styles.arrowText}>›</Text>
            </Pressable>
          </View>
          {startDate !== today ? (
            <Pressable accessibilityRole="button" onPress={() => goToWeek(today)} style={styles.backToToday}>
              <Text style={styles.backToTodayText}>Back to the next 7 days</Text>
            </Pressable>
          ) : null}

          {loadError ? (
            <Text style={styles.loadError}>{loadError}</Text>
          ) : !week ? (
            <ActivityIndicator color={ON_PITCH} />
          ) : (
            <>
              <Text style={styles.matchCount}>
                {week.matchCount === 0
                  ? 'No matches planned in these 7 days'
                  : `${week.matchCount} ${week.matchCount === 1 ? 'match' : 'matches'} planned in these 7 days`}
              </Text>

              {week.days.map((day) => {
                const isPast = day.date < today;
                const name = dayName(day.date, today);
                const isEditing = editingDate === day.date;
                // A past day with no plan can't get one, so there is nothing to open.
                const canOpen = !isPast || day.session !== null;

                return (
                  <View key={day.date} style={[styles.day, isEditing && styles.dayEditing]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${name ?? ''} ${shortDate(day.date)}: ${
                        day.session ? describePlan(day.session) : 'none planned'
                      }`}
                      accessibilityState={{ disabled: !canOpen, expanded: isEditing }}
                      disabled={!canOpen || busy}
                      onPress={() => (isEditing ? setEditingDate(null) : startEditing(day))}
                      style={({ pressed }) => [styles.dayRow, pressed && styles.pressed]}
                    >
                      <View style={styles.dayDate}>
                        {name ? <Text style={styles.dayName}>{name}</Text> : null}
                        <Text style={name ? styles.dayDateSmall : styles.dayName}>{shortDate(day.date)}</Text>
                      </View>
                      <View style={styles.dayPlan}>
                        {day.session ? (
                          <>
                            <Text style={styles.planText}>{describePlan(day.session)}</Text>
                            {day.session.notes ? <Text style={styles.planNotes}>{day.session.notes}</Text> : null}
                          </>
                        ) : (
                          <Text style={styles.nonePlanned}>
                            {day.plan === NONE_PLANNED && isPast ? 'Nothing was planned' : 'None planned'}
                          </Text>
                        )}
                      </View>
                      {canOpen ? <Text style={styles.dayAction}>{day.session ? 'Edit' : 'Add'}</Text> : null}
                    </Pressable>

                    {isEditing ? (
                      <View style={styles.editor}>
                        <Dropdown
                          label="Session"
                          value={form.sessionType}
                          options={TYPE_OPTIONS}
                          onChange={(value) => update('sessionType', value)}
                          error={errors.sessionType}
                        />
                        {form.sessionType !== 'rest_day' ? (
                          <Field
                            label="Expected duration in minutes (optional)"
                            value={form.duration}
                            onChangeText={(t) => update('duration', t)}
                            error={errors.duration}
                            keyboardType="number-pad"
                            placeholder="e.g. 90"
                            fullWidth
                          />
                        ) : null}
                        <Field
                          label="Notes (optional)"
                          value={form.notes}
                          onChangeText={(t) => update('notes', t)}
                          error={errors.notes}
                          keyboardType="default"
                          placeholder="e.g. Away, 3pm kick-off"
                          fullWidth
                        />
                        {errors.form ? <Text style={ui.errorText}>{errors.form}</Text> : null}
                        <View style={styles.buttons}>
                          {day.session ? (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => confirmRemove(day)}
                              disabled={busy}
                              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                            >
                              <Text style={styles.removeText}>Remove</Text>
                            </Pressable>
                          ) : null}
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setEditingDate(null)}
                            disabled={busy}
                            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                          >
                            <Text style={styles.secondaryText}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => handleSave(day)}
                            disabled={busy}
                            style={({ pressed }) => [styles.saveButton, (pressed || busy) && styles.pressed]}
                          >
                            {busy ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <Text style={styles.saveText}>{day.session ? 'Update' : 'Save plan'}</Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: PITCH },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  back: { alignSelf: 'flex-start' },
  backText: { color: ON_PITCH, fontSize: 16, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: ON_PITCH, marginTop: -4 },
  weekNav: { flexDirection: 'row', alignItems: 'center' },
  weekText: { flex: 1, alignItems: 'center' },
  weekLabel: { fontSize: 18, fontWeight: '700', color: ON_PITCH },
  weekRange: { fontSize: 14, color: ON_PITCH_MUTED },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  arrowText: { fontSize: 28, lineHeight: 30, color: ACCENT },
  backToToday: { alignSelf: 'center' },
  backToTodayText: { color: ON_PITCH, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  loadError: { color: ON_PITCH, fontSize: 15 },
  matchCount: { color: ON_PITCH, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  day: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  dayEditing: { borderWidth: 2, borderColor: '#cfe6d7' },
  dayRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  dayDate: { width: 104 },
  dayName: { fontSize: 15, fontWeight: '700', color: '#111' },
  dayDateSmall: { fontSize: 13, color: '#5f6368' },
  dayPlan: { flex: 1, gap: 2 },
  planText: { fontSize: 16, fontWeight: '600', color: ACCENT },
  planNotes: { fontSize: 13, color: '#5f6368' },
  nonePlanned: { fontSize: 15, color: '#9aa0a6' },
  dayAction: { fontSize: 14, fontWeight: '600', color: ACCENT },
  editor: { gap: 8, padding: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eceef0' },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#eceef0',
  },
  secondaryText: { color: '#3c4043', fontSize: 15, fontWeight: '600' },
  removeText: { color: '#c5221f', fontSize: 15, fontWeight: '600' },
  saveButton: { flex: 1, backgroundColor: ACCENT, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
