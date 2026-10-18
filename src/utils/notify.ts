// Утренняя сводка: локальные уведомления на 7 дней вперёд.
// Текст зависит от записей, поэтому расписание пересобирается при каждом запуске,
// сворачивании приложения и изменении данных (повторяющееся уведомление было бы с устаревшим текстом).
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { clientsWithBirthday, getSettings, listAppointmentsBetween, rebookCandidates } from '@/db/queries';
import type { Db } from '@/db/types';
import { morningSummary, nextBirthday } from './attention';
import type { CloudRequest } from './cloud';
import { addDays, fmtDayShort, fmtTime, parseTime, todayKey, weekdayShort } from './date';

const CHANNEL = 'morning';
const PREFIX = 'morning-';
const DAYS_AHEAD = 7;

let configured = false;

function configure() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Утренняя сводка',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#ffc61a',
  });
}

/** Спросить разрешение (Android 13+ показывает системный запрос). true — можно показывать уведомления. */
export async function requestNotifyPermission(): Promise<boolean> {
  configure();
  await ensureChannel();
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

export async function notifyPermissionGranted() {
  return (await Notifications.getPermissionsAsync()).granted;
}

let running: Promise<void> | null = null;

/** Пересобрать утренние уведомления (вызовы не накладываются друг на друга) */
export function rescheduleMorning(db: Db): Promise<void> {
  if (running) return running.then(() => rescheduleMorning(db));
  running = doReschedule(db).finally(() => {
    running = null;
  });
  return running;
}

async function doReschedule(db: Db) {
  configure();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  const s = await getSettings(db);
  if (s.notify_morning !== '1' || !(await notifyPermissionGranted())) return;
  await ensureChannel();

  const today = todayKey();
  const last = addDays(today, DAYS_AHEAD - 1);
  const minute = parseTime(s.morning_time) ?? 9 * 60;
  const [appts, withBirthday, rebook] = await Promise.all([
    listAppointmentsBetween(db, today, last),
    clientsWithBirthday(db),
    rebookCandidates(db, today, Number(s.rebook_days) || 21),
  ]);

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = addDays(today, i);
    const at = new Date(`${date}T00:00:00`);
    at.setMinutes(minute);
    if (at.getTime() <= Date.now() + 60_000) continue; // сегодняшнее время уже прошло
    const birthdays = withBirthday.filter((c) => nextBirthday(c.birthday!, date).daysLeft === 0).map((c) => c.name.split(' ')[0]);
    const content = morningSummary(
      date,
      today,
      appts.filter((a) => a.date === date),
      birthdays,
      rebook.length,
    );
    if (!content) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `${PREFIX}${date}`,
      content: { ...content, data: { url: '/' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
  }
}

/** Новые заявки со страницы записи — сразу, отдельным каналом с высокой важностью */
export async function notifyNewRequests(fresh: CloudRequest[]) {
  configure();
  if (!fresh.length || !(await notifyPermissionGranted())) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('requests', {
      name: 'Заявки с сайта',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#ffc61a',
    });
  }
  const r = fresh[0];
  const when = `${weekdayShort(r.day).toLowerCase()} ${fmtDayShort(r.day)} в ${fmtTime(r.start_min)}`;
  const services = r.services.map((x) => x.name).filter(Boolean).join(', ');
  await Notifications.scheduleNotificationAsync({
    identifier: `request-${r.id}`,
    content: {
      title: fresh.length === 1 ? 'Новая заявка с сайта' : `Новых заявок с сайта: ${fresh.length}`,
      body: fresh.length === 1 ? `${r.name} · ${when}${services ? ` · ${services}` : ''}` : fresh.map((x) => x.name).join(', '),
      data: { url: '/requests' },
    },
    trigger: Platform.OS === 'android' ? { channelId: 'requests' } : null,
  });
}

/** Нажатие на уведомление открывает нужный экран (data.url) */
export function useNotificationRouting() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string' && url !== '/') router.push(url as Href);
  }, [response]);
}

export const notificationsSupported = true;
