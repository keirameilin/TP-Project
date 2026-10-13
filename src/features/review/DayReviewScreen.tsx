import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { isValidDateString, toLocalDateString } from '../../lib/dates';
import { useDailyLogRepos } from '../dailyLog/useDailyLogRepos';
import {
  ACCENT,
  ACCENT_TINT,
  Button,
  INK,
  MACRO_COLORS,
  MUTED,
  ON_PITCH,
  PitchLink,
  Screen,
  Section,
  styles as ui,
} from '../dailyLog/ui';
import { EFFORT_SOURCE_LABELS } from '../intensity/sessionText';
import { describePlan } from '../planning';
import { SESSION_LABELS } from '../training/labels';
import { loadDayReview, type DayReviewData, type TomorrowTargets } from './loadReview';
import type { DayReview, Outcome } from './review';

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
 * The end-of-day review for one date: what the session was, what in the player's own logs may have
 * played a part, what the app can't see, and tomorrow's targets. Rest days show only the targets.
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
    <Screen title={isRest ? 'Tomorrow’s targets' : 'Day review'}>
      <PitchLink label="‹ Back to the log" onPress={goBack} />
      <Text style={ui.onPitchText}>{longDate(date)}</Text>
      {problem ? (
        <Text style={ui.onPitchText}>{`Couldn't open the review: ${problem}`}</Text>
      ) : !data ? (
        <ActivityIndicator color={ON_PITCH} style={styles.loading} />
      ) : (
        <>
          {isRest ? null : <Summary data={data} />}
          {data.review ? <Findings review={data.review} /> : null}
          <Tomorrow tomorrow={data.tomorrow} />
        </>
      )}
    </Screen>
  );
}

function Summary({ data }: { data: DayReviewData }) {
  const { session, effort } = data;
  if (!session) {
    return (
      <Section title="Summary" icon="clipboard">
        <Text style={ui.hint}>No session is logged for this day.</Text>
      </Section>
    );
  }
  return (
    <Section title="Summary" icon="clipboard">
      <Row label="Session" value={`${SESSION_LABELS[session.sessionType]} · ${session.durationMinutes} min`} />
      <Row
        label="Effort level (how hard it was)"
        value={effort?.effort ? `${effort.effort.level} / 10` : '—'}
        tag={effort?.effort ? EFFORT_SOURCE_LABELS[effort.effort.source] : null}
      />
      <Row
        label="How the session went (your rating)"
        value={session.sessionQuality === null ? '—' : `${session.sessionQuality} / 10`}
        tag={data.review ? OUTCOME_WORDS[data.review.outcome] : null}
      />
      {session.sessionQuality === null ? (
        <Text style={ui.hint}>Rate how the session went on the Log tab and save to see a review.</Text>
      ) : null}
    </Section>
  );
}

function Findings({ review }: { review: DayReview }) {
  return (
    <>
      <Section title={review.outcome === 'good' ? 'What lined up' : 'Why it may have gone this way'} icon="search">
        {review.findings.map((finding) => (
          <Bullet key={finding.text} text={finding.text} />
        ))}
        {review.nothingStandsOut ? <Text style={styles.plain}>{review.nothingStandsOut}</Text> : null}
        {review.cannotAssess.map((line) => (
          <Text key={line} style={ui.hint}>
            {line}
          </Text>
        ))}
        {review.patternMissing.length > 0 ? (
          <View style={styles.missing}>
            <Text style={ui.hint}>Not enough data yet for your own pattern between carbs and how sessions go. It needs:</Text>
            {review.patternMissing.map((line) => (
              <Text key={line} style={ui.hint}>{`• ${line}`}</Text>
            ))}
          </View>
        ) : null}
        <Text style={ui.hint}>
          Anything marked (estimate) is this app’s own assumption, not a figure from the research.
        </Text>
      </Section>

      <Section title="What the app can’t see" icon="eye-off">
        <Text style={styles.plain}>{review.blindSpots}</Text>
      </Section>
    </>
  );
}

function Tomorrow({ tomorrow }: { tomorrow: TomorrowTargets }) {
  const result = tomorrow.targets;
  return (
    <Section
      title="Tomorrow’s targets"
      icon="flame"
      subtitle={tomorrow.planned ? describePlan(tomorrow.planned) : 'Nothing planned'}
    >
      {result.ok ? (
        <>
          <View style={styles.calorieBox}>
            <Text style={styles.calories}>{result.targets.calories.toLocaleString()} kcal</Text>
          </View>
          <View style={styles.macroRow}>
            <Macro label="Protein" color={MACRO_COLORS.protein} grams={result.targets.proteinG} />
            <Macro label="Carbs" color={MACRO_COLORS.carbs} grams={result.targets.carbsG} />
            <Macro label="Fat" color={MACRO_COLORS.fat} grams={result.targets.fatG} />
          </View>
          {tomorrow.explanation ? <Text style={styles.plain}>{tomorrow.explanation}</Text> : null}
        </>
      ) : (
        <>
          <Text style={ui.hint}>
            Add your {result.missing.map((m) => (m === 'body weight' ? 'weight' : m)).join(', ')} on the Player tab to
            see tomorrow’s targets.
          </Text>
          <Button label="Set up your profile" variant="secondary" icon="person" onPress={() => router.push('/player')} />
        </>
      )}
      {tomorrow.planned ? null : (
        <Button label="Plan tomorrow" variant="secondary" icon="calendar" onPress={() => router.push('/plan')} />
      )}
      {tomorrow.recovery ? <Text style={ui.hint}>{tomorrow.recovery}</Text> : null}
    </Section>
  );
}

function Row({ label, value, tag }: { label: string; value: string; tag?: string | null }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}${tag ? `, ${tag}` : ''}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValue}>
        <Text style={styles.rowValueText}>{value}</Text>
        {tag ? <Text style={styles.tag}>{tag}</Text> : null}
      </View>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletDot} />
      <Text style={[styles.plain, styles.bulletText]}>{text}</Text>
    </View>
  );
}

function Macro(props: { label: string; color: string; grams: number }) {
  return (
    <View style={styles.macro} accessible accessibilityLabel={`${props.label}: ${props.grams} grams`}>
      <View style={styles.macroLabelRow}>
        <View style={[styles.macroDot, { backgroundColor: props.color }]} />
        <Text style={styles.macroLabel}>{props.label}</Text>
      </View>
      <Text style={styles.macroValue}>{props.grams} g</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 24 },
  plain: { fontSize: 15, lineHeight: 21, color: INK },
  row: { gap: 2 },
  rowLabel: { fontSize: 13, fontWeight: '600', color: MUTED },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowValueText: { fontSize: 18, fontWeight: '700', color: INK },
  tag: {
    fontSize: 12,
    fontWeight: '600',
    color: ACCENT,
    backgroundColor: ACCENT_TINT,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  bullet: { flexDirection: 'row', gap: 10 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT, marginTop: 8 },
  bulletText: { flex: 1 },
  missing: { gap: 4 },
  calorieBox: { backgroundColor: ACCENT_TINT, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  calories: { fontSize: 26, fontWeight: '700', color: ACCENT },
  macroRow: { flexDirection: 'row', gap: 8 },
  macro: { flex: 1, gap: 2 },
  macroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroLabel: { fontSize: 13, fontWeight: '600', color: MUTED },
  macroValue: { fontSize: 18, fontWeight: '700', color: INK },
});
