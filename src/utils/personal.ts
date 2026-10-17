// Личные дела мастера: категории, быстрые шаблоны и разворот повторов в конкретные даты.
import type { PersonalEvent } from '@/db/queries';
import { addDays, fromKey } from './date';

export type CategoryKey = 'personal' | 'sport' | 'shop' | 'health' | 'family' | 'work';

export const CATEGORIES: { key: CategoryKey; label: string; icon: string; color: string }[] = [
  { key: 'personal', label: 'Личное', icon: 'person-outline', color: '#7aa7ff' },
  { key: 'sport', label: 'Спорт', icon: 'barbell-outline', color: '#5fd38d' },
  { key: 'shop', label: 'Покупки', icon: 'cart-outline', color: '#ff9f5a' },
  { key: 'health', label: 'Здоровье', icon: 'medkit-outline', color: '#ff6b9a' },
  { key: 'family', label: 'Семья', icon: 'home-outline', color: '#c792ea' },
  { key: 'work', label: 'По работе', icon: 'briefcase-outline', color: '#a3a5ab' },
];

export function category(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[0];
}

/** Быстрые шаблоны: одно нажатие — название, категория и длительность */
export const QUICK: { title: string; category: CategoryKey; duration: number }[] = [
  { title: 'Магазин', category: 'shop', duration: 60 },
  { title: 'Пробежка', category: 'sport', duration: 45 },
  { title: 'Спортзал', category: 'sport', duration: 90 },
  { title: 'Обед', category: 'personal', duration: 45 },
  { title: 'Врач', category: 'health', duration: 60 },
  { title: 'Забрать детей', category: 'family', duration: 30 },
  { title: 'Закупка материалов', category: 'work', duration: 90 },
  { title: 'Перерыв', category: 'personal', duration: 30 },
];

export const REPEATS = [
  { key: 'none', label: 'Не повторять' },
  { key: 'daily', label: 'Каждый день' },
  { key: 'weekly', label: 'Каждую неделю' },
] as const;

export type Repeat = (typeof REPEATS)[number]['key'];

/** Одно появление дела в календаре (у повторяющегося дела их много) */
export type EventOccurrence = PersonalEvent & { occurrence: string };

/**
 * Разворачивает дела в конкретные даты диапазона [from, to].
 * Повтор «каждую неделю» — в тот же день недели, что и первая дата.
 */
export function expandEvents(events: PersonalEvent[], from: string, to: string): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  for (const e of events) {
    if (e.repeat === 'none') {
      if (e.date >= from && e.date <= to) out.push({ ...e, occurrence: e.date });
      continue;
    }
    const last = e.repeat_until && e.repeat_until < to ? e.repeat_until : to;
    let d = e.date >= from ? e.date : from;
    if (e.repeat === 'weekly') {
      // первый день недели «как у исходной даты», не раньше from
      const shift = (fromKey(e.date).getDay() - fromKey(d).getDay() + 7) % 7;
      d = addDays(d, shift);
    }
    const step = e.repeat === 'daily' ? 1 : 7;
    for (; d <= last; d = addDays(d, step)) out.push({ ...e, occurrence: d });
  }
  return out.sort((a, b) => a.occurrence.localeCompare(b.occurrence) || a.all_day - b.all_day || a.start - b.start);
}

/** Занятые делами интервалы в конкретный день (для свободного времени и проверки пересечений) */
export function busyIntervals(occ: EventOccurrence[], date: string): { start: number; end: number; title: string }[] {
  return occ
    .filter((e) => e.occurrence === date && e.busy && !e.done)
    .map((e) => (e.all_day ? { start: 0, end: 24 * 60, title: e.title } : { start: e.start, end: e.start + e.duration, title: e.title }));
}
