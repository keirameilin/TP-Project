import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { ACCENT, BORDER, MUTED, type IconName } from '../../features/dailyLog/ui';

/** Filled icon for the selected tab, outline for the rest. */
const tabIcon = (name: IconName, outline: IconName) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? name : outline} size={24} color={color} />;
  };

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        // Screens draw their own titles.
        headerShown: false,
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: MUTED,
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: BORDER },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Log', tabBarIcon: tabIcon('football', 'football-outline') }} />
      <Tabs.Screen name="food" options={{ title: 'Food', tabBarIcon: tabIcon('restaurant', 'restaurant-outline') }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: tabIcon('calendar', 'calendar-outline') }} />
      <Tabs.Screen name="player" options={{ title: 'Player', tabBarIcon: tabIcon('person', 'person-outline') }} />
    </Tabs>
  );
}
