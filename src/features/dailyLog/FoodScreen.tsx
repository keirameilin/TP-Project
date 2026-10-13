import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { explainDayTargets, loadDayTargets, type DayTargetsResult } from '../targets';
import { DateNav } from './DateNav';
import { FoodSection } from './FoodSection';
import { useSelectedDate } from './SelectedDate';
import { useDailyLogRepos } from './useDailyLogRepos';
import { ON_PITCH, Screen, styles as ui } from './ui';

/** The Food tab: the selected day's intake against targets, its meals, and adding food. */
export default function FoodScreen() {
  const { date } = useSelectedDate();
  const { repos, error } = useDailyLogRepos();
  const [targets, setTargets] = useState<DayTargetsResult | null>(null);

  // The day's targets follow its training: a logged session, else the plan. Runs on focus too, so a
  // new weigh-in, session, plan or profile change on another tab updates them.
  useFocusEffect(
    useCallback(() => {
      if (!repos) return;
      let cancelled = false;
      loadDayTargets(repos, date).then(
        (result) => {
          if (!cancelled) setTargets(result);
        },
        () => {
          // Targets are a nice-to-have here; food logging still works without them.
          if (!cancelled) setTargets(null);
        },
      );
      return () => {
        cancelled = true;
      };
    }, [repos, date]),
  );

  return (
    <Screen title="Food">
      <DateNav />
      {error ? (
        <Text style={ui.onPitchText}>{`Couldn't open your log: ${error}`}</Text>
      ) : !repos ? (
        <ActivityIndicator color={ON_PITCH} style={styles.loading} />
      ) : (
        // Keyed by date so switching days resets the list and any half-typed item.
        <FoodSection key={date} repos={repos} date={date} targets={targets}
          targetNote={targets?.ok ? explainDayTargets('This day', targets.targets) : null} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 24 },
});
