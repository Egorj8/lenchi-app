import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Row, ScreenTitle, SectionTitle } from '@/components/ui';
import { exportAll } from '@/db/queries';
import { colors, space } from '@/theme';

export default function MoreScreen() {
  const db = useSQLiteContext();

  const backup = async () => {
    try {
      const data = await exportAll(db);
      await Share.share({ title: 'Резервная копия Lenchi Studio', message: JSON.stringify(data) });
    } catch (e) {
      Alert.alert('Не удалось сделать копию', String(e));
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <ScreenTitle subtitle="Инструменты мастера" title="Ещё" />

        <Card style={s.promo} onPress={() => router.push('/slots')}>
          <Text style={s.promoTitle}>⏱ Свободные окошки</Text>
          <Text style={s.promoText}>
            Приложение само соберёт пост со свободным временем для Telegram-канала. Скопируйте и опубликуйте.
          </Text>
        </Card>

        <SectionTitle>Работа</SectionTitle>
        <Card style={s.group}>
          <Row icon="pricetags-outline" label="Услуги и цены" onPress={() => router.push('/services')} />
          <Row icon="time-outline" label="Свободные окошки" onPress={() => router.push('/slots')} />
          <Row icon="settings-outline" label="Настройки" onPress={() => router.push('/settings')} last />
        </Card>

        <SectionTitle>Данные</SectionTitle>
        <Card style={s.group}>
          <Row icon="cloud-download-outline" label="Резервная копия" value="JSON" onPress={backup} last />
        </Card>
        <Text style={s.note}>
          Все данные хранятся только на этом телефоне. Время от времени сохраняйте резервную копию: отправьте её себе в Telegram «Избранное».
        </Text>

        <View style={s.footer}>
          <Text style={s.footerText}>Lenchi Studio · версия 1.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingTop: space.md },
  promo: { borderColor: 'rgba(255,198,26,0.45)', backgroundColor: 'rgba(255,198,26,0.08)' },
  promoTitle: { color: colors.yellow1, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  promoText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  group: { paddingVertical: 0 },
  note: { color: colors.dim, fontSize: 13, lineHeight: 19, marginTop: space.md },
  footer: { alignItems: 'center', marginTop: 40 },
  footerText: { color: colors.dim, fontSize: 12 },
});
