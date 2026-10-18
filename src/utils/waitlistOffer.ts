// Освободилось время (отмена/удаление записи) → предложить его клиентке из листа ожидания.
import { getSettings, listWaitlist } from '@/db/queries';
import type { Db } from '@/db/types';
import { fillTemplate, matchesWish, wishLabel } from './attention';
import { fmtDayLong, fmtTime, todayKey } from './date';
import { showAlert } from './dialog';
import { openTelegram, openWhatsApp } from './messages';

export async function offerFreedSlot(db: Db, date: string, start: number) {
  if (date < todayKey()) return; // прошедшее время никому не предложишь
  const [list, s] = await Promise.all([listWaitlist(db, todayKey()), getSettings(db)]);
  const fits = list.filter((w) => matchesWish(w, date, start));
  if (!fits.length) return;
  const w = fits[0];
  const text = fillTemplate(s.waitlist_template, {
    имя: w.client_name.split(' ')[0], дата: fmtDayLong(date), время: fmtTime(start), мастер: s.master_name,
  });
  const others = fits.length > 1 ? `\nЕщё подходят: ${fits.slice(1, 3).map((x) => x.client_name.split(' ')[0]).join(', ')}.` : '';
  showAlert(
    'Освободилось время',
    `${fmtDayLong(date)}, ${fmtTime(start)}.\nВ листе ожидания: ${w.client_name} (${wishLabel(w)}).${others}\n\nНаписать ей?`,
    [
      { text: 'Позже', style: 'cancel' },
      { text: 'Telegram', onPress: () => openTelegram(w.client_telegram, w.client_phone, text) },
      { text: 'WhatsApp', onPress: () => openWhatsApp(w.client_phone, text) },
    ],
  );
}
