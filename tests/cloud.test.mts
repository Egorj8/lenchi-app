// Тесты онлайн-записи: что уходит в облако, разбор заявок, «принять» без дублей. Облако — поддельный fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import type { Db, Param } from '../src/db/types.ts';
import { migrateDbIfNeeded } from '../src/db/schema.ts';
import { getSettings, listAppointmentsBetween, listClients, listServices, saveAppointment, saveClient, saveEvent, saveSettings, setAppointmentStatus } from '../src/db/queries.ts';
import { buildBusy, buildConfig, requestConflicts, requestServices, type CloudRequest } from '../src/utils/cloud.ts';
import { acceptRequest, declineRequest, hideRequests, syncCloud } from '../src/utils/cloudSync.ts';
import { expandEvents } from '../src/utils/personal.ts';
import { weekday } from '../src/utils/date.ts';
import { outsideWorkHours } from '../src/utils/cloud.ts';

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
    } finally { st.free(); }
  };
  return {
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, ...p) { all(sql, p); const changes = db.getRowsModified(); return { changes, lastInsertRowId: all<{ id: number }>('SELECT last_insert_rowid() AS id', [])[0].id }; },
    async getAllAsync(sql, ...p) { return all(sql, p); },
    async getFirstAsync(sql, ...p) { return all(sql, p)[0] ?? null; },
    async withTransactionAsync(t) { db.exec('BEGIN'); try { await t(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}

/** Поддельное облако: запоминает вызовы, отвечает заранее заданным */
function fakeCloud(answers: Record<string, unknown> = {}, status = 200) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const impl = (async (url: string, init: { body: string }) => {
    const fn = String(url).split('/rpc/')[1];
    const args = JSON.parse(init.body);
    calls.push({ fn, args });
    const body = status === 200 ? (answers[fn] ?? null) : { message: 'forbidden' };
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const req = (over: Partial<CloudRequest> = {}): CloudRequest => ({
  id: 7, created_at: '2026-10-18T10:00:00Z', day: '2026-10-22', start_min: 13 * 60, duration: 120,
  services: [{ id: 2, name: 'Комплекс 2 · короткие', price: 1300, min: 120 }], price: 1300,
  name: 'Анна', phone: '0532 111 22 33', channel: 'wa', comment: 'Хочу френч', first_time: true,
  status: 'new', handled_at: null, ...over,
});

test('облако: занятое время — записи и дела «занята», без отменённых', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  const c = await saveClient(db, { name: 'Ольга', phone: '', telegram: '', notes: '' });
  await saveAppointment(db, { client_id: c, date: '2026-10-20', start: 660, duration: 90, price: 0, notes: '', services: [] });
  const cancelled = await saveAppointment(db, { client_id: c, date: '2026-10-20', start: 900, duration: 60, price: 0, notes: '', services: [] });
  await setAppointmentStatus(db, cancelled, 'cancelled');
  await saveEvent(db, { title: 'Обед', category: 'personal', date: '2026-10-20', start: 780, duration: 30, all_day: 0, repeat: 'weekly', repeat_until: null, busy: 1, notes: '' });
  await saveEvent(db, { title: 'Позвонить', category: 'personal', date: '2026-10-20', start: 800, duration: 15, all_day: 0, repeat: 'none', repeat_until: null, busy: 0, notes: '' });
  const appts = await listAppointmentsBetween(db, '2026-10-18', '2026-10-31');
  const { listEventsBetween } = await import('../src/db/queries.ts');
  const ev = expandEvents(await listEventsBetween(db, '2026-10-18', '2026-10-31'), '2026-10-18', '2026-10-31');
  const busy = buildBusy(appts, ev, '2026-10-18', 14);
  assert.deepEqual(busy, [
    { day: '2026-10-20', start_min: 660, end_min: 750 },
    { day: '2026-10-20', start_min: 780, end_min: 810 },
    { day: '2026-10-27', start_min: 780, end_min: 810 }, // обед повторяется
  ]);
});

test('облако: услуги и график для страницы — без архивных, педикюр отдельной группой', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  const services = await listServices(db, true);
  await db.runAsync('UPDATE services SET archived = 1 WHERE id = ?', services[0].id);
  const cfg = buildConfig(await getSettings(db), await listServices(db, true));
  assert.equal(cfg.services.length, services.length - 1);
  assert.deepEqual(cfg.workDays, [2, 4, 5]);
  assert.equal(cfg.whatsapp, '79951000516');
  assert.equal(cfg.services.at(-1)!.group, 'Педикюр и гигиена');
  assert.equal(cfg.services[0].group, 'Маникюр');
  assert.ok(!('address' in cfg), 'адрес на сайт не уходит');
});

test('облако: обмен выгружает только изменения и находит новые заявки', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  assert.equal(await syncCloud(db, '2026-10-18', fakeCloud().impl), null, 'без ключа облака — ничего не делаем');

  await saveSettings(db, { cloud_key: 'k' });
  const cloud = fakeCloud({ master_requests: [req({ id: 8 }), req({ id: 7, status: 'accepted' })] });
  const r1 = await syncCloud(db, '2026-10-18', cloud.impl);
  assert.deepEqual(cloud.calls.map((c) => c.fn), ['master_set_config', 'master_sync_busy', 'master_requests']);
  assert.equal(cloud.calls[1].args.p_to, '2026-12-16');
  assert.deepEqual(r1!.fresh.map((r) => r.id), [8]);

  // второй раз: ничего не менялось — только заявки, и уведомлять уже не о чем
  const r2 = await syncCloud(db, '2026-10-18', cloud.impl);
  assert.deepEqual(cloud.calls.slice(3).map((c) => c.fn), ['master_requests']);
  assert.equal(r2!.fresh.length, 0);

  // новая запись в календаре → занятое время уходит снова
  await saveAppointment(db, { client_id: null, date: '2026-10-22', start: 660, duration: 60, price: 0, notes: '', services: [] });
  await syncCloud(db, '2026-10-18', cloud.impl);
  assert.deepEqual(cloud.calls.slice(4).map((c) => c.fn), ['master_sync_busy', 'master_requests']);
});

test('облако: неверный ключ — понятная ошибка', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  await saveSettings(db, { cloud_key: 'wrong' });
  await assert.rejects(syncCloud(db, '2026-10-18', fakeCloud({}, 400).impl), (e: { code: string }) => e.code === 'forbidden');
});

test('облако: принять заявку — клиентка и запись, повторное нажатие не дублирует', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  await saveSettings(db, { cloud_key: 'k' });
  const cloud = fakeCloud();
  const id = await acceptRequest(db, req(), cloud.impl);
  assert.deepEqual(cloud.calls[0], { fn: 'master_set_status', args: { p_key: 'k', p_id: 7, p_status: 'accepted' } });
  const appts = await listAppointmentsBetween(db, '2026-10-22', '2026-10-22');
  assert.equal(appts.length, 1);
  assert.equal(appts[0].id, id);
  assert.equal(appts[0].client_name, 'Анна');
  assert.equal(appts[0].client_phone, '+905321112233');
  assert.equal(appts[0].start, 780);
  assert.equal(appts[0].services_label, 'Комплекс 2 · короткие');
  assert.match(appts[0].notes, /Хочу френч\nЗаявка с сайта №7/);

  assert.equal(await acceptRequest(db, req(), cloud.impl), id);
  assert.equal((await listAppointmentsBetween(db, '2026-10-22', '2026-10-22')).length, 1);

  // та же клиентка с другой заявкой — новую карточку не заводим (номер в другом формате)
  await acceptRequest(db, req({ id: 9, day: '2026-10-23', phone: '+90 532 111 22 33' }), cloud.impl);
  assert.equal((await listClients(db, '2026-10-18')).length, 1);
});

test('облако: без связи заявка не принимается и ничего не создаётся', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  await saveSettings(db, { cloud_key: 'k' });
  const offline = (async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
  await assert.rejects(acceptRequest(db, req(), offline), (e: { code: string }) => e.code === 'network');
  assert.equal((await listClients(db, '2026-10-18')).length, 0);
  const cloud = fakeCloud();
  await declineRequest(db, req(), cloud.impl);
  assert.equal(cloud.calls[0].args.p_status, 'declined');
});

test('облако: услуги заявки, пересечения и рабочие часы', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  const services = await listServices(db, true);
  const r = req({ services: [{ id: services[1].id, name: 'Комплекс 2', price: 1300, min: 120 }, { id: 999, name: 'Старая услуга', price: 100, min: 30 }] });
  const mapped = requestServices(r, services);
  assert.equal(mapped[0].service_id, services[1].id);
  assert.equal(mapped[1].service_id, null);
  assert.equal(mapped[1].name, 'Старая услуга');

  const appt = { date: '2026-10-22', start: 840, duration: 60, status: 'planned', client_name: 'Ольга' } as never;
  assert.deepEqual(requestConflicts(req(), [appt], []), ['Ольга']);
  assert.deepEqual(requestConflicts(req({ start_min: 900 }), [appt], []), []);

  const s = await getSettings(db);
  assert.equal(outsideWorkHours(req(), s, weekday), false); // чт 13:00–15:00
  assert.equal(outsideWorkHours(req({ day: '2026-10-21' }), s, weekday), true); // среда — выходной
  assert.equal(outsideWorkHours(req({ start_min: 18 * 60 }), s, weekday), true); // до 20:00 — позже конца дня
});

test('облако: обработанные заявки можно убрать из списка, новые — нельзя', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  await saveSettings(db, { cloud_key: 'k' });
  const cloud = fakeCloud({ master_requests: [req({ id: 9 }), req({ id: 8, status: 'declined' }), req({ id: 7, status: 'accepted' })] });
  await hideRequests(db, [7, 8, 9]);
  const r = await syncCloud(db, '2026-10-18', cloud.impl);
  assert.deepEqual(r!.requests.map((x) => x.id), [9], 'новая заявка видна, даже если её «убрали»');
  // через 30 дней облако их больше не присылает — номера забываются
  const later = fakeCloud({ master_requests: [req({ id: 8, status: 'declined' })] });
  await syncCloud(db, '2026-10-18', later.impl);
  assert.equal((await getSettings(db)).cloud_hidden, '8');
});
