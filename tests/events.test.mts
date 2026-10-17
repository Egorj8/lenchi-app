// Тесты личных дел: повторы, занятость, база и резервные копии.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import type { Db, Param } from '../src/db/types.ts';
import type { PersonalEvent } from '../src/db/queries.ts';
import { migrateDbIfNeeded } from '../src/db/schema.ts';
import { deleteEvent, listEventsBetween, restoreEvent, saveEvent, trashCount } from '../src/db/queries.ts';
import { exportAll, parseBackup, restoreAll } from '../src/db/backup.ts';
import { busyIntervals, expandEvents } from '../src/utils/personal.ts';

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
      try { await task(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

const base: PersonalEvent = {
  id: 1, title: 'Пробежка', category: 'sport', date: '2026-10-20', start: 480, duration: 45, all_day: 0,
  repeat: 'none', repeat_until: null, busy: 1, done: 0, notes: '', created_at: 0, deleted_at: null,
};

test('разовое дело попадает только в свой день', () => {
  const occ = expandEvents([base], '2026-10-19', '2026-10-25');
  assert.deepEqual(occ.map((o) => o.occurrence), ['2026-10-20']);
  assert.equal(expandEvents([base], '2026-10-21', '2026-10-25').length, 0);
});

test('каждый день — с первой даты, не раньше', () => {
  const occ = expandEvents([{ ...base, repeat: 'daily' }], '2026-10-18', '2026-10-23');
  assert.deepEqual(occ.map((o) => o.occurrence), ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
});

test('каждую неделю — в тот же день недели', () => {
  // 20.10.2026 — вторник
  const occ = expandEvents([{ ...base, repeat: 'weekly' }], '2026-10-21', '2026-11-12');
  assert.deepEqual(occ.map((o) => o.occurrence), ['2026-10-27', '2026-11-03', '2026-11-10']);
});

test('повтор останавливается на repeat_until', () => {
  const occ = expandEvents([{ ...base, repeat: 'daily', repeat_until: '2026-10-22' }], '2026-10-19', '2026-10-30');
  assert.deepEqual(occ.map((o) => o.occurrence), ['2026-10-20', '2026-10-21', '2026-10-22']);
});

test('занятость: только дела «занимает время» и не сделанные; весь день — целиком', () => {
  const occ = expandEvents(
    [
      base,
      { ...base, id: 2, title: 'Позвонить маме', busy: 0 },
      { ...base, id: 3, title: 'Сделано', done: 1 },
      { ...base, id: 4, title: 'Поездка', all_day: 1 },
    ],
    '2026-10-20', '2026-10-20',
  );
  const b = busyIntervals(occ, '2026-10-20');
  assert.deepEqual(b.map((x) => x.title).sort(), ['Поездка', 'Пробежка']);
  assert.deepEqual(b.find((x) => x.title === 'Поездка'), { start: 0, end: 1440, title: 'Поездка' });
  assert.deepEqual(b.find((x) => x.title === 'Пробежка'), { start: 480, end: 525, title: 'Пробежка' });
});

test('база: обновление v3 → v4 создаёт таблицу дел', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  await db.execAsync('DROP VIEW live_events; DROP TABLE events; PRAGMA user_version = 3;');
  await migrateDbIfNeeded(db);
  const id = await saveEvent(db, { ...base, id: undefined });
  assert.ok(id > 0);
  assert.equal((await listEventsBetween(db, '2026-10-20', '2026-10-20')).length, 1);
});

test('база: повторяющееся дело находится в будущем диапазоне', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  await saveEvent(db, { ...base, id: undefined, repeat: 'weekly' });
  await saveEvent(db, { ...base, id: undefined, title: 'Старое', date: '2026-09-01', repeat: 'daily', repeat_until: '2026-09-10' });
  const rows = await listEventsBetween(db, '2026-12-01', '2026-12-07');
  assert.deepEqual(rows.map((r) => r.title), ['Пробежка']);
});

test('удаление дела в корзину и возврат', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  const id = await saveEvent(db, { ...base, id: undefined });
  await deleteEvent(db, id);
  assert.equal((await listEventsBetween(db, '2026-10-20', '2026-10-20')).length, 0);
  assert.equal(await trashCount(db), 1);
  await restoreEvent(db, id);
  assert.equal((await listEventsBetween(db, '2026-10-20', '2026-10-20')).length, 1);
});

test('дела попадают в резервную копию; старая копия без дел восстанавливается', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  await saveEvent(db, { ...base, id: undefined });
  const data = await exportAll(db);
  assert.equal(data.events.length, 1);

  const other = makeDb();
  await migrateDbIfNeeded(other);
  await restoreAll(other, parseBackup(JSON.stringify(data)));
  assert.equal((await listEventsBetween(other, '2026-10-20', '2026-10-20'))[0].title, 'Пробежка');

  // копия из прошлой версии, где дел ещё не было
  const old = { ...data } as Record<string, unknown>;
  delete old.events;
  await restoreAll(other, parseBackup(JSON.stringify(old)));
  assert.equal((await listEventsBetween(other, '2026-10-20', '2026-10-20')).length, 0, 'старая копия заменяет данные целиком');
});
