// Вычисления для календаря: недели, сетка месяца, раскладка пересекающихся записей.
import { addDays, fromKey, toKey } from './date';

/** Понедельник недели, в которую входит дата */
export function weekStart(key: string): string {
  const shift = (fromKey(key).getDay() + 6) % 7;
  return addDays(key, -shift);
}

export function weekDays(key: string): string[] {
  const start = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthStart(key: string): string {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function addMonths(key: string, n: number): string {
  const d = fromKey(key);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  // сохраняем число, но не выходим за конец месяца (31 января + 1 месяц = 28/29 февраля)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toKey(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last)));
}

/** 6 недель × 7 дней, начиная с понедельника — сетка для вида «Месяц» */
export function monthGrid(key: string): string[] {
  const start = weekStart(monthStart(key));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

type Span = { id: number | string; start: number; duration: number };
export type Lane = { lane: number; lanes: number };

/**
 * Раскладывает пересекающиеся записи по колонкам, как в Google Календаре.
 * Записи, связанные цепочкой пересечений, образуют группу и делят ширину поровну.
 */
export function layoutLanes(items: Span[]): Map<number | string, Lane> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.duration - a.duration);
  const result = new Map<number | string, Lane>();
  let group: { id: number | string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const g of group) result.set(g.id, { lane: g.lane, lanes });
    group = [];
    laneEnds = [];
  };

  for (const it of sorted) {
    const end = it.start + it.duration;
    if (it.start >= groupEnd && group.length) flush();
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    group.push({ id: it.id, lane });
    groupEnd = Math.max(groupEnd, end);
  }
  if (group.length) flush();
  return result;
}

/** Видимый диапазон часов: рабочее время ± 1 час, расширяется под записи вне графика */
export function visibleRange(workStart: number, workEnd: number, items: Span[]): [number, number] {
  let from = workStart - 60;
  let to = workEnd + 60;
  for (const it of items) {
    from = Math.min(from, it.start);
    to = Math.max(to, it.start + it.duration);
  }
  from = Math.max(0, Math.floor(from / 60) * 60);
  to = Math.min(24 * 60, Math.ceil(to / 60) * 60);
  return [from, to];
}
