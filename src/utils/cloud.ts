// Облако онлайн-записи (Supabase) — без зависимостей от React Native, чтобы покрывать тестами.
// Таблицы и функции облака: supabase/schema.sql. Страница записи: zapis.html в репозитории сайта.
import type { Appointment, ApptService, Service, Settings } from '@/db/queries';
import { addDays, parseTime } from './date';
import { busyIntervals, type EventOccurrence } from './personal';
import { phoneKey } from './phone';

export const CLOUD_URL = 'https://znqzrtuvrqmjdmgllrnk.supabase.co';
// публичный ключ: даёт только то же, что и странице записи; заявки читаются по ключу мастера
export const CLOUD_PUBLIC_KEY = 'sb_publishable_l0ojpXkF7SJzTUnHxcnr6w_kwK1Epnv';
export const BOOKING_URL = 'https://lenchistudio.netlify.app/zapis';
/** На сколько дней вперёд выгружаем занятое время (страница открывает запись на 28 дней) */
export const BUSY_DAYS = 60;

export type RequestStatus = 'new' | 'accepted' | 'declined' | 'cancelled';

/** Заявка клиентки со страницы записи (как её отдаёт master_requests) */
export type CloudRequest = {
  id: number;
  created_at: string;
  day: string;
  start_min: number;
  duration: number;
  services: { id?: number; name?: string; price?: number; min?: number }[];
  price: number;
  name: string;
  phone: string;
  channel: 'wa' | 'tg';
  comment: string;
  first_time: boolean;
  status: RequestStatus;
  handled_at: string | null;
};

export type BusyItem = { day: string; start_min: number; end_min: number };

export class CloudError extends Error {
  /** код из облака (forbidden, slot_taken…) или 'network' */
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export type Fetch = typeof fetch;

/** Вызов функции облака. Ошибка сети → CloudError('network'), ошибка функции → её код. */
export async function rpc<T>(fn: string, args: Record<string, unknown>, fetchImpl: Fetch = fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(`${CLOUD_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: CLOUD_PUBLIC_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  } catch (e) {
    throw new CloudError('network', String(e));
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const msg = (data as { message?: string } | null)?.message ?? `http_${res.status}`;
    throw new CloudError(msg);
  }
  return data as T;
}

/**
 * Занятое время для страницы записи: активные записи и личные дела «занята» на BUSY_DAYS дней.
 * Имён и телефонов здесь нет — только промежутки.
 */
export function buildBusy(appts: Appointment[], events: EventOccurrence[], from: string, days = BUSY_DAYS): BusyItem[] {
  const out: BusyItem[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    for (const a of appts) {
      if (a.date === day && a.status !== 'cancelled') out.push({ day, start_min: a.start, end_min: a.start + a.duration });
    }
    for (const b of busyIntervals(events, day)) out.push({ day, start_min: b.start, end_min: b.end });
  }
  return out.sort((x, y) => x.day.localeCompare(y.day) || x.start_min - y.start_min);
}

/** Группа на странице записи — по названию услуги */
export function serviceGroup(name: string) {
  return /педикюр|гигиен/i.test(name) ? 'Педикюр и гигиена' : 'Маникюр';
}

/**
 * Услуги и график для страницы записи. Ключи совпадают с MASTER и SERVICES в zapis.html.
 * Адрес не выгружаем — он только в напоминании конкретной клиентке.
 */
export function buildConfig(s: Settings, services: Service[]) {
  const list = services
    .filter((x) => !x.archived)
    .sort((a, b) => Number(serviceGroup(a.name) !== 'Маникюр') - Number(serviceGroup(b.name) !== 'Маникюр') || a.sort - b.sort || a.id - b.id)
    .map((x) => ({ id: x.id, group: serviceGroup(x.name), name: x.name, desc: x.description, min: x.duration, price: Math.round(x.price) }));
  const wa = s.phone.trim() ? phoneKey(s.phone, s.default_country) : '';
  return {
    name: s.master_name,
    ...(wa ? { whatsapp: wa } : {}),
    workDays: s.work_days.split(',').filter(Boolean).map(Number),
    workStart: s.work_start,
    workEnd: s.work_end,
    services: list,
  };
}

/** Короткий отпечаток данных — чтобы не выгружать в облако то, что не изменилось */
export function fingerprint(value: unknown): string {
  const str = JSON.stringify(value);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return `${str.length}:${(h >>> 0).toString(36)}`;
}

/** Услуги заявки → услуги записи: если услуга ещё есть в приложении, связываем по id */
export function requestServices(r: CloudRequest, services: Service[]): ApptService[] {
  const items = r.services.length ? r.services : [{ name: 'Онлайн-запись', price: r.price, min: r.duration }];
  return items.map((x) => {
    const local = x.id != null ? services.find((s) => s.id === x.id) : undefined;
    return {
      service_id: local ? local.id : null,
      name: x.name || local?.name || 'Услуга',
      price: Number(x.price ?? local?.price ?? 0),
      duration: Number(x.min ?? local?.duration ?? 0),
    };
  });
}

/** Время заявки — свободно ли оно у мастера (записи + личные дела «занята») */
export function requestConflicts(r: CloudRequest, appts: Appointment[], events: EventOccurrence[]): string[] {
  const start = r.start_min;
  const end = r.start_min + r.duration;
  const hits: string[] = [];
  for (const a of appts) {
    if (a.date === r.day && a.status !== 'cancelled' && a.start < end && a.start + a.duration > start) {
      hits.push(a.client_name ?? 'запись');
    }
  }
  for (const b of busyIntervals(events, r.day)) if (b.start < end && b.end > start) hits.push(b.title);
  return hits;
}

/** Рабочее ли время заявки (страница могла показать устаревший график) */
export function outsideWorkHours(r: CloudRequest, s: Settings, weekdayOf: (day: string) => number): boolean {
  const ws = parseTime(s.work_start) ?? 0;
  const we = parseTime(s.work_end) ?? 24 * 60;
  const days = s.work_days.split(',').filter(Boolean).map(Number);
  return !days.includes(weekdayOf(r.day)) || r.start_min < ws || r.start_min + r.duration > we;
}
