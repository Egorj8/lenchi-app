import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Card, Chip, Empty, success, tap } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useDb } from '@/db/provider';
import {
  emptyTrash,
  getSettings,
  listTrashAppointments,
  listTrashClients,
  purgeAppointment,
  purgeClient,
  restoreAppointment,
  restoreClient,
  TRASH_DAYS,
  type TrashAppointment,
  type TrashClient,
} from '@/db/queries';
import { colors, radius, space } from '@/theme';
import { fmtDayShort, fmtTime, plural } from '@/utils/date';
import { showAlert } from '@/utils/dialog';
import { money } from '@/utils/messages';
import { formatPhone } from '@/utils/phone';

type Tab = 'appts' | 'clients';

function daysLeft(deletedAt: number) {
  const left = TRASH_DAYS - Math.floor((Date.now() - deletedAt) / 86_400_000);
  return Math.max(0, left);
}

export default function TrashScreen() {
  const db = useDb();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('appts');
  const [appts, setAppts] = useState<TrashAppointment[]>([]);
  const [clients, setClients] = useState<TrashClient[]>([]);
  const [cur, setCur] = useState('₺');

  const load = useCallback(async () => {
    const [a, c, s] = await Promise.all([listTrashAppointments(db), listTrashClients(db), getSettings(db)]);
    setAppts(a);
    setClients(c);
    setCur(s.currency);
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = appts.length + clients.length;

  const restore = async (kind: Tab, id: number) => {
    if (kind === 'appts') await restoreAppointment(db, id);
    else await restoreClient(db, id);
    success();
    toast({ message: kind === 'appts' ? 'Запись возвращена' : 'Клиентка возвращена', icon: 'arrow-undo' });
    load();
  };

  const purge = (kind: Tab, id: number) =>
    showAlert('Удалить навсегда?', 'Вернуть будет нельзя.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          if (kind === 'appts') await purgeAppointment(db, id);
          else await purgeClient(db, id);
          load();
        },
      },
    ]);

  const clearAll = () =>
    showAlert('Очистить корзину?', `Будет удалено навсегда: ${total} ${plural(total, 'объект', 'объекта', 'объектов')}.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Очистить', style: 'destructive', onPress: async () => { await emptyTrash(db); load(); } },
    ]);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.content}>
      <Stack.Screen
        options={{
          headerRight: () =>
            total ? (
              <Pressable onPress={() => { tap(); clearAll(); }} hitSlop={8}>
                <Text style={s.clear}>Очистить</Text>
              </Pressable>
            ) : null,
        }}
      />
      <Text style={s.lead}>Удалённое хранится здесь {TRASH_DAYS} дней, потом исчезает само.</Text>

      <View style={s.tabs}>
        <Chip label={`Записи · ${appts.length}`} selected={tab === 'appts'} onPress={() => setTab('appts')} />
        <Chip label={`Клиентки · ${clients.length}`} selected={tab === 'clients'} onPress={() => setTab('clients')} />
      </View>

      {tab === 'appts' ? (
        appts.length === 0 ? (
          <Empty icon="trash-outline" title="Удалённых записей нет" />
        ) : (
          appts.map((a) => (
            <Card key={a.id} style={s.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.title}>{fmtDayShort(a.date)} · {fmtTime(a.start)} · {a.client_name ?? 'Без клиента'}</Text>
                <Text style={s.sub} numberOfLines={1}>{a.services_label ?? 'Без услуг'} · {money(a.price, cur)}</Text>
                <Text style={s.left}>Удалится через {daysLeft(a.deleted_at)} дн.</Text>
              </View>
              <Actions onRestore={() => restore('appts', a.id)} onPurge={() => purge('appts', a.id)} />
            </Card>
          ))
        )
      ) : clients.length === 0 ? (
        <Empty icon="trash-outline" title="Удалённых клиенток нет" />
      ) : (
        clients.map((c) => (
          <Card key={c.id} style={s.row}>
            <Avatar name={c.name} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.title}>{c.name}</Text>
              {c.phone ? <Text style={s.sub}>{formatPhone(c.phone)}</Text> : null}
              <Text style={s.left}>Удалится через {daysLeft(c.deleted_at)} дн.</Text>
            </View>
            <Actions onRestore={() => restore('clients', c.id)} onPurge={() => purge('clients', c.id)} />
          </Card>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Actions({ onRestore, onPurge }: { onRestore: () => void; onPurge: () => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable accessibilityLabel="Вернуть" onPress={() => { tap(); onRestore(); }} style={({ pressed }) => [s.btn, s.btnRestore, pressed && { opacity: 0.6 }]}>
        <Ionicons name="arrow-undo" size={18} color={colors.ink} />
      </Pressable>
      <Pressable accessibilityLabel="Удалить навсегда" onPress={() => { tap(); onPurge(); }} style={({ pressed }) => [s.btn, pressed && { opacity: 0.6 }]}>
        <Ionicons name="close" size={18} color={colors.danger} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.sm },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: space.lg },
  clear: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: space.sm, paddingVertical: 12 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 13 },
  left: { color: colors.dim, fontSize: 12 },
  btn: {
    width: 40, height: 40, borderRadius: radius.sm + 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  btnRestore: { backgroundColor: colors.yellow, borderColor: colors.yellow },
});
