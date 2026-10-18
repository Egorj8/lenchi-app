import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContactActions } from '@/components/ContactActions';
import { useToast } from '@/components/Toast';
import { Avatar, Card, Chip, Empty, tap } from '@/components/ui';
import { useDb } from '@/db/provider';
import {
  getSettings, listAppointmentsBetween, listEventsBetween, rebookCandidates, saveSettings, snoozeRebook,
  type RebookRow, type Settings,
} from '@/db/queries';
import { colors, space } from '@/theme';
import { fillTemplate, slotsShort } from '@/utils/attention';
import { addDays, fmtDayShort, plural, todayKey } from '@/utils/date';
import { emitDataChanged } from '@/utils/events';
import { computeFreeSlots, type DaySlots } from '@/utils/freeSlots';
import { busyIntervals, expandEvents } from '@/utils/personal';
import { callName } from '@/utils/names';

const INTERVALS = [14, 21, 28, 35];
const SNOOZE_DAYS = 7;

export default function RebookScreen() {
  const db = useDb();
  const toast = useToast();
  const [rows, setRows] = useState<RebookRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [slots, setSlots] = useState<DaySlots[]>([]);

  const load = useCallback(async () => {
    const t = todayKey();
    const s = await getSettings(db);
    const [r, appts, ev] = await Promise.all([
      rebookCandidates(db, t, Number(s.rebook_days) || 21),
      listAppointmentsBetween(db, t, addDays(t, 21)),
      listEventsBetween(db, t, addDays(t, 21)),
    ]);
    const occ = expandEvents(ev, t, addDays(t, 21));
    const extra: Record<string, { start: number; end: number }[]> = {};
    for (const e of occ) extra[e.occurrence] = busyIntervals(occ, e.occurrence);
    setSettings(s);
    setRows(r);
    setSlots(computeFreeSlots(s, appts, t, 21, extra));
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setInterval = async (d: number) => {
    await saveSettings(db, { rebook_days: String(d) });
    load();
  };

  // написали — прячем на неделю, чтобы список не напоминал о той же клиентке
  const snooze = async (r: RebookRow) => {
    await snoozeRebook(db, r.id, addDays(todayKey(), SNOOZE_DAYS));
    toast({
      message: `${r.name.split(' ')[0]} — скрыта на ${SNOOZE_DAYS} дней`,
      icon: 'time-outline',
      action: { label: 'Вернуть', onPress: () => snoozeRebook(db, r.id, null).then(load) },
    });
    emitDataChanged();
    load();
  };

  if (!settings) return null;
  const days = Number(settings.rebook_days) || 21;
  const free = slotsShort(slots, 3);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.content}>
      <Text style={s.lead}>
        Клиентки, которые были больше {days} {plural(days, 'дня', 'дней', 'дней')} назад и ещё не записаны. Сообщение уже содержит ближайшие свободные окошки.
      </Text>
      <Text style={s.label}>Напоминать через</Text>
      <View style={s.row}>
        {INTERVALS.map((d) => <Chip key={d} label={`${d} дн.`} selected={days === d} onPress={() => setInterval(d)} />)}
      </View>

      {rows.length === 0 ? (
        <Empty icon="sparkles-outline" title="Все клиентки записаны" text="Как только кому-то пора обновить маникюр, она появится здесь." />
      ) : (
        rows.map((r) => {
          const text = fillTemplate(settings.rebook_template, {
            имя: callName(r.name, r.call_name), дней: String(r.days_since), окошки: free, мастер: settings.master_name,
          });
          return (
            <Card key={r.id} style={s.card}>
              <Pressable style={s.head} onPress={() => { tap(); router.push(`/client/${r.id}`); }}>
                <Avatar name={r.name} size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{r.name}</Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {r.days_since} {plural(r.days_since, 'день', 'дня', 'дней')} назад · {fmtDayShort(r.last_visit)}
                    {r.last_services ? ` · ${r.last_services}` : ''}
                  </Text>
                </View>
                <View style={[s.badge, r.days_since >= days + 14 && s.badgeLate]}>
                  <Text style={s.badgeText}>{r.days_since} дн.</Text>
                </View>
              </Pressable>
              <ContactActions phone={r.phone} telegram={r.telegram} text={text} onSent={() => snooze(r)} />
            </Card>
          );
        })
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.sm },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: space.lg },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.lg },
  card: { gap: space.md, marginBottom: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,198,26,0.15)' },
  badgeLate: { backgroundColor: 'rgba(255,107,107,0.18)' },
  badgeText: { color: colors.yellow1, fontSize: 12, fontWeight: '800' },
});
