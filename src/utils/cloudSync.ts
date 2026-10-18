// Обмен с облаком онлайн-записи: выгрузка услуг, графика и занятого времени, загрузка заявок,
// «принять» / «отклонить». Без React Native — тестируется с поддельным fetch (tests/cloud.test.mts).
import {
  findClientByPhone, getSettings, listAppointmentsBetween, listEventsBetween, listServices,
  saveAppointment, saveClient, saveSettings,
} from '@/db/queries';
import type { Db } from '@/db/types';
import {
  BUSY_DAYS, buildBusy, buildConfig, CloudError, fingerprint, requestServices, rpc,
  type CloudRequest, type Fetch,
} from './cloud';
import { addDays } from './date';
import { expandEvents } from './personal';
import { normalizePhone } from './phone';

export type SyncResult = {
  /** заявки за последние 30 дней, новые сверху */
  requests: CloudRequest[];
  /** новые заявки, которых приложение ещё не видело (для уведомления) */
  fresh: CloudRequest[];
  at: number;
};

async function masterKey(db: Db) {
  const key = (await getSettings(db)).cloud_key.trim();
  if (!key) throw new CloudError('no_key', 'Не задан ключ облака');
  return key;
}

/** Проверить ключ мастера */
export function checkKey(key: string, fetchImpl?: Fetch) {
  return rpc<boolean>('master_check', { p_key: key.trim() }, fetchImpl);
}

/**
 * Полный обмен. null — облако не настроено (нет ключа).
 * Услуги и занятое время выгружаются, только если изменились с прошлого раза.
 */
export async function syncCloud(db: Db, today: string, fetchImpl?: Fetch): Promise<SyncResult | null> {
  const s = await getSettings(db);
  const key = s.cloud_key.trim();
  if (!key) return null;
  const save: Record<string, string> = {};

  const config = buildConfig(s, await listServices(db, true));
  const configHash = fingerprint(config);
  if (configHash !== s.cloud_config_hash) {
    await rpc('master_set_config', { p_key: key, p_data: config }, fetchImpl);
    save.cloud_config_hash = configHash;
  }

  const to = addDays(today, BUSY_DAYS - 1);
  const [appts, events] = await Promise.all([listAppointmentsBetween(db, today, to), listEventsBetween(db, today, to)]);
  const busy = buildBusy(appts, expandEvents(events, today, to), today);
  const busyHash = fingerprint({ today, busy });
  if (busyHash !== s.cloud_busy_hash) {
    await rpc('master_sync_busy', { p_key: key, p_from: today, p_to: to, p_items: busy }, fetchImpl);
    save.cloud_busy_hash = busyHash;
  }

  const requests = (await rpc<CloudRequest[]>('master_requests', { p_key: key, p_days: 30 }, fetchImpl)) ?? [];
  const seen = Number(s.cloud_seen_id) || 0;
  const fresh = requests.filter((r) => r.status === 'new' && r.id > seen);
  const at = Date.now();
  save.cloud_seen_id = String(Math.max(seen, ...requests.map((r) => r.id)));
  save.cloud_last_sync = String(at);
  await saveSettings(db, save);
  return { requests, fresh, at };
}

/** Забыть, что выгружали — при смене ключа или «Обновить сейчас» всё уйдёт заново */
export async function resetCloudMarks(db: Db) {
  await saveSettings(db, { cloud_config_hash: '', cloud_busy_hash: '' });
}

const marker = (id: number) => `Заявка с сайта №${id}`;

/**
 * Принять заявку: отметка в облаке, клиентка (найдём по телефону или создадим) и запись в календаре.
 * Сначала облако — без связи ничего не создаём, иначе заявка осталась бы «новой» и пришла бы снова.
 * Возвращает id записи.
 */
export async function acceptRequest(db: Db, r: CloudRequest, fetchImpl?: Fetch): Promise<number> {
  const key = await masterKey(db);
  await rpc('master_set_status', { p_key: key, p_id: r.id, p_status: 'accepted' }, fetchImpl);

  // уже приняли раньше (например, нажали дважды) — вторую запись не создаём
  const dup = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM live_appointments WHERE notes LIKE ? LIMIT 1',
    `%${marker(r.id)}%`,
  );
  if (dup) return dup.id;

  const s = await getSettings(db);
  const phone = normalizePhone(r.phone, s.default_country);
  const existing = phone ? await findClientByPhone(db, phone) : null;
  const clientId =
    existing?.id ??
    (await saveClient(db, { name: r.name, phone: r.phone, telegram: '', notes: r.first_time ? 'Первая запись — через сайт' : '' }));

  const services = requestServices(r, await listServices(db, true));
  return saveAppointment(db, {
    client_id: clientId,
    date: r.day,
    start: r.start_min,
    duration: r.duration,
    price: r.price,
    notes: [r.comment.trim(), marker(r.id)].filter(Boolean).join('\n'),
    services,
  });
}

export async function declineRequest(db: Db, r: CloudRequest, fetchImpl?: Fetch) {
  const key = await masterKey(db);
  await rpc('master_set_status', { p_key: key, p_id: r.id, p_status: 'declined' }, fetchImpl);
}

/** Понятное объяснение ошибки облака */
export function cloudErrorText(e: unknown): string {
  const code = e instanceof CloudError ? e.code : '';
  if (code === 'network') return 'Нет связи с облаком. Проверьте интернет и попробуйте ещё раз.';
  if (code === 'forbidden') return 'Облако не принимает ключ. Проверьте ключ в «Ещё» → «Онлайн-запись».';
  if (code === 'no_key') return 'Сначала введите ключ облака в «Ещё» → «Онлайн-запись».';
  return `Облако ответило ошибкой: ${e instanceof Error ? e.message : String(e)}`;
}
