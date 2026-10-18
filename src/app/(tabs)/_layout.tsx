import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { AppState, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '@/components/ui';
import { useDb } from '@/db/provider';
import { emptyTrash, TRASH_DAYS } from '@/db/queries';
import { autoBackupIfNeeded } from '@/utils/backupFiles';
import { useDataChanged } from '@/utils/events';
import { rescheduleMorning, requestNotifyPermission } from '@/utils/notify';
import { colors } from '@/theme';

const icon = (name: IconName, active: IconName) =>
  ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? active : name} size={size} color={color as string} />
  );

export default function TabLayout() {
  // снизу учитываем системные кнопки Android / полоску жестов, иначе панель уходит под них
  const insets = useSafeAreaInsets();
  const db = useDb();

  // при запуске: автокопия раз в сутки и очистка корзины от старого
  useEffect(() => {
    autoBackupIfNeeded(db).catch((e) => console.warn('Автокопия не удалась', e));
    emptyTrash(db, TRASH_DAYS).catch(() => {});
  }, [db]);

  // утренняя сводка: при запуске спрашиваем разрешение и пересобираем расписание;
  // пересобираем при сворачивании (записи могли измениться) и при изменении данных
  const reschedule = useCallback(() => {
    rescheduleMorning(db).catch((e) => console.warn('Сводка не запланирована', e));
  }, [db]);
  useEffect(() => {
    requestNotifyPermission().catch(() => false).then(reschedule);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background' || st === 'active') reschedule();
    });
    return () => sub.remove();
  }, [reschedule]);
  useDataChanged(reschedule);
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
