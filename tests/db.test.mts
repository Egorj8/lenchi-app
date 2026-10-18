// Тесты базы на настоящем SQLite (sql.js): миграции, корзина, резервные копии.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import type { Db, Param } from '../src/db/types.ts';
import { migrateDbIfNeeded } from '../src/db/schema.ts';
import {
  deleteAppointment, deleteClient, emptyTrash, financeSummary, listAppointmentsByDate, listClients,
  listTrashAppointments, restoreAppointment, saveAppointment, saveClient, trashCount,
} from '../src/db/queries.ts';
import { exportAll, parseBackup, restoreAll, summarize } from '../src/db/backup.ts';

const SQL = await initSqlJs();

function makeDb(): Db {
  const db = new SQL.Database();
  const all = <T,>(sql: string, params: Param[]) => {
    const st = db.prepare(sql);
    try {
      if (params.length) st.bind(params);
      const rows: T[] = [];
      while (st.step()) rows.push(st.getAsObject() as T);
      return rows;
    } finally {
      st.free();
    }
  };
  return {
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, ...p) {
      all(sql, p);
      const changes = db.getRowsModified();
      return { changes, lastInsertRowId: all<{ id: number }>('SELECT last_insert_rowid() AS id', [])[0].id };
    },
    async getAllAsync(sql, ...p) { return all(sql, p); },
    async getFirstAsync(sql, ...p) { return all(sql, p)[0] ?? null; },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

async function fresh() {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  return db;
}

async function addVisit(db: Db, name: string, phone: string, date: string) {
  const client_id = await saveClient(db, { name, phone, telegram: '', notes: '' });
  const id = await saveAppointment(db, {
    client_id, date, start: 660, duration: 120, price: 1300, notes: '',
    services: [{ service_id: 2, name: 'Комплекс 2', price: 1300, duration: 120 }],
  });
  return { client_id, id };
}

test('новая база: схема v5, услуги из прайса', async () => {
  const db = await fresh();
  assert.equal((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version, 5);
  assert.equal((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM services'))!.n, 8);
});

test('обновление с версии 1: телефоны +90, появляются корзина и представления', async () => {
  const db = await fresh();
  await db.execAsync(`
    DROP VIEW live_clients; DROP VIEW live_appointments;
    ALTER TABLE clients DROP COLUMN deleted_at; ALTER TABLE appointments DROP COLUMN deleted_at;
    PRAGMA user_version = 1;
  `);
  await db.runAsync("INSERT INTO clients (name, phone, created_at) VALUES ('Старая', '0532 111 22 33', 0)");
  await migrateDbIfNeeded(db);
  const c = (await listClients(db, '2026-01-01'))[0];
  assert.equal(c.phone, '+905321112233', 'телефон нормализован миграцией v2');
  assert.equal((c as { deleted_at?: number | null }).deleted_at ?? null, null);
});

test('удаление в корзину и возврат', async () => {
  const db = await fresh();
  const { id } = await addVisit(db, 'Анна', '+905551112233', '2026-10-20');
  await deleteAppointment(db, id);
  assert.equal((await listAppointmentsByDate(db, '2026-10-20')).length, 0, 'не видна в календаре');
  assert.equal(await trashCount(db), 1);
  assert.equal((await listTrashAppointments(db))[0].client_name, 'Анна');
  await restoreAppointment(db, id);
  assert.equal((await listAppointmentsByDate(db, '2026-10-20')).length, 1);
  assert.equal(await trashCount(db), 0);
});

test('удалённое не попадает в статистику', async () => {
  const db = await fresh();
  await addVisit(db, 'Анна', '+905551112233', '2026-10-20');
  const b = await addVisit(db, 'Мария', '+905551112244', '2026-10-21');
  await db.runAsync("UPDATE appointments SET status = 'done'");
  await deleteAppointment(db, b.id);
  const f = await financeSummary(db, '2026-10-01', '2026-10-31');
  assert.equal(f.visits, 1);
  assert.equal(f.revenue, 1300);
});

test('удалённая клиентка скрыта, её записи остаются с именем', async () => {
  const db = await fresh();
  const { client_id } = await addVisit(db, 'Ольга', '+905551119999', '2026-10-22');
  await deleteClient(db, client_id);
  assert.equal((await listClients(db, '2026-01-01')).length, 0);
  assert.equal((await listAppointmentsByDate(db, '2026-10-22'))[0].client_name, 'Ольга');
});

test('очистка корзины: удаляется только то, что старше срока', async () => {
  const db = await fresh();
  const { id } = await addVisit(db, 'Анна', '+905551112233', '2026-10-20');
  await deleteAppointment(db, id);
  await emptyTrash(db, 30);
  assert.equal(await trashCount(db), 1, 'свежее не трогаем');
  await db.runAsync('UPDATE appointments SET deleted_at = ?', Date.now() - 31 * 86_400_000);
  await emptyTrash(db, 30);
  assert.equal(await trashCount(db), 0);
});

test('копия → восстановление возвращает всё, включая корзину', async () => {
  const db = await fresh();
  await addVisit(db, 'Анна', '+905551112233', '2026-10-20');
  const b = await addVisit(db, 'Мария', '+905551112244', '2026-10-21');
  await deleteAppointment(db, b.id);
  const text = JSON.stringify(await exportAll(db));

  const other = await fresh();
  const data = parseBackup(text);
  const sum = summarize(data);
  assert.deepEqual([sum.clients, sum.appointments, sum.services], [2, 1, 8]);
  assert.ok(sum.exportedAt instanceof Date);
  await restoreAll(other, data);
  assert.equal((await listClients(other, '2026-01-01')).length, 2);
  assert.equal((await listAppointmentsByDate(other, '2026-10-20'))[0].services_label, 'Комплекс 2');
  assert.equal(await trashCount(other), 1, 'корзина тоже восстановлена');
});

test('старая текстовая копия (формат v1: без корзины и без +90)', async () => {
  const old = {
    app: 'lenchi-studio',
    version: 1,
    exported_at: '2026-10-17T20:00:00.000Z',
    settings: [{ key: 'master_name', value: 'Елена' }],
    services: [{ id: 1, name: 'Маникюр', description: '', duration: 60, price: 1000, archived: 0, sort: 0 }],
    clients: [{ id: 1, name: 'Зейнеп', phone: '0505 777 88 99', telegram: '', notes: '', created_at: 0 }],
    appointments: [
      { id: 1, client_id: 1, date: '2026-10-23', start: 600, duration: 60, price: 1000, status: 'planned', notes: '', created_at: 0 },
    ],
    appointment_services: [{ appointment_id: 1, service_id: 1, name: 'Маникюр', price: 1000, duration: 60 }],
  };
  const db = await fresh();
  await restoreAll(db, parseBackup(JSON.stringify(old)));
  const c = (await listClients(db, '2026-01-01'))[0];
  assert.equal(c.phone, '+905057778899');
  assert.equal((await listAppointmentsByDate(db, '2026-10-23')).length, 1);
});

test('восстановление не сбрасывает отметки о копиях этого телефона', async () => {
  const db = await fresh();
  const text = JSON.stringify(await exportAll(db)); // в копии last_shared_backup = '0'
  await db.runAsync("UPDATE settings SET value = '1760000000000' WHERE key = 'last_shared_backup'");
  await restoreAll(db, parseBackup(text));
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'last_shared_backup'");
  assert.equal(row?.value, '1760000000000');
});

test('чужой или битый файл отклоняется понятным сообщением', () => {
  assert.throws(() => parseBackup('привет'), /не удалось прочитать/);
  assert.throws(() => parseBackup('{"app":"other"}'), /не резервная копия/);
  assert.throws(
    () => parseBackup(JSON.stringify({ app: 'lenchi-studio', schema: 99, settings: [], services: [], clients: [], appointments: [] })),
    /более новой версии/,
  );
});
