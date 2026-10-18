// Тесты этапа 3: дни рождения, лист ожидания, утренняя сводка, «пора на коррекцию» в базе.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import type { Db, Param } from '../src/db/types.ts';
import { migrateDbIfNeeded } from '../src/db/schema.ts';
import {
  closeWaitEntry, listWaitlist, rebookCandidates, saveAppointment, saveClient, saveWaitEntry,
  setAppointmentStatus, snoozeRebook,
} from '../src/db/queries.ts';
import { exportAll, parseBackup, restoreAll } from '../src/db/backup.ts';
import {
  birthdayInput, firstMatchingSlot, fmtBirthday, matchesWish, morningSummary, nextBirthday, parseBirthday, slotsShort, wishLabel,
} from '../src/utils/attention.ts';

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

test('день рождения: ввод и формат', () => {
  assert.equal(parseBirthday('12.03'), '03-12');
  assert.equal(parseBirthday('1.3.1990'), '1990-03-01');
  assert.equal(parseBirthday('29.02'), '02-29');
  assert.equal(parseBirthday(''), null);
  assert.equal(parseBirthday('31.02'), undefined);
  assert.equal(parseBirthday('abc'), undefined);
  assert.equal(birthdayInput('1990-03-01'), '01.03.1990');
  assert.equal(birthdayInput('03-12'), '12.03');
  assert.equal(fmtBirthday('1990-03-01'), '1 марта');
});

test('ближайший день рождения и возраст', () => {
  assert.deepEqual(nextBirthday('1990-10-18', '2026-10-18'), { date: '2026-10-18', daysLeft: 0, age: 36 });
  assert.deepEqual(nextBirthday('10-20', '2026-10-18'), { date: '2026-10-20', daysLeft: 2, age: null });
  assert.equal(nextBirthday('1990-01-05', '2026-10-18').date, '2027-01-05');
  assert.equal(nextBirthday('02-29', '2027-01-10').date, '2027-02-28');
});

test('лист ожидания: совпадение по дню недели, части дня и сроку', () => {
  const w = { days: '2,4', part: 'evening', until: '2026-10-31' }; // вт, чт после 16
  assert.equal(matchesWish(w, '2026-10-22', 17 * 60), true); // чт 17:00
  assert.equal(matchesWish(w, '2026-10-22', 13 * 60), false); // чт днём
  assert.equal(matchesWish(w, '2026-10-23', 17 * 60), false); // пт
  assert.equal(matchesWish(w, '2026-11-03', 17 * 60), false); // после срока
  assert.equal(matchesWish({ days: '', part: 'any', until: null }, '2026-10-23', 11 * 60), true);
  assert.equal(wishLabel(w), 'вт, чт · после 16');
  const slots = [{ date: '2026-10-22', times: [660, 960] }];
  assert.deepEqual(firstMatchingSlot(w, slots), { date: '2026-10-22', start: 960 });
});

test('короткий список окошек для сообщения', () => {
  assert.equal(slotsShort([{ date: '2026-10-22', times: [660, 780] }, { date: '2026-10-23', times: [660] }], 2), 'чт 22.10 в 11:00, чт 22.10 в 13:00');
  assert.equal(slotsShort([]), 'напишите, когда удобно');
});

test('утренняя сводка', () => {
  const s = morningSummary('2026-10-20', '2026-10-20', [
    { start: 900, client_name: 'Светлана Орлова', status: 'planned', reminded_at: null },
    { start: 660, client_name: 'Наталья Козлова', status: 'planned', reminded_at: 1 },
    { start: 720, client_name: 'Зейнеп', status: 'cancelled', reminded_at: null },
  ], ['Анна'], 3)!;
  assert.equal(s.title, 'Сегодня 2 записи');
  assert.equal(s.body, '11:00 Наталья · 15:00 Светлана\nНапоминание не отправлено: 1 клиентке\n🎂 День рождения: Анна\n💅 Пора на коррекцию: 3 клиентки');
  assert.equal(morningSummary('2026-10-21', '2026-10-20', [], [], 5), null, 'коррекция только в сегодняшней сводке');
});

test('база: «пора на коррекцию», отложить, будущая запись убирает из списка', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  const anna = await saveClient(db, { name: 'Анна', phone: '+905551112233', telegram: '', notes: '' });
  const olga = await saveClient(db, { name: 'Ольга', phone: '+905551112244', telegram: '', notes: '' });
  const visit = async (c: number, date: string, status?: 'done') => {
    const id = await saveAppointment(db, { client_id: c, date, start: 660, duration: 60, price: 1000, notes: '', services: [{ service_id: 1, name: 'Комплекс 1', price: 1000, duration: 60 }] });
    if (status) await setAppointmentStatus(db, id, status);
  };
  await visit(anna, '2026-09-20', 'done'); // 28 дней назад
  await visit(olga, '2026-10-10', 'done'); // 8 дней — рано
  let r = await rebookCandidates(db, '2026-10-18', 21);
  assert.deepEqual(r.map((x) => [x.name, x.days_since, x.last_services]), [['Анна', 28, 'Комплекс 1']]);
  await snoozeRebook(db, anna, '2026-10-25');
  assert.equal((await rebookCandidates(db, '2026-10-18', 21)).length, 0);
  await snoozeRebook(db, anna, null);
  await visit(anna, '2026-10-22'); // записалась
  assert.equal((await rebookCandidates(db, '2026-10-18', 21)).length, 0);
});

test('база: лист ожидания и резервная копия', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  const c = await saveClient(db, { name: 'Мария', phone: '', telegram: '', notes: '', birthday: '03-12' });
  const w = await saveWaitEntry(db, { client_id: c, days: '4', part: 'evening', note: 'френч', until: null });
  assert.equal((await listWaitlist(db, '2026-10-18'))[0].client_name, 'Мария');
  const other = makeDb();
  await migrateDbIfNeeded(other);
  await restoreAll(other, parseBackup(JSON.stringify(await exportAll(db))));
  assert.equal((await listWaitlist(other, '2026-10-18')).length, 1);
  assert.equal((await other.getFirstAsync<{ birthday: string }>('SELECT birthday FROM clients'))!.birthday, '03-12');
  await closeWaitEntry(db, w);
  assert.equal((await listWaitlist(db, '2026-10-18')).length, 0);
});
