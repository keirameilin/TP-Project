import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* Screens draw their own titles. */}
      <Stack screenOptions={{ headerShown: false }} />
      {/* Light icons on the pitch-green background. */}
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
