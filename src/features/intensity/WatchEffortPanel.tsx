import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../../db/database';
import { BodyWeightRepository } from '../bodyweight';
import { ACCENT, styles as ui } from '../dailyLog/ui';
import { getHealthProvider } from '../health/provider';
import { PlayerProfileRepository, type PlayerProfile } from '../profile';
import { importWorkoutDay, ImportError } from './importDay';
import {
  compareEffort,
  kcalPerHour,
  kcalPerKgPerHour,
  measuredEffort,
  ZONE_LOWER_BOUNDS,
} from './metrics';
import { WorkoutMetricsRepository } from './repository';
import type { WorkoutMetrics } from './types';

/** Solid colours from easy (zone 1) to max (zone 5). */
const ZONE_COLORS = ['#8ab4f8', '#34a853', '#fbbc04', '#fa7b17', '#ea4335'];

const COMPARISON_TEXT = {
  matches: 'Your rating matches your heart rate.',
  rated_higher: 'You rated it harder than your heart rate shows.',
  rated_lower: 'Your heart rate shows you worked harder than you rated it.',
} as const;

interface Loaded {
  repo: WorkoutMetricsRepository;
  profile: PlayerProfile | null;
  metrics: WorkoutMetrics | null;
  weightKg: number | null;
}

/**
 * Watch heart-rate and calorie data for the day's training: import from Apple Health / Health
 * Connect, then show zones, training load and how the measured effort compares with the rating.
 */
export function WatchEffortPanel(props: { date: string; rpe: number | null; durationMinutes: number | null }) {
  const { date } = props;
  const provider = getHealthProvider();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reload on focus so a new age from the settings screen is picked up.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const db = await getDatabase();
        const repo = new WorkoutMetricsRepository(db);
        const [profile, metrics, weights] = await Promise.all([
          new PlayerProfileRepository(db).get(),
          repo.getByDate(date),
          new BodyWeightRepository(db).list({ to: date }),
        ]);
        if (!cancelled) setLoaded({ repo, profile, metrics, weightKg: weights[0]?.weightKg ?? null });
      })().catch((e) => {
        if (!cancelled) setError(`Couldn't load watch data: ${e instanceof Error ? e.message : String(e)}`);
      });
      return () => {
        cancelled = true;
      };
    }, [date]),
  );

  // No health store on this platform (e.g. web).
  if (!provider) return null;

  async function handleImport() {
    if (!loaded?.profile || importing || !provider) return;
    setImporting(true);
    setError(null);
    try {
      const metrics = await importWorkoutDay(provider, loaded.repo, loaded.profile, date);
      setLoaded({ ...loaded, metrics });
    } catch (e) {
      setError(
        e instanceof ImportError
          ? e.message
          : `Couldn't import from ${provider.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setImporting(false);
    }
  }

  function confirmRemove() {
    if (!loaded) return;
    Alert.alert('Remove watch data for this day?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await loaded.repo.delete(date);
          setLoaded({ ...loaded, metrics: null });
        },
      },
    ]);
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>⌚ Watch data</Text>

      {!loaded ? (
        error ? <Text style={ui.errorText}>{error}</Text> : <ActivityIndicator color={ACCENT} />
      ) : !loaded.profile ? (
        <View style={styles.gap}>
          <Text style={ui.hint}>Set your age first — heart-rate zones are based on it.</Text>
          <Link href="/settings" asChild>
            <Pressable accessibilityRole="button" style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Open player settings</Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        <>
          {loaded.metrics ? (
            <MetricsView
              metrics={loaded.metrics}
              weightKg={loaded.weightKg}
              rpe={props.rpe}
              durationMinutes={props.durationMinutes}
              usedMeasuredMax={loaded.profile.maxHeartRate !== null}
            />
          ) : (
            <Text style={ui.hint}>
              Record your session as a workout on your watch, then import it to see how hard you really worked.
            </Text>
          )}
          {error ? <Text style={ui.errorText}>{error}</Text> : null}
          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              onPress={handleImport}
              disabled={importing}
              style={({ pressed }) => [styles.importButton, (pressed || importing) && styles.pressed]}
            >
              {importing ? (
                <ActivityIndicator color={ACCENT} />
              ) : (
                <Text style={styles.importButtonText}>
                  {loaded.metrics ? 'Re-import' : `Import from ${provider.name}`}
                </Text>
              )}
            </Pressable>
            {loaded.metrics ? (
              <Pressable accessibilityRole="button" onPress={confirmRemove} style={styles.removeButton}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

function MetricsView(props: {
  metrics: WorkoutMetrics;
  weightKg: number | null;
  rpe: number | null;
  durationMinutes: number | null;
  usedMeasuredMax: boolean;
}) {
  const { metrics: m } = props;
  const effort = measuredEffort(m);
  const perHour = kcalPerHour(m);
  const perKg = kcalPerKgPerHour(m, props.weightKg);
  const longestZone = Math.max(...m.zoneMinutes, 1);

  return (
    <View style={styles.gap}>
      <View style={styles.statRow}>
        <Stat label="Avg HR" value={m.avgHeartRate !== null ? `${m.avgHeartRate}` : '–'} unit="bpm" />
        <Stat label="Peak HR" value={m.peakHeartRate !== null ? `${m.peakHeartRate}` : '–'} unit="bpm" />
        <Stat label="Time" value={`${Math.round(m.durationMinutes)}`} unit="min" />
        <Stat label="Active" value={m.activeKcal !== null ? `${m.activeKcal}` : '–'} unit="kcal" />
      </View>
      {m.workoutCount > 1 ? <Text style={ui.hint}>Combined from {m.workoutCount} workouts.</Text> : null}

      <Text style={styles.subheading}>Time in heart-rate zones</Text>
      {m.zoneMinutes
        .map((minutes, i) => ({ minutes, i }))
        .reverse()
        .map(({ minutes, i }) => {
          const low = Math.round(ZONE_LOWER_BOUNDS[i] * 100);
          const high = i < 4 ? Math.round(ZONE_LOWER_BOUNDS[i + 1] * 100) : 100;
          return (
            <View key={i} style={styles.zoneRow} accessibilityLabel={`Zone ${i + 1}: ${minutes} minutes`}>
              <Text style={styles.zoneLabel}>
                Z{i + 1} <Text style={styles.zoneRange}>{`${low}–${high}%`}</Text>
              </Text>
              <View style={styles.zoneTrack}>
                <View
                  style={[
                    styles.zoneBar,
                    { width: `${(minutes / longestZone) * 100}%`, backgroundColor: ZONE_COLORS[i] },
                  ]}
                />
              </View>
              <Text style={styles.zoneMinutes}>{Math.round(minutes)} min</Text>
            </View>
          );
        })}

      <View style={styles.statRow}>
        <Stat label="Training load" value={`${m.trimp}`} unit="TRIMP" />
        <Stat label="Burn rate" value={perHour !== null ? `${perHour}` : '–'} unit="kcal/h" />
        <Stat label="Per kg" value={perKg !== null ? `${perKg}` : '–'} unit="kcal/kg/h" />
      </View>
      {perHour !== null && perKg === null ? (
        <Text style={ui.hint}>Log your body weight to see calories per kg.</Text>
      ) : null}

      <View style={styles.effortBox}>
        {effort !== null ? (
          <>
            <Text style={styles.effortLine}>
              Heart-rate effort <Text style={styles.effortValue}>{effort}/10</Text>
              {props.rpe !== null ? (
                <>
                  {'  ·  '}Your rating <Text style={styles.effortValue}>{props.rpe}/10</Text>
                </>
              ) : null}
            </Text>
            {props.rpe !== null ? (
              <Text style={styles.effortNote}>{COMPARISON_TEXT[compareEffort(props.rpe, effort)]}</Text>
            ) : (
              <Text style={styles.effortNote}>Pick an effort rating above to compare.</Text>
            )}
          </>
        ) : (
          <Text style={styles.effortNote}>Not enough heart-rate data to score effort.</Text>
        )}
        {props.rpe !== null && props.durationMinutes ? (
          <Text style={styles.effortNote}>
            Session load (rating × minutes): {props.rpe * props.durationMinutes}
          </Text>
        ) : null}
      </View>

      <Text style={ui.hint}>
        Zones use a max heart rate of {m.maxHeartRate} bpm
        {props.usedMeasuredMax ? ' (your measured max)' : ' (220 − age)'}.
      </Text>
    </View>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eceef0' },
  heading: { fontSize: 15, fontWeight: '600', color: '#202124' },
  subheading: { fontSize: 14, fontWeight: '600', color: '#3c4043', marginTop: 4 },
  gap: { gap: 8 },
  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: '#f4f5f7', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#111' },
  statUnit: { fontSize: 11, color: '#5f6368' },
  statLabel: { fontSize: 12, color: '#3c4043', marginTop: 2 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneLabel: { width: 74, fontSize: 13, fontWeight: '600', color: '#202124' },
  zoneRange: { fontSize: 11, fontWeight: '400', color: '#5f6368' },
  zoneTrack: { flex: 1, height: 12, backgroundColor: '#eceef0', borderRadius: 6, overflow: 'hidden' },
  zoneBar: { height: '100%', borderRadius: 6 },
  zoneMinutes: { width: 52, textAlign: 'right', fontSize: 13, color: '#3c4043' },
  effortBox: { backgroundColor: '#eef7f1', borderRadius: 10, padding: 12, gap: 4 },
  effortLine: { fontSize: 15, color: '#202124' },
  effortValue: { fontWeight: '700', color: ACCENT },
  effortNote: { fontSize: 13, color: '#3c4043' },
  buttonRow: { flexDirection: 'row', gap: 8 },
  importButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  importButtonText: { color: ACCENT, fontSize: 15, fontWeight: '600' },
  removeButton: { paddingHorizontal: 14, justifyContent: 'center', borderRadius: 10, backgroundColor: '#eceef0' },
  removeText: { color: '#3c4043', fontSize: 15, fontWeight: '600' },
  secondaryButton: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#eef7f1' },
  secondaryButtonText: { color: ACCENT, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
