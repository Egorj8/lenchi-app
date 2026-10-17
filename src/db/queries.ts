import { normalizePhone } from '@/utils/phone';
import type { Db } from './types';
import { DEFAULT_SETTINGS } from './schema';

export type Status = 'planned' | 'done' | 'no_show' | 'cancelled';

export type Service = {
  id: number;
  name: string;
  description: string;
  duration: number;
  price: number;
  archived: number;
  sort: number;
};

export type Client = {
  id: number;
  name: string;
  phone: string;
  telegram: string;
  notes: string;
  created_at: number;
};

export type ClientRow = Client & {
  visits: number;
  spent: number;
  last_visit: string | null;
  next_visit: string | null;
};

export type ApptService = { service_id: number | null; name: string; price: number; duration: number };

export type Appointment = {
  id: number;
  client_id: number | null;
  date: string;
  start: number;
  duration: number;
  price: number;
  status: Status;
  notes: string;
  created_at: number;
  client_name: string | null;
  client_phone: string | null;
  client_telegram: string | null;
  services_label: string | null;
};

export type Settings = typeof DEFAULT_SETTINGS;

// ---------- Настройки ----------

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

export async function saveSettings(db: Db, values: Partial<Settings>) {
  await db.withTransactionAsync(async () => {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) continue;
      await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', k, v);
    }
  });
}

// ---------- Услуги ----------

export function listServices(db: Db, includeArchived = false) {
  return db.getAllAsync<Service>(
    `SELECT * FROM services ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY archived, sort, id`,
  );
}

export function getService(db: Db, id: number) {
  return db.getFirstAsync<Service>('SELECT * FROM services WHERE id = ?', id);
}

export async function saveService(db: Db, s: Omit<Service, 'id' | 'sort' | 'archived'> & { id?: number; archived?: number }) {
  if (s.id) {
    await db.runAsync(
      'UPDATE services SET name = ?, description = ?, duration = ?, price = ?, archived = ? WHERE id = ?',
      s.name, s.description, s.duration, s.price, s.archived ?? 0, s.id,
    );
    return s.id;
  }
  const max = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort) AS m FROM services');
  const r = await db.runAsync(
    'INSERT INTO services (name, description, duration, price, sort) VALUES (?, ?, ?, ?, ?)',
    s.name, s.description, s.duration, s.price, (max?.m ?? 0) + 1,
  );
  return r.lastInsertRowId;
}

// ---------- Клиенты ----------

const CLIENT_STATS = `
  SELECT c.*,
    (SELECT COUNT(*) FROM live_appointments a WHERE a.client_id = c.id AND a.status = 'done') AS visits,
    (SELECT COALESCE(SUM(price), 0) FROM live_appointments a WHERE a.client_id = c.id AND a.status = 'done') AS spent,
    (SELECT MAX(date) FROM live_appointments a WHERE a.client_id = c.id AND a.status = 'done') AS last_visit,
    (SELECT MIN(date) FROM live_appointments a WHERE a.client_id = c.id AND a.status = 'planned' AND a.date >= ?) AS next_visit
  FROM live_clients c`;

export function listClients(db: Db, today: string, query = '') {
  const q = `%${query.trim().toLowerCase()}%`;
  return db.getAllAsync<ClientRow>(
    `${CLIENT_STATS} WHERE lower(c.name) LIKE ? OR c.phone LIKE ? OR lower(c.telegram) LIKE ? ORDER BY c.name COLLATE NOCASE`,
    today, q, q, q,
  );
}

export function getClient(db: Db, id: number, today: string) {
  return db.getFirstAsync<ClientRow>(`${CLIENT_STATS} WHERE c.id = ?`, today, id);
}

export async function saveClient(db: Db, c: { id?: number; name: string; phone: string; telegram: string; notes: string }) {
  const country = (await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'default_country'"))?.value ?? '90';
  const phone = normalizePhone(c.phone, country);
  const tg = c.telegram.trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
  if (c.id) {
    await db.runAsync('UPDATE clients SET name = ?, phone = ?, telegram = ?, notes = ? WHERE id = ?', c.name.trim(), phone, tg, c.notes, c.id);
    return c.id;
  }
  const r = await db.runAsync(
    'INSERT INTO clients (name, phone, telegram, notes, created_at) VALUES (?, ?, ?, ?, ?)',
    c.name.trim(), phone, tg, c.notes, Date.now(),
  );
  return r.lastInsertRowId;
}

/** Клиентка с таким же номером (номера в базе хранятся в формате +...) */
export function findClientByPhone(db: Db, phone: string) {
  return db.getFirstAsync<Client>("SELECT * FROM live_clients WHERE phone = ? AND phone != '' LIMIT 1", phone);
}

/** Множество номеров, которые уже есть в базе */
export async function existingPhones(db: Db): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ phone: string }>("SELECT phone FROM live_clients WHERE phone != ''");
  return new Set(rows.map((r) => r.phone));
}

/** Пакетный импорт из контактов телефона. Номера уже нормализованы. */
export async function importClients(db: Db, items: { name: string; phone: string }[]) {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      await db.runAsync(
        "INSERT INTO clients (name, phone, telegram, notes, created_at) VALUES (?, ?, '', '', ?)",
        it.name.trim(), it.phone, now,
      );
    }
  });
  return items.length;
}

/** В корзину (можно вернуть) */
export async function deleteClient(db: Db, id: number) {
  await db.runAsync('UPDATE clients SET deleted_at = ? WHERE id = ?', Date.now(), id);
}

export async function restoreClient(db: Db, id: number) {
  await db.runAsync('UPDATE clients SET deleted_at = NULL WHERE id = ?', id);
}

// ---------- Записи ----------

const APPT_SELECT = `
  SELECT a.*, c.name AS client_name, c.phone AS client_phone, c.telegram AS client_telegram,
    (SELECT GROUP_CONCAT(name, ', ') FROM appointment_services s WHERE s.appointment_id = a.id) AS services_label
  FROM live_appointments a LEFT JOIN clients c ON c.id = a.client_id`;

export function listAppointmentsByDate(db: Db, date: string) {
  return db.getAllAsync<Appointment>(`${APPT_SELECT} WHERE a.date = ? ORDER BY a.start`, date);
}

export function listAppointmentsBetween(db: Db, from: string, to: string) {
  return db.getAllAsync<Appointment>(`${APPT_SELECT} WHERE a.date >= ? AND a.date <= ? ORDER BY a.date, a.start`, from, to);
}

export function listClientAppointments(db: Db, clientId: number) {
  return db.getAllAsync<Appointment>(`${APPT_SELECT} WHERE a.client_id = ? ORDER BY a.date DESC, a.start DESC`, clientId);
}

export function getAppointment(db: Db, id: number) {
  return db.getFirstAsync<Appointment>(`${APPT_SELECT} WHERE a.id = ?`, id);
}

export function getAppointmentServices(db: Db, id: number) {
  return db.getAllAsync<ApptService>('SELECT service_id, name, price, duration FROM appointment_services WHERE appointment_id = ?', id);
}

/** Дни, в которых есть активные записи (для точек в календаре) */
export async function busyDays(db: Db, from: string, to: string) {
  const rows = await db.getAllAsync<{ date: string; n: number }>(
    "SELECT date, COUNT(*) AS n FROM live_appointments WHERE date >= ? AND date <= ? AND status != 'cancelled' GROUP BY date",
    from, to,
  );
  return Object.fromEntries(rows.map((r) => [r.date, r.n])) as Record<string, number>;
}

/** Число записей и сумма по дням (для вида «Месяц») */
export async function dayStats(db: Db, from: string, to: string) {
  const rows = await db.getAllAsync<{ date: string; n: number; sum: number }>(
    "SELECT date, COUNT(*) AS n, COALESCE(SUM(price), 0) AS sum FROM live_appointments WHERE date >= ? AND date <= ? AND status != 'cancelled' GROUP BY date",
    from, to,
  );
  return Object.fromEntries(rows.map((r) => [r.date, { n: r.n, sum: r.sum }])) as Record<string, { n: number; sum: number }>;
}

/** Записи, пересекающиеся с интервалом (кроме отменённых и самой редактируемой) */
export function findConflicts(db: Db, date: string, start: number, duration: number, excludeId?: number) {
  return db.getAllAsync<Appointment>(
    `${APPT_SELECT} WHERE a.date = ? AND a.status != 'cancelled' AND a.id != ? AND a.start < ? AND a.start + a.duration > ? ORDER BY a.start`,
    date, excludeId ?? -1, start + duration, start,
  );
}

export async function saveAppointment(
  db: Db,
  a: { id?: number; client_id: number | null; date: string; start: number; duration: number; price: number; notes: string; services: ApptService[] },
) {
  let id = a.id;
  // withExclusiveTransactionAsync не поддерживается на вебе
  await db.withTransactionAsync(async () => {
    const tx = db;
    if (id) {
      await tx.runAsync(
        'UPDATE appointments SET client_id = ?, date = ?, start = ?, duration = ?, price = ?, notes = ? WHERE id = ?',
        a.client_id, a.date, a.start, a.duration, a.price, a.notes, id,
      );
      await tx.runAsync('DELETE FROM appointment_services WHERE appointment_id = ?', id);
    } else {
      const r = await tx.runAsync(
        'INSERT INTO appointments (client_id, date, start, duration, price, notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        a.client_id, a.date, a.start, a.duration, a.price, a.notes, 'planned', Date.now(),
      );
      id = r.lastInsertRowId;
    }
    for (const s of a.services) {
      await tx.runAsync(
        'INSERT INTO appointment_services (appointment_id, service_id, name, price, duration) VALUES (?, ?, ?, ?, ?)',
        id!, s.service_id, s.name, s.price, s.duration,
      );
    }
  });
  return id!;
}

export async function setAppointmentStatus(db: Db, id: number, status: Status) {
  await db.runAsync('UPDATE appointments SET status = ? WHERE id = ?', status, id);
}

/** В корзину (можно вернуть) */
export async function deleteAppointment(db: Db, id: number) {
  await db.runAsync('UPDATE appointments SET deleted_at = ? WHERE id = ?', Date.now(), id);
}

export async function restoreAppointment(db: Db, id: number) {
  await db.runAsync('UPDATE appointments SET deleted_at = NULL WHERE id = ?', id);
}

// ---------- Корзина ----------

export const TRASH_DAYS = 30;

export type TrashAppointment = {
  id: number; date: string; start: number; price: number; deleted_at: number;
  client_name: string | null; services_label: string | null;
};
export type TrashClient = { id: number; name: string; phone: string; deleted_at: number };

export function listTrashAppointments(db: Db) {
  return db.getAllAsync<TrashAppointment>(
    `SELECT a.id, a.date, a.start, a.price, a.deleted_at, c.name AS client_name,
       (SELECT GROUP_CONCAT(name, ', ') FROM appointment_services s WHERE s.appointment_id = a.id) AS services_label
     FROM appointments a LEFT JOIN clients c ON c.id = a.client_id
     WHERE a.deleted_at IS NOT NULL ORDER BY a.deleted_at DESC`,
  );
}

export function listTrashClients(db: Db) {
  return db.getAllAsync<TrashClient>('SELECT id, name, phone, deleted_at FROM clients WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
}

export async function trashCount(db: Db) {
  const r = await db.getFirstAsync<{ n: number }>(
    'SELECT (SELECT COUNT(*) FROM appointments WHERE deleted_at IS NOT NULL) + (SELECT COUNT(*) FROM clients WHERE deleted_at IS NOT NULL) AS n',
  );
  return r?.n ?? 0;
}

/** Удалить навсегда. У записей удалённой клиентки поле клиента станет пустым (ON DELETE SET NULL). */
export async function purgeAppointment(db: Db, id: number) {
  await db.runAsync('DELETE FROM appointments WHERE id = ?', id);
}
export async function purgeClient(db: Db, id: number) {
  await db.runAsync('DELETE FROM clients WHERE id = ?', id);
}

/** Очистить корзину целиком или только то, что лежит дольше olderThanDays */
export async function emptyTrash(db: Db, olderThanDays = 0) {
  const before = Date.now() - olderThanDays * 86_400_000;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM appointments WHERE deleted_at IS NOT NULL AND deleted_at <= ?', before);
    await db.runAsync('DELETE FROM clients WHERE deleted_at IS NOT NULL AND deleted_at <= ?', before);
  });
}

// ---------- Финансы ----------

export type FinanceSummary = {
  revenue: number;
  visits: number;
  expected: number;
  expectedVisits: number;
  noShows: number;
  byDay: { date: string; sum: number }[];
  topServices: { name: string; n: number; sum: number }[];
  newClients: number;
};

export async function financeSummary(db: Db, from: string, to: string): Promise<FinanceSummary> {
  const done = await db.getFirstAsync<{ s: number; n: number }>(
    "SELECT COALESCE(SUM(price),0) AS s, COUNT(*) AS n FROM live_appointments WHERE status='done' AND date BETWEEN ? AND ?", from, to);
  const planned = await db.getFirstAsync<{ s: number; n: number }>(
    "SELECT COALESCE(SUM(price),0) AS s, COUNT(*) AS n FROM live_appointments WHERE status='planned' AND date BETWEEN ? AND ?", from, to);
  const noShow = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM live_appointments WHERE status='no_show' AND date BETWEEN ? AND ?", from, to);
  const byDay = await db.getAllAsync<{ date: string; sum: number }>(
    "SELECT date, SUM(price) AS sum FROM live_appointments WHERE status='done' AND date BETWEEN ? AND ? GROUP BY date ORDER BY date", from, to);
  const topServices = await db.getAllAsync<{ name: string; n: number; sum: number }>(
    `SELECT s.name, COUNT(*) AS n, SUM(s.price) AS sum FROM appointment_services s
     JOIN live_appointments a ON a.id = s.appointment_id
     WHERE a.status='done' AND a.date BETWEEN ? AND ? GROUP BY s.name ORDER BY n DESC, sum DESC LIMIT 5`, from, to);
  const newClients = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (SELECT client_id, MIN(date) AS first FROM live_appointments
     WHERE status='done' AND client_id IS NOT NULL GROUP BY client_id) WHERE first BETWEEN ? AND ?`, from, to);
  return {
    revenue: done?.s ?? 0,
    visits: done?.n ?? 0,
    expected: planned?.s ?? 0,
    expectedVisits: planned?.n ?? 0,
    noShows: noShow?.n ?? 0,
    byDay,
    topServices,
    newClients: newClients?.n ?? 0,
  };
}
