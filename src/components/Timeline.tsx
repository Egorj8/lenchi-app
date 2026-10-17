import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { tap, type IconName } from '@/components/ui';
import type { Appointment } from '@/db/queries';
import { colors, statusMeta } from '@/theme';
import { layoutLanes, visibleRange } from '@/utils/calendar';
import { fmtTime, weekday } from '@/utils/date';
import { category, type EventOccurrence } from '@/utils/personal';

const LABEL_W = 46;
const STEP = 15;

type Props = {
  days: string[];
  appts: Appointment[];
  /** Личные дела (уже развёрнутые по датам); дела «на весь день» в сетку не попадают */
  events?: EventOccurrence[];
  workStart: number;
  workEnd: number;
  workDays: number[];
  today: string;
  nowMin: number;
  hourHeight?: number;
  compact?: boolean;
  onPressAppt: (a: Appointment) => void;
  onPressEvent?: (e: EventOccurrence) => void;
  onPressSlot: (date: string, minute: number) => void;
};

type Block =
  | { key: string; kind: 'appt'; date: string; start: number; duration: number; a: Appointment }
  | { key: string; kind: 'event'; date: string; start: number; duration: number; e: EventOccurrence };

/**
 * Сетка по часам. Одна колонка — вид «День», семь — «Неделя».
 * Нажатие на пустое место создаёт запись или дело на это время (с шагом 15 минут).
 */
export function Timeline({
  days, appts, events = [], workStart, workEnd, workDays, today, nowMin, hourHeight = 64, compact,
  onPressAppt, onPressEvent, onPressSlot,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);

  const blocks = useMemo<Block[]>(
    () => [
      ...appts
        .filter((a) => days.includes(a.date))
        .map((a) => ({ key: `a${a.id}`, kind: 'appt' as const, date: a.date, start: a.start, duration: a.duration, a })),
      ...events
        .filter((e) => !e.all_day && days.includes(e.occurrence))
        .map((e) => ({ key: `e${e.id}-${e.occurrence}`, kind: 'event' as const, date: e.occurrence, start: e.start, duration: e.duration, e })),
    ],
    [appts, events, days],
  );

  const [from, to] = visibleRange(workStart, workEnd, blocks.map((b) => ({ id: b.key, start: b.start, duration: b.duration })));
  const pxPerMin = hourHeight / 60;
  const height = (to - from) * pxPerMin;
  const hours = useMemo(() => Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60), [from, to]);

  // раскладка пересекающихся записей и дел отдельно для каждого дня
  const lanes = useMemo(() => {
    const m = new Map<number | string, { lane: number; lanes: number }>();
    for (const d of days) {
      const dayItems = blocks
        .filter((b) => b.date === d && !(b.kind === 'appt' && b.a.status === 'cancelled'))
        .map((b) => ({ id: b.key, start: b.start, duration: b.duration }));
      for (const [id, l] of layoutLanes(dayItems)) m.set(id, l);
    }
    return m;
  }, [blocks, days]);

  // прокрутка: сегодня — к текущему времени, иначе — к самому раннему событию или началу рабочего дня
  // (иначе утренняя пробежка в 8:00 оказывается за краем экрана)
  const showsToday = days.includes(today);
  const key = days[0];
  const earliest = blocks.length ? Math.min(...blocks.map((b) => b.start)) : Infinity;
  useEffect(() => {
    const target = showsToday
      ? Math.max(from, Math.min(nowMin - 90, earliest - 30))
      : Math.max(from, Math.min(workStart, earliest) - 30);
    const id = setTimeout(() => scrollRef.current?.scrollTo({ y: (target - from) * pxPerMin, animated: false }), 0);
    return () => clearTimeout(id);
    // только при смене дня/недели или состава событий, а не при каждой перерисовке
  }, [key, from, earliest]);

  const slotPress = (date: string) => (ev: GestureResponderEvent) => {
    const y = ev.nativeEvent.locationY;
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

                {blocks
                  .filter((b) => b.date === d)
                  .map((b) => {
                    const l = lanes.get(b.key) ?? { lane: 0, lanes: 1 };
                    const top = (b.start - from) * pxPerMin;
                    const h = Math.max(b.duration * pxPerMin - 2, compact ? 22 : 30);
                    const pos = { top: top + 1, height: h, left: `${(l.lane / l.lanes) * 100}%` as const, width: `${100 / l.lanes}%` as const };
                    return b.kind === 'appt' ? (
                      <ApptBlock key={b.key} a={b.a} pos={pos} h={h} compact={compact} narrow={l.lanes > 1} onPress={onPressAppt} />
                    ) : (
                      <EventBlock key={b.key} e={b.e} pos={pos} h={h} compact={compact} narrow={l.lanes > 1} onPress={onPressEvent} />
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

type Pos = { top: number; height: number; left: `${number}%`; width: `${number}%` };

function ApptBlock({ a, pos, h, compact, narrow, onPress }: {
  a: Appointment; pos: Pos; h: number; compact?: boolean; narrow: boolean; onPress: (a: Appointment) => void;
}) {
  const meta = statusMeta[a.status];
  const faded = a.status === 'cancelled' || a.status === 'no_show';
  return (
    <Pressable
      onPress={() => { tap(); onPress(a); }}
      style={({ pressed }) => [
        s.block,
        pos,
        { backgroundColor: meta.color + (faded ? '14' : '2e'), borderLeftColor: meta.color },
        a.status === 'cancelled' && { borderStyle: 'dashed', borderLeftWidth: 1, borderWidth: 1, borderColor: colors.dim },
        pressed && { opacity: 0.7 },
      ]}
    >
      {compact ? (
        // в неделе колонка узкая: время видно по сетке, показываем только имя (или инициалы)
        <Text style={[s.blockTitle, s.compactText, faded && s.strike]} numberOfLines={3}>
          {narrow ? initials(a.client_name) : (a.client_name ?? '—').split(' ')[0]}
        </Text>
      ) : (
        <>
          <Text style={s.blockTime} numberOfLines={1}>{fmtTime(a.start)} – {fmtTime(a.start + a.duration)}</Text>
          <Text style={[s.blockTitle, faded && s.strike]} numberOfLines={1}>{a.client_name ?? 'Без клиента'}</Text>
          {h > 52 ? <Text style={s.blockSub} numberOfLines={h > 80 ? 2 : 1}>{a.services_label ?? ''}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

function EventBlock({ e, pos, h, compact, narrow, onPress }: {
  e: EventOccurrence; pos: Pos; h: number; compact?: boolean; narrow: boolean; onPress?: (e: EventOccurrence) => void;
}) {
  const c = category(e.category);
  const done = !!e.done;
  return (
    <Pressable
      onPress={() => { tap(); onPress?.(e); }}
      style={({ pressed }) => [
        s.block,
        s.event,
        pos,
        { borderColor: c.color + (e.busy ? 'aa' : '55'), backgroundColor: c.color + (done ? '10' : e.busy ? '26' : '12') },
        !e.busy && { borderStyle: 'dashed' },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={s.eventHead}>
        {!(compact && narrow) ? <Ionicons name={(done ? 'checkmark-circle' : c.icon) as IconName} size={compact ? 11 : 13} color={c.color} /> : null}
        {!compact ? <Text style={[s.blockTime, { color: c.color }]} numberOfLines={1}>{fmtTime(e.start)} – {fmtTime(e.start + e.duration)}</Text> : null}
        {e.repeat !== 'none' && !compact ? <Ionicons name="repeat" size={12} color={colors.muted} /> : null}
      </View>
      <Text
        style={[s.blockTitle, compact && s.compactText, done && s.strike]}
        // в узкой короткой ячейке недели — одна строка с «…», чтобы слово не рвалось по слогам
        numberOfLines={compact ? (h > 60 ? 3 : 1) : h > 40 ? 2 : 1}
      >
        {compact && narrow ? e.title.slice(0, 2) : e.title}
      </Text>
    </Pressable>
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
  // дела — «пилюля» с рамкой своего цвета, чтобы отличались от записей клиенток
  event: { borderWidth: 1, borderLeftWidth: 1, borderRadius: 10 },
  eventHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blockTime: { color: colors.text, fontSize: 11, fontWeight: '700' },
  blockTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  blockSub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  compactText: { fontSize: 11, lineHeight: 13 },
  strike: { textDecorationLine: 'line-through', opacity: 0.7 },
  now: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: colors.yellow, zIndex: 5 },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.yellow },
});
