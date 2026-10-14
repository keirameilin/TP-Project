import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SelectedDateProvider } from '../features/dailyLog/SelectedDate';
import { PITCH } from '../features/dailyLog/ui';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* The Log and Food tabs share the day being viewed. */}
      <SelectedDateProvider>
        {/* The tabs draw their own titles. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: PITCH } }} />
      </SelectedDateProvider>
      {/* Light icons on the dark forest background. */}
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
