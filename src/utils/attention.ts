// Этап 3 — чистая логика без React Native (покрыта тестами):
// дни рождения, лист ожидания, тексты сообщений, содержимое утренней сводки.
import { addDays, fmtDayLong, fmtTime, fromKey, plural, weekday } from './date';
import type { DaySlots } from './freeSlots';

// ---------- Дни рождения ----------

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const pad = (n: number) => String(n).padStart(2, '0');

/** «12.03» или «12.03.1990» → 'MM-DD' / 'YYYY-MM-DD'. Пустая строка → null. Неверный ввод → undefined. */
export function parseBirthday(input: string): string | null | undefined {
  const t = input.trim();
  if (!t) return null;
  const m = /^(\d{1,2})[.\-/ ](\d{1,2})(?:[.\-/ ](\d{2}|\d{4}))?$/.exec(t);
  if (!m) return undefined;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = m[3] ? Number(m[3]) : null;
  if (y !== null && y < 100) y += y > 30 ? 1900 : 2000;
  const daysIn = new Date(y ?? 2000, mo, 0).getDate(); // 2000 — високосный, чтобы 29.02 без года проходило
  if (mo < 1 || mo > 12 || d < 1 || d > daysIn) return undefined;
  if (y !== null && (y < 1920 || y > new Date().getFullYear())) return undefined;
  return y ? `${y}-${pad(mo)}-${pad(d)}` : `${pad(mo)}-${pad(d)}`;
}

/** 'YYYY-MM-DD' / 'MM-DD' → «12.03.1990» / «12.03» для поля ввода */
export function birthdayInput(stored: string | null): string {
  if (!stored) return '';
  const p = stored.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : `${p[1]}.${p[0]}`;
}

/** «12 марта» */
export function fmtBirthday(stored: string): string {
  const p = stored.split('-').map(Number);
  const [mo, d] = p.length === 3 ? [p[1], p[2]] : [p[0], p[1]];
  return `${d} ${MONTHS_GEN[mo - 1]}`;
}

export type NextBirthday = { date: string; daysLeft: number; age: number | null };

/** Ближайший день рождения начиная с today (сегодня → daysLeft 0). 29.02 в невисокосный год — 28.02. */
export function nextBirthday(stored: string, today: string): NextBirthday {
  const p = stored.split('-').map(Number);
  const [year, mo, d] = p.length === 3 ? p : [null, p[0], p[1]];
  const t = fromKey(today);
  const at = (y: number) => {
    const last = new Date(y, mo, 0).getDate();
    return `${y}-${pad(mo)}-${pad(Math.min(d, last))}`;
  };
  let y = t.getFullYear();
  let date = at(y);
  if (date < today) date = at(++y);
  const daysLeft = Math.round((fromKey(date).getTime() - t.getTime()) / 86_400_000);
  return { date, daysLeft, age: year ? y - year : null };
}

// ---------- Лист ожидания ----------

export type DayPart = 'any' | 'morning' | 'day' | 'evening';

export const DAY_PARTS: { key: DayPart; label: string; from: number; to: number }[] = [
  { key: 'any', label: 'Любое время', from: 0, to: 24 * 60 },
  { key: 'morning', label: 'Утро · до 12', from: 0, to: 12 * 60 },
  { key: 'day', label: 'День · 12–16', from: 12 * 60, to: 16 * 60 },
  { key: 'evening', label: 'Вечер · после 16', from: 16 * 60, to: 24 * 60 },
];

const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export type WaitWish = { days: string; part: string; until: string | null };

/** Подходит ли время (дата + начало в минутах) пожеланиям из листа ожидания */
export function matchesWish(w: WaitWish, date: string, start: number): boolean {
  if (w.until && date > w.until) return false;
  const days = w.days.split(',').filter(Boolean).map(Number);
  if (days.length && !days.includes(weekday(date))) return false;
  const part = DAY_PARTS.find((p) => p.key === w.part) ?? DAY_PARTS[0];
  return start >= part.from && start < part.to;
}

/** «вт, чт · после 16» */
export function wishLabel(w: WaitWish): string {
  const days = w.days.split(',').filter(Boolean).map(Number);
  const dayText = days.length ? [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WD_SHORT[d]).join(', ') : 'любой день';
  const part = DAY_PARTS.find((p) => p.key === w.part) ?? DAY_PARTS[0];
  return `${dayText} · ${part.key === 'any' ? 'любое время' : part.label.split(' · ')[1]}`;
}

/** Ближайшее свободное окошко, подходящее под пожелания */
export function firstMatchingSlot(w: WaitWish, slots: DaySlots[]): { date: string; start: number } | null {
  for (const d of slots) for (const t of d.times) if (matchesWish(w, d.date, t)) return { date: d.date, start: t };
  return null;
}

// ---------- Тексты ----------

export function fillTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{([^}]+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** «чт 22.10 в 13:00, пт 23.10 в 11:00» — первые n свободных окошек */
export function slotsShort(slots: DaySlots[], n = 3): string {
  const out: string[] = [];
  for (const d of slots) {
    for (const t of d.times) {
      const dt = fromKey(d.date);
      out.push(`${WD_SHORT[dt.getDay()]} ${pad(dt.getDate())}.${pad(dt.getMonth() + 1)} в ${fmtTime(t)}`);
      if (out.length >= n) return out.join(', ');
    }
  }
  return out.join(', ') || 'напишите, когда удобно';
}

// ---------- Утренняя сводка ----------

export type SummaryAppt = { start: number; client_name: string | null; status: string; reminded_at: number | null };

/** Содержимое утреннего уведомления на день; null — если сказать нечего */
export function morningSummary(
  date: string,
  today: string,
  appts: SummaryAppt[],
  birthdays: string[],
  rebookCount: number,
): { title: string; body: string } | null {
  const active = appts.filter((a) => a.status === 'planned').sort((a, b) => a.start - b.start);
  const notReminded = active.filter((a) => !a.reminded_at).length;
  const lines: string[] = [];
  if (active.length) {
    lines.push(active.slice(0, 4).map((a) => `${fmtTime(a.start)} ${(a.client_name ?? 'клиентка').split(' ')[0]}`).join(' · ') + (active.length > 4 ? ' …' : ''));
    if (notReminded) lines.push(`Напоминание не отправлено: ${notReminded} ${plural(notReminded, 'клиентке', 'клиенткам', 'клиенткам')}`);
  }
  if (birthdays.length) lines.push(`🎂 День рождения: ${birthdays.join(', ')}`);
  if (date === today && rebookCount) lines.push(`💅 Пора на коррекцию: ${rebookCount} ${plural(rebookCount, 'клиентка', 'клиентки', 'клиенток')}`);
  if (!lines.length) return null;
  const title = active.length
    ? `Сегодня ${active.length} ${plural(active.length, 'запись', 'записи', 'записей')}`
    : 'Доброе утро!';
  return { title, body: lines.join('\n') };
}

export { addDays, fmtDayLong };
