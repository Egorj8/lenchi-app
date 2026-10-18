import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useDb } from '@/db/provider';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { ActionCircle, Avatar, Badge, Button, Card, Empty, IconButton, SectionTitle, success, tap } from '@/components/ui';
import {
  deleteAppointment,
  restoreAppointment,
  getAppointment,
  getAppointmentServices,
  getSettings,
  setAppointmentStatus,
  setReminded,
  type Appointment,
  type ApptService,
  type Settings,
  type Status,
} from '@/db/queries';
import { colors, radius, space, statusMeta } from '@/theme';
import { fmtDayLong, fmtDuration, fmtTime, relativeDay } from '@/utils/date';
import { call, money, openTelegram, openWhatsApp, reminderText } from '@/utils/messages';
import { formatPhone } from '@/utils/phone';
import { emitDataChanged } from '@/utils/events';
import { offerFreedSlot } from '@/utils/waitlistOffer';

export default function AppointmentScreen() {
  const db = useDb();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [a, setA] = useState<Appointment | null | undefined>(undefined);
  const [services, setServices] = useState<ApptService[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const appt = await getAppointment(db, Number(id));
    setA(appt);
    if (appt) setServices(await getAppointmentServices(db, appt.id));
    setSettings(await getSettings(db));
  }, [db, id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (a === undefined || !settings) return null;
  if (a === null) return <Empty icon="alert-circle-outline" title="Запись не найдена" text="Возможно, её удалили." />;

  const meta = statusMeta[a.status];
  const cur = settings.currency;
  const rel = relativeDay(a.date);

  const setStatus = async (st: Status) => {
    const wasActive = a.status === 'planned';
    await setAppointmentStatus(db, a.id, st);
    success();
    load();
    emitDataChanged();
    if (st === 'cancelled' && wasActive) offerFreedSlot(db, a.date, a.start);
  };

  // удаляем сразу, но с возможностью вернуть (и запись остаётся в корзине)
  const remove = async () => {
    const id = a.id;
    const freed = a.status === 'planned' ? { date: a.date, start: a.start } : null;
    await deleteAppointment(db, id);
    router.back();
    emitDataChanged();
    if (freed) setTimeout(() => offerFreedSlot(db, freed.date, freed.start), 400);
    toast({
      message: 'Запись удалена',
      icon: 'trash-outline',
      action: { label: 'Вернуть', onPress: () => restoreAppointment(db, id).then(emitDataChanged) },
    });
  };

  const text = reminderText(a, settings);
  // отмечаем, что напоминание отправлено — для утренней сводки «кому не отправлено»
  const remind = async (send: () => void) => {
    send();
    await setReminded(db, a.id);
    emitDataChanged();
    load();
  };
  const phone = a.client_phone ?? '';
  const tg = a.client_telegram ?? '';

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.content}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <IconButton icon="create-outline" label="Изменить" color={colors.yellow}
              onPress={() => router.push({ pathname: '/appointment/edit', params: { id: String(a.id) } })} />
          ),
        }}
      />

      <View style={s.hero}>
        <Text style={s.date}>{rel ? `${rel}, ` : ''}{fmtDayLong(a.date)}</Text>
        <Text style={s.time}>{fmtTime(a.start)} – {fmtTime(a.start + a.duration)}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <Badge label={meta.label} color={meta.color} />
          <Text style={s.muted}>{fmtDuration(a.duration)}</Text>
        </View>
      </View>

      {a.client_id ? (
        <Card onPress={() => router.push(`/client/${a.client_id}`)} style={s.client}>
          <Avatar name={a.client_name ?? '?'} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={s.clientName}>{a.client_name}</Text>
            <Text style={s.muted}>{formatPhone(phone) || (tg ? `@${tg}` : 'Нет контактов')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.dim} />
        </Card>
      ) : (
        <Card><Text style={s.muted}>Клиентка не указана</Text></Card>
      )}

      {a.client_id ? (
        <>
          <SectionTitle
            right={a.reminded_at ? (
              <View style={s.sent}>
                <Ionicons name="checkmark-done" size={14} color={colors.success} />
                <Text style={s.sentText}>отправлено</Text>
              </View>
            ) : null}
          >
            Напомнить о записи
          </SectionTitle>
          <View style={s.actions}>
            <ActionCircle icon="logo-whatsapp" label="WhatsApp" accent onPress={() => remind(() => openWhatsApp(phone, text))} />
            <ActionCircle icon="paper-plane" label="Telegram" onPress={() => remind(() => openTelegram(tg, phone, text))} />
            <ActionCircle icon="call" label="Позвонить" onPress={() => call(phone)} />
          </View>
          <View style={s.preview}>
            <Text style={s.previewText}>{text}</Text>
          </View>
        </>
      ) : null}

      <SectionTitle>Услуги</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {services.length === 0 ? (
          <Text style={[s.muted, { paddingVertical: 12 }]}>Услуги не выбраны</Text>
        ) : (
          services.map((sv, i) => (
            <View key={i} style={[s.line, i < services.length - 1 && s.lineBorder]}>
              <Text style={s.lineName}>{sv.name}</Text>
              <Text style={s.linePrice}>{money(sv.price, cur)}</Text>
            </View>
          ))
        )}
        <View style={[s.line, { borderTopWidth: 1, borderTopColor: colors.border }]}>
          <Text style={[s.lineName, { fontWeight: '700' }]}>Итого</Text>
          <Text style={[s.linePrice, { fontSize: 20 }]}>{money(a.price, cur)}</Text>
        </View>
      </Card>

      {a.notes ? (
        <>
          <SectionTitle>Заметка</SectionTitle>
          <Card><Text style={s.notes}>{a.notes}</Text></Card>
        </>
      ) : null}

      <SectionTitle>Статус визита</SectionTitle>
      <View style={s.statuses}>
        {(Object.keys(statusMeta) as Status[]).map((st) => {
          const m = statusMeta[st];
          const on = a.status === st;
          return (
            <Pressable
              key={st}
              onPress={() => { tap(); setStatus(st); }}
              style={({ pressed }) => [s.status, on && { borderColor: m.color, backgroundColor: m.color + '1f' }, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name={m.icon} size={22} color={on ? m.color : colors.muted} />
              <Text style={[s.statusText, on && { color: m.color }]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {a.status === 'planned' ? (
        <Button title="Клиентка пришла" icon="checkmark-circle" onPress={() => setStatus('done')} style={{ marginTop: space.lg }} />
      ) : null}
      <Button title="Удалить запись" icon="trash-outline" variant="danger" onPress={remove} style={{ marginTop: space.md }} />
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  sent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sentText: { color: colors.success, fontSize: 12, fontWeight: '700' },
  content: { padding: space.lg, paddingTop: 0 },
  hero: { marginBottom: space.lg },
  date: { color: colors.muted, fontSize: 15 },
  time: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  muted: { color: colors.muted, fontSize: 14 },
  client: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clientName: { color: colors.text, fontSize: 18, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: space.md },
  preview: {
    marginTop: space.md, padding: space.md, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  previewText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, gap: 12 },
  lineBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  lineName: { color: colors.text, fontSize: 15, flex: 1 },
  linePrice: { color: colors.yellow1, fontSize: 15, fontWeight: '700' },
  notes: { color: colors.text, fontSize: 15, lineHeight: 22 },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  status: {
    flexBasis: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  statusText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
});
