import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContactActions } from '@/components/ContactActions';
import { useToast } from '@/components/Toast';
import { Avatar, Card, Empty, Fab, tap } from '@/components/ui';
import { useDb } from '@/db/provider';
import {
  closeWaitEntry, getSettings, listAppointmentsBetween, listEventsBetween, listWaitlist, reopenWaitEntry,
  type Settings, type WaitEntry,
} from '@/db/queries';
import { colors, radius, space } from '@/theme';
import { fillTemplate, firstMatchingSlot, wishLabel } from '@/utils/attention';
import { addDays, fmtDayLong, fmtDayShort, fmtTime, todayKey } from '@/utils/date';
import { emitDataChanged } from '@/utils/events';
import { computeFreeSlots, type DaySlots } from '@/utils/freeSlots';
import { busyIntervals, expandEvents } from '@/utils/personal';
import { callName } from '@/utils/names';

const AHEAD = 21;

export default function WaitlistScreen() {
  const db = useDb();
  const toast = useToast();
  const [rows, setRows] = useState<WaitEntry[]>([]);
  const [slots, setSlots] = useState<DaySlots[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const load = useCallback(async () => {
    const t = todayKey();
    const [w, s, appts, ev] = await Promise.all([
      listWaitlist(db, t), getSettings(db), listAppointmentsBetween(db, t, addDays(t, AHEAD)), listEventsBetween(db, t, addDays(t, AHEAD)),
    ]);
    const occ = expandEvents(ev, t, addDays(t, AHEAD));
    const extra: Record<string, { start: number; end: number }[]> = {};
    for (const e of occ) extra[e.occurrence] = busyIntervals(occ, e.occurrence);
    setRows(w);
    setSettings(s);
    setSlots(computeFreeSlots(s, appts, t, AHEAD, extra));
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const close = async (w: WaitEntry) => {
    await closeWaitEntry(db, w.id);
    toast({
      message: `${w.client_name.split(' ')[0]} — убрана из листа`,
      icon: 'checkmark-circle',
      action: { label: 'Вернуть', onPress: () => reopenWaitEntry(db, w.id).then(load) },
    });
    emitDataChanged();
    load();
  };

  if (!settings) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.lead}>
          Кто хочет записаться, но подходящего времени нет. Приложение подскажет ближайшее подходящее окошко, а при отмене чужой записи само предложит освободившееся время.
        </Text>
        {rows.length === 0 ? (
          <Empty icon="hourglass-outline" title="Лист ожидания пуст" text="Нажмите «+», чтобы добавить клиентку и удобные ей дни." />
        ) : (
          rows.map((w) => {
            const slot = firstMatchingSlot(w, slots);
            const text = slot
              ? fillTemplate(settings.waitlist_template, {
                  имя: callName(w.client_name, w.client_call), дата: fmtDayLong(slot.date), время: fmtTime(slot.start), мастер: settings.master_name,
                })
              : '';
            return (
              <Card key={w.id} style={s.card}>
                <Pressable style={s.head} onPress={() => { tap(); router.push({ pathname: '/waitlist-edit', params: { id: String(w.id) } }); }}>
                  <Avatar name={w.client_name} size={42} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{w.client_name}</Text>
                    <Text style={s.sub}>{wishLabel(w)}{w.until ? ` · до ${fmtDayShort(w.until)}` : ''}</Text>
                    {w.note ? <Text style={s.note} numberOfLines={2}>{w.note}</Text> : null}
                  </View>
                  <Pressable accessibilityLabel="Убрать из листа" hitSlop={8} onPress={() => { tap(); close(w); }} style={s.done}>
                    <Ionicons name="checkmark" size={20} color={colors.success} />
                  </Pressable>
                </Pressable>
                {slot ? (
                  <>
                    <View style={s.slot}>
                      <Ionicons name="time" size={16} color={colors.yellow} />
                      <Text style={s.slotText}>Есть окошко: {fmtDayLong(slot.date)}, {fmtTime(slot.start)}</Text>
                    </View>
                    <ContactActions phone={w.client_phone} telegram={w.client_telegram} text={text} />
                  </>
                ) : (
                  <Text style={s.noSlot}>Подходящих окошек в ближайшие 3 недели нет</Text>
                )}
              </Card>
            );
          })
        )}
        <View style={{ height: 110 }} />
      </ScrollView>
      <Fab label="Добавить в лист ожидания" icon="person-add" onPress={() => router.push('/waitlist-edit')} />
    </View>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.sm },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: space.lg },
  card: { gap: space.md, marginBottom: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  note: { color: colors.dim, fontSize: 13, marginTop: 2 },
  done: {
    width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(95,211,141,0.12)', borderWidth: 1, borderColor: 'rgba(95,211,141,0.35)',
  },
  slot: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.sm + 2,
    backgroundColor: 'rgba(255,198,26,0.08)', borderWidth: 1, borderColor: 'rgba(255,198,26,0.3)',
  },
  slotText: { color: colors.yellow1, fontSize: 14, fontWeight: '600', flex: 1 },
  noSlot: { color: colors.dim, fontSize: 13 },
});
