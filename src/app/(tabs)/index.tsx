import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MonthView } from '@/components/MonthView';
import { TIMELINE_LABEL_W, Timeline } from '@/components/Timeline';
import { Fab, IconButton, ScreenTitle, tap } from '@/components/ui';
import { useDb } from '@/db/provider';
import { busyDays, dayStats, getSettings, listAppointmentsBetween, type Appointment, type Settings } from '@/db/queries';
import { colors, radius, space } from '@/theme';
import { addMonths, monthGrid, sameMonth, weekDays } from '@/utils/calendar';
import { addDays, fmtDayLong, fmtDayShort, fmtMonth, fromKey, nowMinutes, parseTime, plural, relativeDay, todayKey, weekday, weekdayShort } from '@/utils/date';
import { money, workDays as getWorkDays } from '@/utils/messages';
import { useDataChanged } from '@/utils/events';

type Mode = 'day' | 'week' | 'month';
const MODES: [Mode, string][] = [['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц']];

export default function CalendarScreen() {
  const db = useDb();
  const [mode, setMode] = useState<Mode>('day');
  const [today, setToday] = useState(todayKey());
  const [nowMin, setNowMin] = useState(nowMinutes());
  const [selected, setSelected] = useState(todayKey());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [dots, setDots] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<Record<string, { n: number; sum: number }>>({});

  const week = useMemo(() => weekDays(selected), [selected]);

  // «Сегодня» и линия текущего времени обновляются раз в минуту и при возвращении в приложение
  const tick = useCallback(() => {
    setToday(todayKey());
    setNowMin(nowMinutes());
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') tick();
    });
    const id = setInterval(tick, 60_000);
    return () => {
      sub.remove();
      clearInterval(id);
    };
  }, [tick]);

  const load = useCallback(async () => {
    tick();
    setSettings(await getSettings(db));
    if (mode === 'month') {
      const grid = monthGrid(selected);
      setStats(await dayStats(db, grid[0], grid[41]));
    } else {
      const [a, d] = await Promise.all([listAppointmentsBetween(db, week[0], week[6]), busyDays(db, week[0], week[6])]);
      setAppts(a);
      setDots(d);
    }
  }, [db, mode, selected, week, tick]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useDataChanged(load);

  const cur = settings?.currency ?? '₺';
  const wd = settings ? getWorkDays(settings) : [1, 2, 3, 4, 5];
  const ws = parseTime(settings?.work_start ?? '') ?? 600;
  const we = parseTime(settings?.work_end ?? '') ?? 1140;
  const isWork = (d: string) => wd.includes(weekday(d));

  const dayAppts = appts.filter((a) => a.date === selected);
  const dayTotal = dayAppts
    .filter((a) => a.status !== 'cancelled' && a.status !== 'no_show')
    .reduce((sum, a) => sum + a.price, 0);

  const monthTotals = useMemo(() => {
    let n = 0;
    let sum = 0;
    for (const [d, st] of Object.entries(stats)) {
      if (!sameMonth(d, selected)) continue;
      n += st.n;
      sum += st.sum;
    }
    return { n, sum };
  }, [stats, selected]);

  const shift = (dir: 1 | -1) => setSelected(mode === 'month' ? addMonths(selected, dir) : addDays(selected, dir * 7));

  const navLabel =
    mode === 'month'
      ? fmtMonth(selected)
      : sameMonth(week[0], week[6])
        ? `${fromKey(week[0]).getDate()} – ${fmtDayShort(week[6])}`
        : `${fmtDayShort(week[0])} – ${fmtDayShort(week[6])}`;

  const newAt = (date: string, start?: number) =>
    router.push({ pathname: '/appointment/edit', params: { date, ...(start !== undefined ? { start: String(start) } : {}) } });

  const openAppt = (a: Appointment) => router.push(`/appointment/${a.id}`);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.header}>
        <ScreenTitle
          subtitle={fmtMonth(selected)}
          title={settings?.studio_name ?? 'Lenchi Studio'}
          right={
            selected !== today ? (
              <IconButton icon="today-outline" label="Сегодня" onPress={() => setSelected(today)} color={colors.yellow} />
            ) : null
          }
        />

        {/* переключатель вида */}
        <View style={s.segment}>
          {MODES.map(([m, label]) => (
            <Pressable key={m} onPress={() => { tap(); setMode(m); }} style={[s.segBtn, mode === m && s.segOn]}>
              <Text style={[s.segText, mode === m && s.ink]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {/* навигация по неделям / месяцам */}
        <View style={s.nav}>
          <IconButton icon="chevron-back" label="Назад" onPress={() => shift(-1)} />
          <Text style={s.navText}>{navLabel}</Text>
          <IconButton icon="chevron-forward" label="Вперёд" onPress={() => shift(1)} />
        </View>
      </View>

      {mode === 'day' ? (
        <>
          <View style={s.strip}>
            {week.map((d) => {
              const on = d === selected;
              return (
                <Pressable
                  key={d}
                  onPress={() => { tap(); setSelected(d); }}
                  style={[s.day, on && s.dayOn, !on && d === today && s.dayToday, !isWork(d) && !on && { opacity: 0.55 }]}
                >
                  <Text style={[s.dayWd, on && s.ink]}>{weekdayShort(d)}</Text>
                  <Text style={[s.dayNum, on && s.ink]}>{fromKey(d).getDate()}</Text>
                  <View style={[s.dot, { opacity: dots[d] ? 1 : 0 }, on && { backgroundColor: colors.ink }]} />
                </Pressable>
              );
            })}
          </View>
          <View style={s.summary}>
            <Text style={s.summaryTitle}>
              {relativeDay(selected) ? `${relativeDay(selected)}, ` : ''}
              {fmtDayLong(selected)}
            </Text>
            <Text style={s.summarySub}>
              {dayAppts.length
                ? `${dayAppts.length} ${plural(dayAppts.length, 'запись', 'записи', 'записей')} · ${money(dayTotal, cur)}`
                : isWork(selected)
                  ? 'Свободный день · нажмите на время, чтобы записать'
                  : 'Выходной'}
            </Text>
          </View>
          <Timeline
            days={[selected]}
            appts={appts}
            workStart={ws}
            workEnd={we}
            workDays={wd}
            today={today}
            nowMin={nowMin}
            onPressAppt={openAppt}
            onPressSlot={newAt}
          />
        </>
      ) : null}

      {mode === 'week' ? (
        <>
          <View style={[s.weekHead, { paddingLeft: TIMELINE_LABEL_W }]}>
            {week.map((d) => (
              <Pressable key={d} onPress={() => { tap(); setSelected(d); setMode('day'); }} style={s.weekHeadCell}>
                <Text style={[s.weekWd, !isWork(d) && { color: colors.dim }]}>{weekdayShort(d)}</Text>
                <View style={[s.weekNum, d === today && s.weekNumToday]}>
                  <Text style={[s.weekNumText, d === today && s.ink]}>{fromKey(d).getDate()}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <Timeline
            days={week}
            appts={appts}
            workStart={ws}
            workEnd={we}
            workDays={wd}
            today={today}
            nowMin={nowMin}
            hourHeight={56}
            compact
            onPressAppt={openAppt}
            onPressSlot={newAt}
          />
        </>
      ) : null}

      {mode === 'month' ? (
        <View style={{ paddingHorizontal: space.md }}>
          <MonthView
            month={selected}
            selected={selected}
            today={today}
            stats={stats}
            workDays={wd}
            onPressDay={(d) => {
              setSelected(d);
              setMode('day');
            }}
          />
          <View style={s.monthSummary}>
            <Ionicons name="stats-chart" size={18} color={colors.yellow} />
            <Text style={s.monthSummaryText}>
              {monthTotals.n
                ? `${monthTotals.n} ${plural(monthTotals.n, 'запись', 'записи', 'записей')} в месяце · ${money(monthTotals.sum, cur)}`
                : 'В этом месяце записей пока нет'}
            </Text>
          </View>
        </View>
      ) : null}

      <Fab label="Новая запись" onPress={() => newAt(selected)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.md },
  ink: { color: colors.ink },
  segment: {
    flexDirection: 'row', padding: 4, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.sm + 2, alignItems: 'center' },
  segOn: { backgroundColor: colors.yellow },
  segText: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: space.md },
  navText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  strip: { flexDirection: 'row', gap: 6, paddingHorizontal: space.lg },
  day: {
    flex: 1, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', gap: 1,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  dayOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  dayToday: { borderColor: colors.yellow },
  dayWd: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  dayNum: { color: colors.text, fontSize: 18, fontWeight: '800' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.yellow, marginTop: 2 },
  summary: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  summaryTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  summarySub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  weekHead: { flexDirection: 'row', paddingRight: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  weekHeadCell: { flex: 1, alignItems: 'center', gap: 2 },
  weekWd: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  weekNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  weekNumToday: { backgroundColor: colors.yellow },
  weekNumText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  monthSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space.lg, marginHorizontal: space.xs,
    padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  monthSummaryText: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
});
