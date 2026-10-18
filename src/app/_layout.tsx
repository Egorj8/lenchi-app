import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ToastProvider } from '@/components/Toast';
import { DbProvider } from '@/db/provider';
import { migrateDbIfNeeded } from '@/db/schema';
import { colors } from '@/theme';

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    primary: colors.yellow,
  },
};

function Loading() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.yellow} size="large" />
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="light" />
      <Suspense fallback={<Loading />}>
        <DbProvider onInit={migrateDbIfNeeded}>
          <ToastProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.yellow,
              headerTitleStyle: { color: colors.text, fontWeight: '700' },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: colors.bg },
              headerBackButtonDisplayMode: 'minimal',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="appointment/edit" options={{ presentation: 'modal', title: 'Запись' }} />
            <Stack.Screen name="appointment/[id]" options={{ title: 'Запись' }} />
            <Stack.Screen name="client/edit" options={{ presentation: 'modal', title: 'Клиент' }} />
            <Stack.Screen name="client/[id]" options={{ title: 'Клиент' }} />
            <Stack.Screen name="client/import" options={{ title: 'Импорт из контактов' }} />
            <Stack.Screen name="event/edit" options={{ presentation: 'modal', title: 'Личное дело' }} />
            <Stack.Screen name="rebook" options={{ title: 'Пора на коррекцию' }} />
            <Stack.Screen name="birthdays" options={{ title: 'Дни рождения' }} />
            <Stack.Screen name="waitlist" options={{ title: 'Лист ожидания' }} />
            <Stack.Screen name="waitlist-edit" options={{ presentation: 'modal', title: 'Лист ожидания' }} />
            <Stack.Screen name="services" options={{ title: 'Услуги и цены' }} />
            <Stack.Screen name="service-edit" options={{ presentation: 'modal', title: 'Услуга' }} />
            <Stack.Screen name="slots" options={{ title: 'Свободные окошки' }} />
            <Stack.Screen name="settings" options={{ title: 'Настройки' }} />
            <Stack.Screen name="trash" options={{ title: 'Корзина' }} />
            <Stack.Screen name="backups" options={{ title: 'Автокопии' }} />
            <Stack.Screen name="requests" options={{ title: 'Заявки с сайта' }} />
            <Stack.Screen name="online" options={{ title: 'Онлайн-запись' }} />
          </Stack>
          </ToastProvider>
        </DbProvider>
      </Suspense>
    </ThemeProvider>
  );
}
