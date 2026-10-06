import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../../db/database';
import { addDays, toLocalDateString } from '../../lib/dates';
import { ValidationError } from '../../lib/validation';
import {
  ACCENT,
  BORDER,
  Button,
  Dropdown,
  FAINT,
  Field,
  INK,
  MUTED,
  ON_PITCH,
  PitchLink,
  Screen,
  Stepper,
  SURFACE_ALT,
  styles as ui,
} from '../dailyLog/ui';
import { SESSION_ICONS, SESSION_OPTIONS } from '../training/labels';
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
import { WINDOW_DAYS, type PlannedDay } from './types';
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
    <Screen title="Training plan">
      <Stepper
        title={startDate === today ? 'Next 7 days' : '7 days'}
        subtitle={`${shortDate(startDate)} – ${shortDate(endDate)}`}
        onPrevious={() => goToWeek(addDays(startDate, -WINDOW_DAYS))}
        onNext={() => goToWeek(addDays(startDate, WINDOW_DAYS))}
        previousLabel="Previous 7 days"
        nextLabel="Following 7 days"
      />
      {startDate !== today ? <PitchLink label="Back to the next 7 days" onPress={() => goToWeek(today)} /> : null}

      {loadError ? (
        <Text style={ui.onPitchText}>{loadError}</Text>
      ) : !week ? (
        <ActivityIndicator color={ON_PITCH} style={styles.loading} />
      ) : (
        <>
          <View style={styles.matchCount}>
            <Ionicons name="trophy" size={16} color={ON_PITCH} />
            <Text style={styles.matchCountText}>
              {week.matchCount === 0
                ? 'No matches planned in these 7 days'
                : `${week.matchCount} ${week.matchCount === 1 ? 'match' : 'matches'} planned in these 7 days`}
            </Text>
          </View>

          {week.days.map((day) => {
            const isPast = day.date < today;
            const name = dayName(day.date, today);
            const isEditing = editingDate === day.date;
            // A past day with no plan can't get one, so there is nothing to open.
            const canOpen = !isPast || day.session !== null;

            return (
              <View key={day.date} style={[styles.day, day.date === today && styles.dayToday]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${name ?? ''} ${shortDate(day.date)}: ${
                    day.session ? describePlan(day.session) : 'none planned'
                  }`}
                  accessibilityState={{ disabled: !canOpen, expanded: isEditing }}
                  disabled={!canOpen || busy}
                  onPress={() => (isEditing ? setEditingDate(null) : startEditing(day))}
                  style={({ pressed }) => [styles.dayRow, pressed && ui.dimmed]}
                >
                  <View style={[styles.dayIcon, day.session && styles.dayIconPlanned]}>
                    <Ionicons
                      name={day.session ? SESSION_ICONS[day.session.sessionType] : 'add'}
                      size={20}
                      color={day.session ? '#fff' : canOpen ? ACCENT : FAINT}
                    />
                  </View>
                  <View style={styles.dayText}>
                    <Text style={styles.dayDate}>{name ? `${name} · ${shortDate(day.date)}` : shortDate(day.date)}</Text>
                    {day.session ? (
                      <>
                        <Text style={styles.planText}>{describePlan(day.session)}</Text>
                        {day.session.notes ? <Text style={styles.planNotes}>{day.session.notes}</Text> : null}
                      </>
                    ) : (
                      <Text style={styles.nonePlanned}>{isPast ? 'Nothing was planned' : 'None planned'}</Text>
                    )}
                  </View>
                  {canOpen ? (
                    <Ionicons name={isEditing ? 'chevron-up' : 'chevron-down'} size={18} color={MUTED} />
                  ) : null}
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
                        <Button label="Remove" variant="danger" onPress={() => confirmRemove(day)} disabled={busy} />
                      ) : null}
                      <Button label="Cancel" variant="quiet" onPress={() => setEditingDate(null)} disabled={busy} />
                      <Button
                        label={day.session ? 'Update' : 'Save plan'}
                        onPress={() => handleSave(day)}
                        busy={busy}
                        grow
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 24 },
  matchCount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  matchCountText: { color: ON_PITCH, fontSize: 15, fontWeight: '600' },
  day: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden' },
  dayToday: { borderWidth: 2, borderColor: '#86efac' },
  dayRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  dayIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE_ALT,
  },
  dayIconPlanned: { backgroundColor: ACCENT },
  dayText: { flex: 1, gap: 2 },
  dayDate: { fontSize: 13, fontWeight: '600', color: MUTED },
  planText: { fontSize: 17, fontWeight: '700', color: INK },
  planNotes: { fontSize: 13, color: MUTED },
  nonePlanned: { fontSize: 16, color: FAINT },
  editor: { gap: 6, padding: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: '#fff' },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
