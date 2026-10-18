// Расчёт свободного времени — без зависимостей от React Native, чтобы покрывать тестами.
import type { Appointment, Settings } from '@/db/queries';
import { addDays, nowMinutes, parseTime, todayKey, weekday } from './date';

export type DaySlots = { date: string; times: number[] };

export function workDays(s: Settings): number[] {
  return s.work_days.split(',').filter(Boolean).map(Number);
}

/**
 * Для каждого рабочего дня ищем свободные промежутки между записями
 * и нарезаем их окошками длиной slot_length.
 */
/** extraBusy — занятые интервалы по датам (личные дела), минуты от полуночи */
export function computeFreeSlots(
  s: Settings,
  appts: Appointment[],
  from: string,
  days: number,
  extraBusy: Record<string, { start: number; end: number }[]> = {},
): DaySlots[] {
  const startMin = parseTime(s.work_start) ?? 600;
  const endMin = parseTime(s.work_end) ?? 1140;
  const len = Math.max(15, Number(s.slot_length) || 120);
  const wd = workDays(s);
  const today = todayKey();
  const result: DaySlots[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    if (!wd.includes(weekday(date))) continue;
    const busy = [
      ...appts.filter((a) => a.date === date && a.status !== 'cancelled').map((a) => [a.start, a.start + a.duration] as const),
      ...(extraBusy[date] ?? []).map((b) => [b.start, b.end] as const),
    ].sort((x, y) => x[0] - y[0]);

    let cursor = startMin;
    if (date === today) {
      // ближайшее время, округлённое вверх до 30 минут
      cursor = Math.max(cursor, Math.ceil((nowMinutes() + 30) / 30) * 30);
    }
    const free: [number, number][] = [];
    for (const [b0, b1] of busy) {
      if (b0 > cursor) free.push([cursor, Math.min(b0, endMin)]);
      cursor = Math.max(cursor, b1);
    }
    if (cursor < endMin) free.push([cursor, endMin]);

    const times: number[] = [];
    for (const [f0, f1] of free) {
      // окошко начинается с ровных :00 или :30 — «15:10» в посте для клиенток выглядит странно
      const first = Math.ceil(f0 / 30) * 30;
      for (let t = first; t + len <= f1; t += len) times.push(t);
    }
    if (times.length) result.push({ date, times });
  }
  return result;
}
