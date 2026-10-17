import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Empty, tap } from '@/components/ui';
import { useDb } from '@/db/provider';
import { colors, radius, space } from '@/theme';
import { listLocalBackups, shareLocalBackup, type BackupKind, type LocalBackup } from '@/utils/backupFiles';
import { showAlert } from '@/utils/dialog';
import { confirmAndRestore, fmtDateTime } from '@/utils/restoreFlow';

const KIND: Record<BackupKind, string> = {
  auto: 'Автокопия',
  manual: 'Сохранённая вручную',
  'before-restore': 'Перед восстановлением',
};

export default function BackupsScreen() {
  const db = useDb();
  const [items, setItems] = useState<LocalBackup[]>([]);

  useFocusEffect(useCallback(() => { setItems(listLocalBackups()); }, []));

  const restore = async (b: LocalBackup) => {
    try {
      confirmAndRestore(db, await b.file.text(), () => router.back());
    } catch (e) {
      showAlert('Не удалось прочитать копию', String(e));
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.content}>
      <Text style={s.lead}>
        Приложение раз в день само сохраняет копию на телефоне и хранит последние 7. Эти копии пропадут, если удалить приложение, — поэтому время от времени отправляйте копию себе в Telegram или на Google Диск.
      </Text>
      {items.length === 0 ? (
        <Empty icon="cloud-offline-outline" title="Копий пока нет" text="Первая автокопия появится сегодня." />
      ) : (
        items.map((b) => (
          <Card key={b.name} style={s.row}>
            <View style={s.icon}>
              <Ionicons name={b.kind === 'auto' ? 'time-outline' : b.kind === 'manual' ? 'cloud-upload-outline' : 'shield-checkmark-outline'} size={20} color={colors.yellow} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{fmtDateTime(b.date)}</Text>
              <Text style={s.sub}>{KIND[b.kind]} · {Math.max(1, Math.round(b.size / 1024))} КБ</Text>
            </View>
            <Pressable accessibilityLabel="Отправить" hitSlop={6} onPress={() => { tap(); shareLocalBackup(b); }} style={s.btn}>
              <Ionicons name="share-social-outline" size={18} color={colors.text} />
            </Pressable>
            <Pressable accessibilityLabel="Восстановить" hitSlop={6} onPress={() => { tap(); restore(b); }} style={[s.btn, s.btnMain]}>
              <Ionicons name="arrow-undo" size={18} color={colors.ink} />
            </Pressable>
          </Card>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.sm },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: space.sm, paddingVertical: 12 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,198,26,0.1)' },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  btn: {
    width: 40, height: 40, borderRadius: radius.sm + 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  btnMain: { backgroundColor: colors.yellow, borderColor: colors.yellow },
});
