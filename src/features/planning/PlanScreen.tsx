import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../../db/database';
import { addDays, toLocalDateString } from '../../lib/dates';
import { ValidationError } from '../../lib/validation';
import { useSelectedDate } from '../dailyLog/SelectedDate';
import {
  ACCENT,
  ACCENT_DEEP,
  BORDER,
  Button,
  CARD,
  CARD_BORDER,
  Dropdown,
  FAINT,
  Field,
  INK,
  INK_SOFT,
  INPUT_BG,
  MountainBanner,
  MUTED,
  ON_PITCH,
  ON_PITCH_MUTED,
  PaperCard,
  PAPER_INK,
  Pill,
  PitchLink,
  Screen,
  Section,
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
import { WINDOW_DAYS, type PlannedDay, type PlannedSession } from './types';
import { DuplicatePlannedDateError } from './validation';

const TYPE_OPTIONS = SESSION_OPTIONS.map((o) => ({ value: o.type, label: o.label, hint: o.hint }));

interface Week {
  days: PlannedDay[];
  matchCount: number;
  /** Today's plan, whichever week is shown. */
  todayPlan: PlannedSession | null;
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
  const { setDate } = useSelectedDate();

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
      const [days, matchCount, planToday] = await Promise.all([
        r.getLookahead(start),
        r.countMatchesInWindow(start),
        r.getByDate(today),
      ]);
      return { days, matchCount, todayPlan: planToday };
    },
    [today],
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
  // Today's plan gets its own card, whichever week is on screen.
  const todayPlan = week?.todayPlan ?? null;

  /** Opens the Log tab on today, where "Log as planned" fills in the session. */
  function logToday() {
    setDate(today);
    router.navigate('/');
  }

  return (
    <Screen title="Plan" icon="calendar">
      <MountainBanner title="Train. Improve. Compete." subtitle="Your training plan, all in one place." />

      {todayPlan ? (
        <Section title="Today’s Session" right={<Pill label="Planned" />}>
          <PaperCard>
            <View style={styles.todayRow}>
              <View style={styles.todayIcon}>
                <Ionicons name={SESSION_ICONS[todayPlan.sessionType]} size={22} color={PAPER_INK} />
              </View>
              <View style={styles.dayText}>
                <Text style={styles.todayPlan}>{describePlan(todayPlan)}</Text>
                {todayPlan.notes ? <Text style={styles.todayNotes}>{todayPlan.notes}</Text> : null}
              </View>
            </View>
            <Button label="Log as planned" variant="onPaper" onPress={logToday} style={styles.todayButton} />
          </PaperCard>
        </Section>
      ) : null}

      <Text style={styles.heading}>Upcoming Sessions</Text>
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
            <Ionicons name="trophy" size={16} color={ACCENT} />
            <Text style={styles.matchCountText}>
              {week.matchCount === 0
                ? 'No matches planned in these 7 days'
                : `${week.matchCount} ${week.matchCount === 1 ? 'match' : 'matches'} planned in these 7 days`}
            </Text>
          </View>

          <View style={styles.days}>
          {week.days.map((day, index) => {
            const isPast = day.date < today;
            const name = dayName(day.date, today);
            const isEditing = editingDate === day.date;
            // A past day with no plan can't get one, so there is nothing to open.
            const canOpen = !isPast || day.session !== null;

            return (
              <View key={day.date} style={[styles.day, index > 0 && styles.dayDivider]}>
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
                  <View style={[styles.dayIcon, day.date === today && styles.dayIconToday]}>
                    <Ionicons
                      name={day.session ? SESSION_ICONS[day.session.sessionType] : 'add'}
                      size={22}
                      color={day.session ? INK : canOpen ? ACCENT : FAINT}
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
                    <Ionicons name={isEditing ? 'chevron-down' : 'chevron-forward'} size={18} color={INK_SOFT} />
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
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 24 },
  heading: { fontSize: 17, fontWeight: '700', color: ON_PITCH, marginTop: 4 },
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  todayIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: PAPER_INK,
  },
  todayPlan: { fontSize: 15, fontWeight: '700', color: PAPER_INK },
  todayNotes: { fontSize: 13, color: ACCENT_DEEP },
  todayButton: { minHeight: 38 },
  matchCount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  matchCountText: { color: ON_PITCH_MUTED, fontSize: 14, fontWeight: '600' },
  // One card holding every day, separated by hairlines.
  days: { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: CARD_BORDER, overflow: 'hidden' },
  day: {},
  dayDivider: { borderTopWidth: 1, borderTopColor: BORDER },
  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  dayIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE_ALT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  dayIconToday: { borderColor: ACCENT },
  dayText: { flex: 1, gap: 2 },
  dayDate: { fontSize: 13, fontWeight: '600', color: INK },
  planText: { fontSize: 14, color: INK_SOFT },
  planNotes: { fontSize: 12, color: MUTED },
  nonePlanned: { fontSize: 14, color: FAINT },
  editor: { gap: 6, padding: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: INPUT_BG },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
