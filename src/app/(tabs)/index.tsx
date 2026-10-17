import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Card, Empty, Fab, IconButton, ScreenTitle, tap } from '@/components/ui';
import { busyDays, getSettings, listAppointmentsByDate, type Appointment, type Settings } from '@/db/queries';
import { colors, radius, space, statusMeta } from '@/theme';
import { addDays, plural, fmtDayLong, fmtMonth, fmtTime, fromKey, nowMinutes, parseTime, range, relativeDay, todayKey, weekday, weekdayShort } from '@/utils/date';
import { money, workDays } from '@/utils/messages';

const STRIP_DAYS = 60;

type Item = { kind: 'appt'; a: Appointment } | { kind: 'gap'; from: number; to: number };

export default function CalendarScreen() {
  const db = useSQLiteContext();
  const [selected, setSelected] = useState(todayKey());
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [dots, setDots] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const stripStart = useMemo(() => addDays(todayKey(), -7), []);
  const days = useMemo(() => range(stripStart, STRIP_DAYS), [stripStart]);
  const stripRef = useRef<FlatList<string>>(null);

  const load = useCallback(async () => {
    const [a, d, s] = await Promise.all([
      listAppointmentsByDate(db, selected),
      busyDays(db, stripStart, addDays(stripStart, STRIP_DAYS)),
      getSettings(db),
    ]);
    setAppts(a);
    setDots(d);
    setSettings(s);
  }, [db, selected, stripStart]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const i = days.indexOf(selected);
    if (i >= 0) stripRef.current?.scrollToIndex({ index: Math.max(0, i - 2), animated: true });
  }, [selected, days]);

  // Записи дня вперемешку со свободными промежутками внутри рабочего времени
  const items = useMemo<Item[]>(() => {
    if (!settings) return [];
    const isWorkDay = workDays(settings).includes(weekday(selected));
    const ws = parseTime(settings.work_start) ?? 600;
    const we = parseTime(settings.work_end) ?? 1140;
    const active = appts.filter((a) => a.status !== 'cancelled');
    const out: Item[] = [];
    let cursor = ws;
    if (selected === todayKey()) cursor = Math.max(cursor, Math.ceil(nowMinutes() / 15) * 15);
    if (selected < todayKey()) cursor = we;
    for (const a of appts) {
      if (a.status !== 'cancelled' && isWorkDay && a.start - cursor >= 60) out.push({ kind: 'gap', from: cursor, to: a.start });
      out.push({ kind: 'appt', a });
      if (a.status !== 'cancelled') cursor = Math.max(cursor, a.start + a.duration);
    }
    if (isWorkDay && we - cursor >= 60) out.push({ kind: 'gap', from: cursor, to: we });
    if (!isWorkDay && !active.length) return out.filter((i) => i.kind === 'appt');
    return out;
  }, [appts, settings, selected]);

  const dayTotal = appts.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show').reduce((s, a) => s + a.price, 0);
  const cur = settings?.currency ?? '₺';
  const rel = relativeDay(selected);
  const isWorkDay = settings ? workDays(settings).includes(weekday(selected)) : true;

  const newAt = (start?: number) =>
    router.push({ pathname: '/appointment/edit', params: { date: selected, ...(start !== undefined ? { start: String(start) } : {}) } });

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.header}>
        <ScreenTitle
          subtitle={fmtMonth(selected)}
          title={settings?.studio_name ?? 'Lenchi Studio'}
          right={
            selected !== todayKey() ? (
              <IconButton icon="today-outline" label="Сегодня" onPress={() => setSelected(todayKey())} color={colors.yellow} />
            ) : null
          }
        />
      </View>

      <FlatList
        ref={stripRef}
        horizontal
        data={days}
        keyExtractor={(d) => d}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.strip}
        initialScrollIndex={Math.max(0, days.indexOf(selected) - 2)}
        getItemLayout={(_, index) => ({ length: 60, offset: 60 * index, index })}
        onScrollToIndexFailed={() => {}}
        renderItem={({ item }) => {
          const on = item === selected;
          const isToday = item === todayKey();
          return (
            <Pressable
              onPress={() => {
                tap();
                setSelected(item);
              }}
              style={[s.day, on && s.dayOn, !on && isToday && s.dayToday]}
            >
              <Text style={[s.dayWd, on && s.dayTextOn]}>{weekdayShort(item)}</Text>
              <Text style={[s.dayNum, on && s.dayTextOn]}>{fromKey(item).getDate()}</Text>
              <View style={[s.dot, { opacity: dots[item] ? 1 : 0 }, on && { backgroundColor: colors.ink }]} />
            </Pressable>
          );
        }}
      />

      <ScrollView contentContainerStyle={s.content}>
        <View style={s.dayHead}>
          <View>
            <Text style={s.dayTitle}>{rel ? `${rel}, ` : ''}{fmtDayLong(selected)}</Text>
            <Text style={s.daySub}>
              {appts.length ? `${appts.length} ${plural(appts.length, 'запись', 'записи', 'записей')} · ${money(dayTotal, cur)}` : isWorkDay ? 'Рабочий день' : 'Выходной'}
            </Text>
          </View>
        </View>

        {items.length === 0 ? (
          <Empty
            icon={isWorkDay ? 'sparkles-outline' : 'cafe-outline'}
            title={isWorkDay ? 'Записей пока нет' : 'Выходной день'}
            text={isWorkDay ? 'Нажмите «+», чтобы записать клиентку.' : 'Можно отдохнуть или всё равно добавить запись.'}
          />
        ) : (
          items.map((it, i) =>
            it.kind === 'gap' ? (
              <Pressable key={`g${i}`} onPress={() => newAt(it.from)} style={({ pressed }) => [s.gap, pressed && { opacity: 0.6 }]}>
                <Ionicons name="add-circle-outline" size={18} color={colors.yellow} />
                <Text style={s.gapText}>
                  Свободно {fmtTime(it.from)}–{fmtTime(it.to)}
                </Text>
              </Pressable>
            ) : (
              <ApptCard key={it.a.id} a={it.a} currency={cur} />
            ),
          )
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      <Fab label="Новая запись" onPress={() => newAt()} />
    </SafeAreaView>
  );
}

function ApptCard({ a, currency }: { a: Appointment; currency: string }) {
  const meta = statusMeta[a.status];
  const faded = a.status === 'cancelled' || a.status === 'no_show';
  return (
    <Card style={[s.appt, faded && { opacity: 0.55 }]} onPress={() => router.push(`/appointment/${a.id}`)}>
      <View style={[s.apptBar, { backgroundColor: meta.color }]} />
      <View style={s.apptTime}>
        <Text style={s.apptStart}>{fmtTime(a.start)}</Text>
        <Text style={s.apptEnd}>{fmtTime(a.start + a.duration)}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[s.apptClient, a.status === 'cancelled' && { textDecorationLine: 'line-through' }]} numberOfLines={1}>
          {a.client_name ?? 'Без клиента'}
        </Text>
        <Text style={s.apptServices} numberOfLines={2}>{a.services_label ?? 'Услуга не выбрана'}</Text>
        <View style={s.apptFoot}>
          <Badge label={meta.label} color={meta.color} />
          <Text style={s.apptPrice}>{money(a.price, currency)}</Text>
        </View>
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.md },
  strip: { paddingHorizontal: space.md, paddingBottom: space.md },
  day: {
    width: 52, marginHorizontal: 4, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center', gap: 2,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  dayOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  dayToday: { borderColor: colors.yellow },
  dayWd: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  dayNum: { color: colors.text, fontSize: 20, fontWeight: '800' },
  dayTextOn: { color: colors.ink },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.yellow, marginTop: 2 },
  content: { paddingHorizontal: space.lg },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: space.md },
  dayTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  daySub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  gap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, marginBottom: space.md,
    borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,198,26,0.35)',
  },
  gapText: { color: colors.yellow1, fontSize: 14, fontWeight: '600' },
  appt: { flexDirection: 'row', gap: space.md, marginBottom: space.md, paddingLeft: space.lg + 4, overflow: 'hidden' },
  apptBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  apptTime: { width: 52 },
  apptStart: { color: colors.text, fontSize: 17, fontWeight: '800' },
  apptEnd: { color: colors.dim, fontSize: 13, marginTop: 2 },
  apptClient: { color: colors.text, fontSize: 16, fontWeight: '700' },
  apptServices: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  apptFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  apptPrice: { color: colors.yellow1, fontWeight: '700', fontSize: 15 },
});
