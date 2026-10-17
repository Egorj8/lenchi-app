import type { SQLiteDatabase } from 'expo-sqlite';
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

export async function getSettings(db: SQLiteDatabase): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

export async function saveSettings(db: SQLiteDatabase, values: Partial<Settings>) {
  await db.withTransactionAsync(async () => {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) continue;
      await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', k, v);
    }
  });
}

// ---------- Услуги ----------

export function listServices(db: SQLiteDatabase, includeArchived = false) {
  return db.getAllAsync<Service>(
    `SELECT * FROM services ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY archived, sort, id`,
  );
}

export function getService(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Service>('SELECT * FROM services WHERE id = ?', id);
}

export async function saveService(db: SQLiteDatabase, s: Omit<Service, 'id' | 'sort' | 'archived'> & { id?: number; archived?: number }) {
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
    (SELECT COUNT(*) FROM appointments a WHERE a.client_id = c.id AND a.status = 'done') AS visits,
    (SELECT COALESCE(SUM(price), 0) FROM appointments a WHERE a.client_id = c.id AND a.status = 'done') AS spent,
    (SELECT MAX(date) FROM appointments a WHERE a.client_id = c.id AND a.status = 'done') AS last_visit,
    (SELECT MIN(date) FROM appointments a WHERE a.client_id = c.id AND a.status = 'planned' AND a.date >= ?) AS next_visit
  FROM clients c`;

export function listClients(db: SQLiteDatabase, today: string, query = '') {
  const q = `%${query.trim().toLowerCase()}%`;
  return db.getAllAsync<ClientRow>(
    `${CLIENT_STATS} WHERE lower(c.name) LIKE ? OR c.phone LIKE ? OR lower(c.telegram) LIKE ? ORDER BY c.name COLLATE NOCASE`,
    today, q, q, q,
  );
}

export function getClient(db: SQLiteDatabase, id: number, today: string) {
  return db.getFirstAsync<ClientRow>(`${CLIENT_STATS} WHERE c.id = ?`, today, id);
}

export async function saveClient(db: SQLiteDatabase, c: { id?: number; name: string; phone: string; telegram: string; notes: string }) {
  const tg = c.telegram.trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
  if (c.id) {
    await db.runAsync('UPDATE clients SET name = ?, phone = ?, telegram = ?, notes = ? WHERE id = ?', c.name.trim(), c.phone.trim(), tg, c.notes, c.id);
    return c.id;
  }
  const r = await db.runAsync(
    'INSERT INTO clients (name, phone, telegram, notes, created_at) VALUES (?, ?, ?, ?, ?)',
    c.name.trim(), c.phone.trim(), tg, c.notes, Date.now(),
  );
  return r.lastInsertRowId;
}

export async function deleteClient(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM clients WHERE id = ?', id);
}

// ---------- Записи ----------

const APPT_SELECT = `
  SELECT a.*, c.name AS client_name, c.phone AS client_phone, c.telegram AS client_telegram,
    (SELECT GROUP_CONCAT(name, ', ') FROM appointment_services s WHERE s.appointment_id = a.id) AS services_label
  FROM appointments a LEFT JOIN clients c ON c.id = a.client_id`;

export function listAppointmentsByDate(db: SQLiteDatabase, date: string) {
  return db.getAllAsync<Appointment>(`${APPT_SELECT} WHERE a.date = ? ORDER BY a.start`, date);
}

export function listAppointmentsBetween(db: SQLiteDatabase, from: string, to: string) {
  return db.getAllAsync<Appointment>(`${APPT_SELECT} WHERE a.date >= ? AND a.date <= ? ORDER BY a.date, a.start`, from, to);
}

export function listClientAppointments(db: SQLiteDatabase, clientId: number) {
  return db.getAllAsync<Appointment>(`${APPT_SELECT} WHERE a.client_id = ? ORDER BY a.date DESC, a.start DESC`, clientId);
}

export function getAppointment(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Appointment>(`${APPT_SELECT} WHERE a.id = ?`, id);
}

export function getAppointmentServices(db: SQLiteDatabase, id: number) {
  return db.getAllAsync<ApptService>('SELECT service_id, name, price, duration FROM appointment_services WHERE appointment_id = ?', id);
}

/** Дни, в которых есть активные записи (для точек в календаре) */
export async function busyDays(db: SQLiteDatabase, from: string, to: string) {
  const rows = await db.getAllAsync<{ date: string; n: number }>(
    "SELECT date, COUNT(*) AS n FROM appointments WHERE date >= ? AND date <= ? AND status != 'cancelled' GROUP BY date",
    from, to,
  );
  return Object.fromEntries(rows.map((r) => [r.date, r.n])) as Record<string, number>;
}

/** Записи, пересекающиеся с интервалом (кроме отменённых и самой редактируемой) */
export function findConflicts(db: SQLiteDatabase, date: string, start: number, duration: number, excludeId?: number) {
  return db.getAllAsync<Appointment>(
    `${APPT_SELECT} WHERE a.date = ? AND a.status != 'cancelled' AND a.id != ? AND a.start < ? AND a.start + a.duration > ? ORDER BY a.start`,
    date, excludeId ?? -1, start + duration, start,
  );
}

export async function saveAppointment(
  db: SQLiteDatabase,
  a: { id?: number; client_id: number | null; date: string; start: number; duration: number; price: number; notes: string; services: ApptService[] },
) {
  let id = a.id;
  await db.withExclusiveTransactionAsync(async (tx) => {
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

export async function setAppointmentStatus(db: SQLiteDatabase, id: number, status: Status) {
  await db.runAsync('UPDATE appointments SET status = ? WHERE id = ?', status, id);
}

export async function deleteAppointment(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM appointments WHERE id = ?', id);
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

export async function financeSummary(db: SQLiteDatabase, from: string, to: string): Promise<FinanceSummary> {
  const done = await db.getFirstAsync<{ s: number; n: number }>(
    "SELECT COALESCE(SUM(price),0) AS s, COUNT(*) AS n FROM appointments WHERE status='done' AND date BETWEEN ? AND ?", from, to);
  const planned = await db.getFirstAsync<{ s: number; n: number }>(
    "SELECT COALESCE(SUM(price),0) AS s, COUNT(*) AS n FROM appointments WHERE status='planned' AND date BETWEEN ? AND ?", from, to);
  const noShow = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM appointments WHERE status='no_show' AND date BETWEEN ? AND ?", from, to);
  const byDay = await db.getAllAsync<{ date: string; sum: number }>(
    "SELECT date, SUM(price) AS sum FROM appointments WHERE status='done' AND date BETWEEN ? AND ? GROUP BY date ORDER BY date", from, to);
  const topServices = await db.getAllAsync<{ name: string; n: number; sum: number }>(
    `SELECT s.name, COUNT(*) AS n, SUM(s.price) AS sum FROM appointment_services s
     JOIN appointments a ON a.id = s.appointment_id
     WHERE a.status='done' AND a.date BETWEEN ? AND ? GROUP BY s.name ORDER BY n DESC, sum DESC LIMIT 5`, from, to);
  const newClients = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (SELECT client_id, MIN(date) AS first FROM appointments
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

// ---------- Резервная копия ----------

export async function exportAll(db: SQLiteDatabase) {
  return {
    app: 'lenchi-studio',
    version: 1,
    exported_at: new Date().toISOString(),
    settings: await db.getAllAsync('SELECT * FROM settings'),
    services: await db.getAllAsync('SELECT * FROM services'),
    clients: await db.getAllAsync('SELECT * FROM clients'),
    appointments: await db.getAllAsync('SELECT * FROM appointments'),
    appointment_services: await db.getAllAsync('SELECT * FROM appointment_services'),
  };
}
