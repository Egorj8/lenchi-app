import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '@/components/ui';
import { colors } from '@/theme';

const icon = (name: IconName, active: IconName) =>
  ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? active : name} size={size} color={color as string} />
  );

export default function TabLayout() {
  // снизу учитываем системные кнопки Android / полоску жестов, иначе панель уходит под них
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.yellow,
        tabBarInactiveTintColor: colors.dim,
        tabBarStyle: {
          backgroundColor: colors.bg2,
          borderTopColor: colors.border,
          height: 60 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Календарь', tabBarIcon: icon('calendar-outline', 'calendar') }} />
      <Tabs.Screen name="clients" options={{ title: 'Клиенты', tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="finance" options={{ title: 'Финансы', tabBarIcon: icon('stats-chart-outline', 'stats-chart') }} />
      <Tabs.Screen name="more" options={{ title: 'Ещё', tabBarIcon: icon('grid-outline', 'grid') }} />
    </Tabs>
  );
}
