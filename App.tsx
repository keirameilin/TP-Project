import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DailyLogScreen from './src/features/dailyLog/DailyLogScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <DailyLogScreen />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
