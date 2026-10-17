import * as Clipboard from 'expo-clipboard';
import { Linking, Platform } from 'react-native';
import type { Appointment, Settings } from '@/db/queries';
import { fmtDayLong, fmtTime, parseTime, weekday, addDays, nowMinutes, todayKey } from './date';
import { showAlert } from '@/utils/dialog';
import { phoneKey } from '@/utils/phone';

// цифры международного номера (старые записи без +90 тоже приводим)
export const digits = (phone: string) => (phone.trim() ? phoneKey(phone) : '');

export function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{([^}]+)\}/g, (m, k: string) => vars[k] ?? m);
}

export function money(n: number, currency: string) {
  return `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} ${currency}`;
}

export function reminderText(a: Appointment, s: Settings) {
  return fill(s.reminder_template, {
    имя: a.client_name?.split(' ')[0] ?? '',
    дата: fmtDayLong(a.date),
    время: fmtTime(a.start),
    услуга: a.services_label ?? 'маникюр',
    адрес: s.address,
    мастер: s.master_name,
    телефон: s.phone,
  });
}

async function open(url: string, fallback?: string) {
  try {
    await Linking.openURL(url);
  } catch {
    if (fallback) {
      try {
        await Linking.openURL(fallback);
        return;
      } catch {}
    }
    showAlert('Не получилось открыть', 'Проверьте, что приложение установлено.');
  }
}

export function call(phone: string) {
  if (!digits(phone)) return showAlert('Нет телефона', 'Добавьте номер в карточку клиента.');
  open(`tel:${phone.replace(/[^\d+]/g, '')}`);
}

export function openWhatsApp(phone: string, text = '') {
  const d = digits(phone);
  if (!d) return showAlert('Нет телефона', 'Добавьте номер в карточку клиента.');
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  // в браузере схема whatsapp:// не срабатывает и не выдаёт ошибку
  if (Platform.OS === 'web') return open(`https://wa.me/${d}${q}`);
  open(`whatsapp://send?phone=${d}${text ? `&text=${encodeURIComponent(text)}` : ''}`, `https://wa.me/${d}${q}`);
}

/**
 * Telegram не позволяет подставить текст в личный чат по ссылке,
 * поэтому копируем сообщение в буфер и открываем чат.
 */
export async function openTelegram(username: string, phone: string, text = '') {
  const u = username.trim().replace(/^@/, '');
  const d = digits(phone);
  if (!u && !d) return showAlert('Нет контакта', 'Добавьте Telegram или телефон в карточку клиента.');
  if (text) await Clipboard.setStringAsync(text);
  const url = u ? `https://t.me/${u}` : `https://t.me/+${d}`;
  // на вебе открываем сразу, пока действует нажатие пользователя, иначе Safari заблокирует окно
  if (Platform.OS === 'web') return open(url);
  if (text) {
    showAlert('Текст скопирован', 'Откроется чат в Telegram. Вставьте сообщение долгим нажатием на поле ввода.', [
      { text: 'Открыть Telegram', onPress: () => open(url) },
    ]);
  } else {
    open(url);
  }
}

// ---------- Свободные окошки ----------

export type DaySlots = { date: string; times: number[] };

export function workDays(s: Settings): number[] {
  return s.work_days.split(',').filter(Boolean).map(Number);
}

/**
 * Для каждого рабочего дня ищем свободные промежутки между записями
 * и нарезаем их окошками длиной slot_length.
 */
export function computeFreeSlots(s: Settings, appts: Appointment[], from: string, days: number): DaySlots[] {
  const startMin = parseTime(s.work_start) ?? 600;
  const endMin = parseTime(s.work_end) ?? 1140;
  const len = Math.max(15, Number(s.slot_length) || 120);
  const wd = workDays(s);
  const today = todayKey();
  const result: DaySlots[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    if (!wd.includes(weekday(date))) continue;
    const busy = appts
      .filter((a) => a.date === date && a.status !== 'cancelled')
      .map((a) => [a.start, a.start + a.duration] as const)
      .sort((x, y) => x[0] - y[0]);

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
      for (let t = f0; t + len <= f1; t += len) times.push(t);
    }
    if (times.length) result.push({ date, times });
  }
  return result;
}

export function slotsPost(s: Settings, slots: DaySlots[]) {
  const header = fill(s.slots_header, { телефон: s.phone, мастер: s.master_name });
  const body = slots
    .map((d) => `${fmtDayLong(d.date)}\n${d.times.map(fmtTime).join(', ')}`)
    .join('\n\n');
  return [header, body, s.slots_footer].filter(Boolean).join('\n\n');
}
