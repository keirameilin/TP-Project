import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { loadBaselineTargets, type TargetsResult } from '../targets';
import { DateNav } from './DateNav';
import { FoodSection } from './FoodSection';
import { useSelectedDate } from './SelectedDate';
import { useDailyLogRepos } from './useDailyLogRepos';
import { ON_PITCH, Screen, styles as ui } from './ui';

/** The Food tab: the selected day's intake against targets, its meals, and adding food. */
export default function FoodScreen() {
  const { date } = useSelectedDate();
  const { repos, error } = useDailyLogRepos();
  const [targets, setTargets] = useState<TargetsResult | null>(null);

  // Runs on focus too, so a new weigh-in or profile change on another tab updates the targets.
  useFocusEffect(
    useCallback(() => {
      if (!repos) return;
      let cancelled = false;
      loadBaselineTargets(repos, date).then(
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
        <FoodSection key={date} repos={repos} date={date} targets={targets} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 24 },
});
