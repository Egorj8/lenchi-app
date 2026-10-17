import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Row, ScreenTitle, SectionTitle } from '@/components/ui';
import { useDb } from '@/db/provider';
import { getSettings, trashCount } from '@/db/queries';
import { colors, space } from '@/theme';
import { backupFilesSupported, markSharedBackup, pickBackupText, saveBackupToFolder, shareBackup } from '@/utils/backupFiles';
import { plural } from '@/utils/date';
import { showAlert } from '@/utils/dialog';
import { confirmAndRestore } from '@/utils/restoreFlow';

const DAY = 86_400_000;

export default function MoreScreen() {
  const db = useDb();
  const [lastShared, setLastShared] = useState(0);
  const [trash, setTrash] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([getSettings(db), trashCount(db)]);
    setLastShared(Number(s.last_shared_backup) || 0);
    setTrash(t);
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const daysAgo = lastShared ? Math.floor((Date.now() - lastShared) / DAY) : null;
  const stale = daysAgo === null || daysAgo >= 7;
  const lastLabel =
    daysAgo === null ? 'Ещё ни разу' : daysAgo === 0 ? 'Сегодня' : `${daysAgo} ${plural(daysAgo, 'день', 'дня', 'дней')} назад`;

  const send = async () => {
    setBusy(true);
    try {
      await shareBackup(db);
      // приложение не может узнать, куда ушёл файл, — спрашиваем, чтобы не показывать ложное «Отлично!»
      showAlert('Копия сохранилась?', 'Если вы отправили файл в Telegram, на Google Диск или в другое место — нажмите «Да».', [
        { text: 'Нет', style: 'cancel' },
        { text: 'Да', onPress: () => markSharedBackup(db).then(load) },
      ]);
    } catch (e) {
      showAlert('Не удалось отправить копию', String(e));
    } finally {
      setBusy(false);
    }
  };

  // Android не даёт выбрать корень «Загрузок» — подсказываем заранее, чтобы не путаться в системном окне
  const toFolder = () =>
    showAlert(
      'Сохранить в папку',
      'Сейчас откроется выбор папки. Выберите «Documents» или нажмите «Создать папку» и назовите её, например, «Lenchi». Саму папку «Download» Android выбрать не разрешает.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выбрать папку', onPress: pickFolderAndSave },
      ],
    );

  const pickFolderAndSave = async () => {
    try {
      if (await saveBackupToFolder(db)) {
        await load();
        showAlert('Копия сохранена', 'Файл лежит в выбранной папке телефона. Он сохранится, даже если удалить приложение.');
      }
    } catch (e) {
      showAlert('Не удалось сохранить копию', String(e));
    }
  };

  const fromFile = async () => {
    try {
      const text = await pickBackupText();
      if (text) confirmAndRestore(db, text, load);
    } catch (e) {
      showAlert('Не удалось открыть файл', String(e));
    }
  };

  const fromClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    if (!text.trim()) return showAlert('Буфер обмена пуст', 'Скопируйте текст старой резервной копии и попробуйте снова.');
    confirmAndRestore(db, text, load);
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

        <SectionTitle>Резервная копия</SectionTitle>
        <Card style={[s.backup, stale && s.backupStale]}>
          <View style={s.backupHead}>
            <Ionicons name={stale ? 'warning' : 'shield-checkmark'} size={22} color={stale ? colors.yellow : colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={s.backupTitle}>Последняя копия вне телефона</Text>
              <Text style={[s.backupSub, stale && { color: colors.yellow1 }]}>{lastLabel}</Text>
            </View>
          </View>
          <Text style={s.backupText}>
            {stale
              ? 'Если телефон потеряется или приложение удалят, данные пропадут. Отправьте копию себе в Telegram «Избранное» или на Google Диск.'
              : 'Отлично! Сохраняйте копию хотя бы раз в неделю.'}
          </Text>
          <Button title="Отправить копию" icon="paper-plane-outline" onPress={send} loading={busy} pulse={stale} />
          {backupFilesSupported ? (
            <Button title="Сохранить в папку на телефоне" icon="folder-open-outline" variant="secondary" onPress={toFolder} />
          ) : null}
        </Card>

        <Card style={[s.group, { marginTop: space.md }]}>
          <Row icon="document-attach-outline" label="Восстановить из файла" onPress={fromFile} />
          <Row icon="clipboard-outline" label="Восстановить из текста" value="буфер" onPress={fromClipboard} />
          {backupFilesSupported ? (
            <Row icon="time-outline" label="Автокопии на телефоне" onPress={() => router.push('/backups')} />
          ) : null}
          <Row icon="trash-outline" label="Корзина" value={trash ? String(trash) : undefined} onPress={() => router.push('/trash')} last />
        </Card>

        <View style={s.footer}>
          <Text style={s.footerText}>Lenchi Studio · версия 1.2</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingTop: space.md, paddingBottom: 40 },
  promo: { borderColor: 'rgba(255,198,26,0.45)', backgroundColor: 'rgba(255,198,26,0.08)' },
  promoTitle: { color: colors.yellow1, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  promoText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  group: { paddingVertical: 0 },
  backup: { gap: space.md },
  backupStale: { borderColor: 'rgba(255,198,26,0.45)' },
  backupHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backupTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  backupSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  backupText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  footer: { alignItems: 'center', marginTop: 32 },
  footerText: { color: colors.dim, fontSize: 12 },
});
