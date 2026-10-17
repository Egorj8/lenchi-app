import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tap } from '@/components/ui';
import { colors, radius } from '@/theme';
import { monthGrid, sameMonth } from '@/utils/calendar';
import { fromKey, weekday } from '@/utils/date';

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

type Props = {
  month: string;
  selected: string;
  today: string;
  stats: Record<string, { n: number; sum: number }>;
  /** число личных дел по дням — показываем голубой точкой */
  eventDays?: Record<string, number>;
  workDays: number[];
  onPressDay: (date: string) => void;
};

/** Месяц сеткой: число записей в каждом дне, рабочие дни подсвечены */
export function MonthView({ month, selected, today, stats, eventDays = {}, workDays, onPressDay }: Props) {
  const days = monthGrid(month);
  const max = Math.max(1, ...Object.values(stats).map((s) => s.n));
  return (
    <View>
      <View style={s.head}>
        {WD.map((w, i) => (
          <Text key={w} style={[s.wd, i >= 5 && { color: colors.dim }]}>{w}</Text>
        ))}
      </View>
      <View style={s.grid}>
        {days.map((d) => {
          const inMonth = sameMonth(d, month);
          const st = stats[d];
          const on = d === selected;
          const isToday = d === today;
          const work = workDays.includes(weekday(d));
          const load = st ? st.n / max : 0;
          return (
            <Pressable
              key={d}
              onPress={() => { tap(); onPressDay(d); }}
              style={({ pressed }) => [s.cell, pressed && { opacity: 0.6 }]}
            >
              <View
                style={[
                  s.inner,
                  work && inMonth && s.work,
                  isToday && s.today,
                  on && s.selected,
                  !inMonth && { opacity: 0.3 },
                ]}
              >
                <Text style={[s.num, on && { color: colors.ink }, !work && !on && { color: colors.muted }]}>
                  {fromKey(d).getDate()}
                </Text>
                <View style={s.marks}>
                  {st ? (
                    <View style={[s.badge, on && { backgroundColor: colors.ink }]}>
                      <Text style={[s.badgeText, on && { color: colors.yellow }]}>{st.n}</Text>
                    </View>
                  ) : null}
                  {eventDays[d] ? <View style={[s.eventDot, on && { backgroundColor: colors.ink }]} /> : null}
                </View>
                {/* полоска загрузки дня */}
                {st ? (
                  <View style={s.loadTrack}>
                    <View style={[s.loadBar, { width: `${load * 100}%` }, on && { backgroundColor: colors.ink }]} />
                  </View>
                ) : (
                  <View style={{ height: 2 }} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', marginBottom: 6 },
  wd: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 0.82, padding: 2 },
  inner: {
    flex: 1, borderRadius: radius.sm + 2, alignItems: 'center', justifyContent: 'center', gap: 3,
    borderWidth: 1, borderColor: 'transparent',
  },
  work: { backgroundColor: colors.surface, borderColor: colors.border },
  today: { borderColor: colors.yellow },
  selected: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  num: { color: colors.text, fontSize: 16, fontWeight: '700' },
  marks: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 16 },
  eventDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7aa7ff' },
  badge: { minWidth: 18, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.ink, fontSize: 10, fontWeight: '800' },
  loadTrack: { width: '60%', height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  loadBar: { height: 2, backgroundColor: colors.yellow },
});
