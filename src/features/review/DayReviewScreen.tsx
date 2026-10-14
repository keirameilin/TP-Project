import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { isValidDateString, toLocalDateString } from '../../lib/dates';
import { useDailyLogRepos } from '../dailyLog/useDailyLogRepos';
import {
  ACCENT,
  ACCENT_DEEP,
  ACCENT_TINT,
  Button,
  INK,
  MacroTile,
  ON_PITCH,
  PAPER_BORDER,
  PAPER_INK,
  PAPER_MUTED,
  Pill,
  ProgressBar,
  Screen,
  Section,
  styles as ui,
} from '../dailyLog/ui';
import { CALORIES_SOURCE_LABELS, describeEffort, EFFORT_SOURCE_LABELS } from '../intensity/sessionText';
import { describePlan } from '../planning';
import { SESSION_LABELS } from '../training/labels';
import { loadDayReview, type DayReviewData, type TomorrowTargets } from './loadReview';
import type { DayNutrition, DayReview, Outcome } from './review';

const OUTCOME_WORDS: Record<Outcome, string> = {
  good: 'went well',
  bad: 'went badly',
  neutral: 'in between',
};

function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * The end-of-day review for one date: what the session was, the day's food and what in the
 * player's own logs may have played a part, and tomorrow's targets. Rest days show only the targets.
 */
export default function DayReviewScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date && isValidDateString(params.date) ? params.date : toLocalDateString(new Date());
  const { repos, error } = useDailyLogRepos();
  const [data, setData] = useState<DayReviewData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Runs on focus too, so a plan added on the Plan tab shows up on return.
  useFocusEffect(
    useCallback(() => {
      if (!repos) return;
      let cancelled = false;
      loadDayReview(repos, date).then(
        (loaded) => {
          if (!cancelled) setData(loaded);
        },
        (e) => {
          if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
        },
      );
      return () => {
        cancelled = true;
      };
    }, [repos, date]),
  );

  const problem = error ?? loadError;
  const isRest = data?.session?.sessionType === 'rest_day';
  return (
    <Screen title={isRest ? 'Tomorrow’s Targets' : 'Day Review'} onBack={goBack}>
      <Text style={ui.onPitchText}>{longDate(date)}</Text>
      {problem ? (
        <Text style={ui.onPitchText}>{`Couldn't open the review: ${problem}`}</Text>
      ) : !data ? (
        <ActivityIndicator color={ON_PITCH} style={styles.loading} />
      ) : (
        <>
          {isRest ? null : <Summary data={data} />}
          {data.review ? <Nutrition today={data.today} review={data.review} /> : null}
          <Tomorrow tomorrow={data.tomorrow} />
          <Button label="Back to the log" variant="secondary" onPress={goBack} />
        </>
      )}
    </Screen>
  );
}

function Summary({ data }: { data: DayReviewData }) {
  const { session, effort, calories } = data;
  if (!session) {
    return (
      <Section title="Session Summary" icon="football" tone="paper">
        <Text style={styles.paperHint}>No session is logged for this day.</Text>
      </Section>
    );
  }
  return (
    <Section
      title="Session Summary"
      icon="football"
      tone="paper"
      subtitle={`${SESSION_LABELS[session.sessionType]} · ${session.durationMinutes} min`}
    >
      <View style={styles.stats}>
        <Stat
          label="Effort level"
          value={effort?.effort ? `${effort.effort.level}/10` : '—'}
          tag={effort?.effort ? EFFORT_SOURCE_LABELS[effort.effort.source] : null}
        />
        <Stat
          label="Calories burned"
          value={calories?.calories ? `${calories.calories.kcal.toLocaleString()} kcal` : '—'}
          tag={calories?.calories ? CALORIES_SOURCE_LABELS[calories.calories.source] : null}
        />
      </View>
      <Stat
        label="How the session went (your rating)"
        value={session.sessionQuality === null ? '—' : `${session.sessionQuality}/10`}
        tag={data.review ? OUTCOME_WORDS[data.review.outcome] : null}
      />
      {effort
        ? describeEffort(effort).map((line) => (
            <Text key={line} style={styles.paperNote}>
              {line}
            </Text>
          ))
        : null}
      {session.sessionQuality === null ? (
        <Text style={styles.paperHint}>Rate how the session went on the Log tab and save to see a review.</Text>
      ) : null}
    </Section>
  );
}

/** The day's food against its targets, then what in the logs may have played a part. */
function Nutrition({ today, review }: { today: DayNutrition; review: DayReview }) {
  const { eaten, targets } = today;
  const good = review.outcome === 'good';
  const amount = (ate: number, goal: number) => `${Math.round(ate)} / ${goal}g`;
  return (
    <Section title="Nutrition" icon="restaurant" tone="paper">
      {eaten && targets ? (
        <>
          <Text style={styles.statLabel}>Calories</Text>
          <View style={styles.caloriesRow}>
            <Text style={styles.calories}>
              {Math.round(eaten.calories).toLocaleString()}
              <Text style={styles.caloriesTarget}>{` / ${targets.calories.toLocaleString()} kcal`}</Text>
            </Text>
            <Text style={styles.caloriesLeft}>
              {eaten.calories > targets.calories
                ? `${Math.round(eaten.calories - targets.calories).toLocaleString()} over`
                : `${Math.round(targets.calories - eaten.calories).toLocaleString()} left`}
            </Text>
          </View>
          <ProgressBar
            progress={eaten.calories / targets.calories}
            color={ACCENT_DEEP}
            trackColor={PAPER_BORDER}
            height={8}
            label="Calories eaten against target"
            max={targets.calories}
            now={Math.round(eaten.calories)}
          />
          <View style={styles.macroRow}>
            <MacroTile macro="protein" label="Protein" value={amount(eaten.proteinG, targets.proteinG)} tone="paper" />
            <MacroTile macro="carbs" label="Carbs" value={amount(eaten.carbsG, targets.carbsG)} tone="paper" />
            <MacroTile macro="fat" label="Fat" value={amount(eaten.fatG, targets.fatG)} tone="paper" />
          </View>
        </>
      ) : null}

      <View style={styles.findings}>
        <Text style={styles.findingsTitle}>{good ? 'What lined up' : 'Why it may have gone this way'}</Text>
        {review.findings.map((finding) => (
          <View key={finding.text} style={styles.finding}>
            <Ionicons
              name={finding.kind === 'lined_up' ? 'checkmark-circle' : finding.kind === 'pattern' ? 'analytics' : 'alert-circle'}
              size={18}
              color={finding.kind === 'shortfall' || finding.kind === 'sleep' ? '#b45309' : ACCENT_DEEP}
            />
            <Text style={styles.findingText}>{finding.text}</Text>
          </View>
        ))}
        {review.nothingStandsOut ? <Text style={styles.findingText}>{review.nothingStandsOut}</Text> : null}
        {review.cannotAssess.map((line) => (
          <Text key={line} style={styles.paperHint}>
            {line}
          </Text>
        ))}
        {review.patternMissing.length > 0 ? (
          <View style={styles.missing}>
            <Text style={styles.paperHint}>
              Not enough data yet for your own pattern between carbs and how sessions go. It needs:
            </Text>
            {review.patternMissing.map((line) => (
              <Text key={line} style={styles.paperHint}>{`• ${line}`}</Text>
            ))}
          </View>
        ) : null}
        <Text style={styles.paperHint}>
          Anything marked (estimate) is this app’s own assumption, not a figure from the research.
        </Text>
      </View>
    </Section>
  );
}

function Tomorrow({ tomorrow }: { tomorrow: TomorrowTargets }) {
  const result = tomorrow.targets;
  return (
    <Section title="Tomorrow’s Targets" subtitle={tomorrow.planned ? describePlan(tomorrow.planned) : 'Nothing planned'}>
      {result.ok ? (
        <>
          <View style={styles.calorieBox}>
            <Text style={styles.tomorrowCalories}>{result.targets.calories.toLocaleString()} kcal</Text>
          </View>
          <View style={styles.macroRow}>
            <MacroTile macro="protein" label="Protein" value={`${result.targets.proteinG} g`} />
            <MacroTile macro="carbs" label="Carbs" value={`${result.targets.carbsG} g`} />
            <MacroTile macro="fat" label="Fat" value={`${result.targets.fatG} g`} />
          </View>
          {tomorrow.explanation ? (
            <View style={styles.explanation}>
              <Ionicons name="flash" size={14} color={ACCENT} />
              <Text style={styles.explanationText}>{tomorrow.explanation}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Text style={ui.hint}>
            Add your {result.missing.map((m) => (m === 'body weight' ? 'weight' : m)).join(', ')} on the Player tab to
            see tomorrow’s targets.
          </Text>
          <Button label="Set up your profile" variant="secondary" onPress={() => router.push('/player')} />
        </>
      )}
      {tomorrow.planned ? null : (
        <Button label="Plan tomorrow" variant="secondary" icon="calendar" onPress={() => router.push('/plan')} />
      )}
      {tomorrow.recovery ? <Text style={ui.hint}>{tomorrow.recovery}</Text> : null}
    </Section>
  );
}

/** A boxed figure on a paper card: a small label, a large value and a tag for where it came from. */
function Stat({ label, value, tag }: { label: string; value: string; tag?: string | null }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}${tag ? `, ${tag}` : ''}`}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        {tag ? <Pill label={tag} tone="paper" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 24 },
  paperHint: { fontSize: 13, lineHeight: 18, color: PAPER_MUTED },
  paperNote: { fontSize: 13, lineHeight: 18, color: ACCENT_DEEP },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, gap: 2, borderWidth: 1, borderColor: PAPER_BORDER, borderRadius: 10, padding: 10 },
  statLabel: { fontSize: 13, fontWeight: '600', color: PAPER_MUTED },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statValue: { fontSize: 22, fontWeight: '800', color: PAPER_INK },
  caloriesRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  calories: { fontSize: 22, fontWeight: '800', color: PAPER_INK },
  caloriesTarget: { fontSize: 15, fontWeight: '600', color: PAPER_MUTED },
  caloriesLeft: { fontSize: 13, fontWeight: '600', color: ACCENT_DEEP },
  macroRow: { flexDirection: 'row', gap: 8 },
  findings: { gap: 8, marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: PAPER_BORDER },
  findingsTitle: { fontSize: 15, fontWeight: '700', color: PAPER_INK },
  finding: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  findingText: { flex: 1, fontSize: 14, lineHeight: 20, color: PAPER_INK },
  missing: { gap: 4 },
  calorieBox: { backgroundColor: ACCENT_TINT, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  tomorrowCalories: { fontSize: 26, fontWeight: '800', color: ACCENT },
  explanation: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  explanationText: { flex: 1, fontSize: 14, lineHeight: 20, color: INK },
});
