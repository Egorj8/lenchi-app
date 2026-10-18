import * as Clipboard from 'expo-clipboard';
import { Linking, Platform } from 'react-native';
import type { Appointment, Settings } from '@/db/queries';
import { fmtDayLong, fmtTime } from './date';
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

export { computeFreeSlots, workDays, type DaySlots } from './freeSlots';
import type { DaySlots } from './freeSlots';

export function slotsPost(s: Settings, slots: DaySlots[]) {
  const header = fill(s.slots_header, { телефон: s.phone, мастер: s.master_name });
  const body = slots
    .map((d) => `${fmtDayLong(d.date)}\n${d.times.map(fmtTime).join(', ')}`)
    .join('\n\n');
  return [header, body, s.slots_footer].filter(Boolean).join('\n\n');
}
