import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { tap } from '@/components/ui';
import type { Appointment } from '@/db/queries';
import { colors, statusMeta } from '@/theme';
import { layoutLanes, visibleRange } from '@/utils/calendar';
import { fmtTime, weekday } from '@/utils/date';

const LABEL_W = 46;
const STEP = 15;

type Props = {
  days: string[];
  appts: Appointment[];
  workStart: number;
  workEnd: number;
  workDays: number[];
  today: string;
  nowMin: number;
  hourHeight?: number;
  compact?: boolean;
  onPressAppt: (a: Appointment) => void;
  onPressSlot: (date: string, minute: number) => void;
};

/**
 * Сетка по часам. Одна колонка — вид «День», семь — «Неделя».
 * Нажатие на пустое место создаёт запись на это время (с шагом 15 минут).
 */
export function Timeline({
  days, appts, workStart, workEnd, workDays, today, nowMin, hourHeight = 64, compact, onPressAppt, onPressSlot,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const active = appts.filter((a) => days.includes(a.date));
  const [from, to] = visibleRange(workStart, workEnd, active);
  const pxPerMin = hourHeight / 60;
  const height = (to - from) * pxPerMin;
  const hours = useMemo(() => Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60), [from, to]);

  // раскладка пересекающихся записей отдельно для каждого дня
  const lanes = useMemo(() => {
    const m = new Map<number, { lane: number; lanes: number }>();
    for (const d of days) {
      const dayItems = active.filter((a) => a.date === d && a.status !== 'cancelled');
      for (const [id, l] of layoutLanes(dayItems)) m.set(id, l);
    }
    return m;
  }, [active, days]);

  // прокрутка к текущему времени или к началу рабочего дня
  const showsToday = days.includes(today);
  const key = days[0];
  useEffect(() => {
    const target = showsToday ? Math.max(from, nowMin - 90) : Math.max(from, workStart - 30);
    const id = setTimeout(() => scrollRef.current?.scrollTo({ y: (target - from) * pxPerMin, animated: false }), 0);
    return () => clearTimeout(id);
    // только при смене дня/недели, а не при каждой перерисовке
  }, [key, from]);

  const slotPress = (date: string) => (e: GestureResponderEvent) => {
    const y = e.nativeEvent.locationY;
    const minute = Math.floor((from + y / pxPerMin) / STEP) * STEP;
    tap();
    onPressSlot(date, Math.max(from, Math.min(to - STEP, minute)));
  };

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
      <View style={[s.wrap, { height: height + 12 }]}>
        {/* подписи часов */}
        <View style={{ width: LABEL_W }}>
          {hours.map((h) => (
            <Text key={h} style={[s.hour, { top: (h - from) * pxPerMin - 7 }]}>{fmtTime(h % 1440)}</Text>
          ))}
        </View>

        <View style={s.cols}>
          {/* линии сетки */}
          {hours.map((h) => (
            <View key={h} style={[s.line, { top: (h - from) * pxPerMin }]} />
          ))}
          {hours.slice(0, -1).map((h) => (
            <View key={`h${h}`} style={[s.halfLine, { top: (h + 30 - from) * pxPerMin }]} />
          ))}

          {days.map((d, i) => {
            const isWork = workDays.includes(weekday(d));
            return (
              <View key={d} style={[s.col, i > 0 && s.colBorder]}>
                {/* рабочее время подсвечено */}
                {isWork ? (
                  <View
                    pointerEvents="none"
                    style={[s.work, { top: (Math.max(workStart, from) - from) * pxPerMin, height: (Math.min(workEnd, to) - Math.max(workStart, from)) * pxPerMin }]}
                  />
                ) : null}
                <Pressable style={StyleSheet.absoluteFill} onPress={slotPress(d)} />

                {active
                  .filter((a) => a.date === d)
                  .map((a) => {
                    const meta = statusMeta[a.status];
                    const l = lanes.get(a.id) ?? { lane: 0, lanes: 1 };
                    const top = (a.start - from) * pxPerMin;
                    const h = Math.max(a.duration * pxPerMin - 2, compact ? 22 : 30);
                    const faded = a.status === 'cancelled' || a.status === 'no_show';
                    return (
                      <Pressable
                        key={a.id}
                        onPress={() => { tap(); onPressAppt(a); }}
                        style={({ pressed }) => [
                          s.block,
                          {
                            top: top + 1,
                            height: h,
                            left: `${(l.lane / l.lanes) * 100}%`,
                            width: `${100 / l.lanes}%`,
                            backgroundColor: meta.color + (faded ? '14' : '2e'),
                            borderLeftColor: meta.color,
                          },
                          a.status === 'cancelled' && { borderStyle: 'dashed', borderLeftWidth: 1, borderWidth: 1, borderColor: colors.dim },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        {compact ? (
                          // в неделе колонка узкая: время видно по сетке, показываем только имя (или инициалы)
                          <Text style={[s.blockTitle, s.compactText, faded && { textDecorationLine: 'line-through' }]} numberOfLines={3}>
                            {l.lanes > 1 ? initials(a.client_name) : (a.client_name ?? '—').split(' ')[0]}
                          </Text>
                        ) : (
                          <>
                            <Text style={s.blockTime} numberOfLines={1}>
                              {fmtTime(a.start)} – {fmtTime(a.start + a.duration)}
                            </Text>
                            <Text style={[s.blockTitle, faded && { textDecorationLine: 'line-through' }]} numberOfLines={1}>
                              {a.client_name ?? 'Без клиента'}
                            </Text>
                          </>
                        )}
                        {!compact && h > 52 ? (
                          <Text style={s.blockSub} numberOfLines={h > 80 ? 2 : 1}>{a.services_label ?? ''}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}

                {/* линия «сейчас» */}
                {d === today && nowMin >= from && nowMin <= to ? (
                  <View pointerEvents="none" style={[s.now, { top: (nowMin - from) * pxPerMin }]}>
                    <View style={s.nowDot} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

export const TIMELINE_LABEL_W = LABEL_W;

function initials(name: string | null) {
  return (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', paddingTop: 6, paddingRight: 8 },
  hour: { position: 'absolute', right: 8, color: colors.dim, fontSize: 11, fontWeight: '600' },
  cols: { flex: 1, flexDirection: 'row' },
  line: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  halfLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.03)' },
  col: { flex: 1, position: 'relative' },
  colBorder: { borderLeftWidth: 1, borderLeftColor: colors.border },
  work: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(255,198,26,0.035)' },
  block: {
    position: 'absolute', borderRadius: 8, borderLeftWidth: 3, paddingHorizontal: 5, paddingVertical: 3,
    overflow: 'hidden', borderWidth: 0,
  },
  blockTime: { color: colors.text, fontSize: 11, fontWeight: '700' },
  blockTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  blockSub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  compactText: { fontSize: 11, lineHeight: 13 },
  now: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: colors.yellow, zIndex: 5 },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.yellow },
});
