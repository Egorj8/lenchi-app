// Тесты импорта из ГномГуру: чтение .xlsx, обращение, без дублей. Файл Excel собирается прямо в тесте.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { strToU8, zipSync } from 'fflate';
import type { Db, Param } from '../src/db/types.ts';
import { migrateDbIfNeeded } from '../src/db/schema.ts';
import { getAppointment, listClients, saveAppointment, saveClient } from '../src/db/queries.ts';
import { applyGnomImport, parseGnomClients, planGnomImport, readXlsx } from '../src/utils/gnomImport.ts';
import { callName } from '../src/utils/names.ts';

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

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** Маленький .xlsx как у ГномГуру: префикс x:, inline-строки, лист sheet.xml */
function xlsx(rows: string[][]) {
  const cols = 'ABCDEFG';
  const body = rows
    .map((r, i) => `<x:row r="${i + 1}">${r.map((v, j) => (v === '' ? '' : `<x:c r="${cols[j]}${i + 1}" t="inlineStr"><x:is><x:t>${esc(v)}</x:t></x:is></x:c>`)).join('')}</x:row>`)
    .join('');
  return zipSync({
    'xl/workbook.xml': strToU8('<workbook/>'),
    'xl/worksheets/sheet.xml': strToU8(`<?xml version="1.0"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>${body}</x:sheetData></x:worksheet>`),
  });
}

const FILE = xlsx([
  ['Name', 'Name in message', 'Phone', 'Email', 'Telegram', 'Instagram', 'Comments'],
  ['Аня💛', 'Аня', '+79627727711', '', '', '', 'Дочь в 6ом & сын <во 2ом>'],
  ['Лопатина Катя', 'Катя', '+7 985 932-61-16;+79250917128', '', '@katya', 'katya.nails', ''],
  ['Ольга', 'Ольга', '0532 111 22 33', '', '', '', ''],
  ['Ольга дубль', 'Ольга', '+905321112233', '', '', '', ''],
  ['', '', '', '', '', '', ''],
  ['Зарплата', '', '', '', '', '', ''],
]);

test('ГномГуру: читаем Excel — имена, обращение, телефоны, комментарии', () => {
  const rows = readXlsx(FILE);
  assert.equal(rows.length, 7);
  const list = parseGnomClients(rows, '90');
  assert.equal(list.length, 5, 'пустая строка пропущена');
  assert.deepEqual(list[0], { name: 'Аня💛', call_name: 'Аня', phone: '+79627727711', telegram: '', notes: 'Дочь в 6ом & сын <во 2ом>' });
  assert.equal(list[1].call_name, 'Катя');
  assert.equal(list[1].phone, '+79859326116');
  assert.equal(list[1].telegram, 'katya');
  assert.equal(list[1].notes, 'Instagram: katya.nails\nЕщё телефон: +79250917128');
  assert.equal(list[2].call_name, '', 'обращение совпадает с первым словом — не храним');
  assert.equal(list[2].phone, '+905321112233');
  assert.equal(list[4].phone, '');
  assert.throws(() => readXlsx(new Uint8Array([1, 2, 3])), /not_xlsx/);
  assert.throws(() => parseGnomClients([['A', 'B']], '90'), /no_columns/);
});

test('ГномГуру: импорт без дублей, у знакомых клиенток дополняем пустое', async () => {
  const db = makeDb();
  await migrateDbIfNeeded(db);
  await saveClient(db, { name: 'Ольга Петрова', phone: '+905321112233', telegram: '', notes: 'любит нюд' });
  const items = parseGnomClients(readXlsx(FILE), '90');
  const plan = await planGnomImport(db, items);
  assert.deepEqual(plan.add.map((c) => c.name), ['Аня💛', 'Лопатина Катя', 'Зарплата']);
  assert.equal(plan.update.length, 0, 'у Ольги дополнять нечего');
  assert.equal(plan.skipped, 2, 'Ольга есть + дубль номера в файле');
  await applyGnomImport(db, plan);
  const clients = await listClients(db, '2026-10-18');
  assert.equal(clients.length, 4);
  const katya = clients.find((c) => c.name === 'Лопатина Катя')!;
  assert.equal(katya.call_name, 'Катя');

  // повторный импорт того же файла ничего не добавляет
  const again = await planGnomImport(db, items);
  assert.equal(again.add.length, 0);
  assert.equal(again.update.length, 0);

  // у клиентки без обращения и заметок — дополним
  await db.runAsync("UPDATE clients SET call_name = '', notes = '' WHERE id = ?", katya.id);
  const fill = await planGnomImport(db, items);
  assert.deepEqual(fill.update, [{ id: katya.id, call_name: 'Катя', notes: 'Instagram: katya.nails\nЕщё телефон: +79250917128' }]);
  await applyGnomImport(db, fill);
  assert.equal((await listClients(db, '2026-10-18', 'лопатина'))[0].call_name, 'Катя');
});

test('обращение в сообщениях: из карточки, иначе первое слово имени', async () => {
  assert.equal(callName('Лопатина Катя', 'Катя'), 'Катя');
  assert.equal(callName('Анна Иванова', ''), 'Анна');
  assert.equal(callName(null, null), '');
  const db = makeDb();
  await migrateDbIfNeeded(db);
  const id = await saveClient(db, { name: 'Лопатина Катя', call_name: 'Катюша', phone: '', telegram: '', notes: '' });
  const a = await saveAppointment(db, { client_id: id, date: '2026-10-20', start: 660, duration: 60, price: 0, notes: '', services: [] });
  assert.equal((await getAppointment(db, a))!.client_call, 'Катюша');
  // правка без поля обращения его не стирает
  await saveClient(db, { id, name: 'Лопатина Екатерина', phone: '', telegram: '', notes: '' });
  assert.equal((await getAppointment(db, a))!.client_call, 'Катюша');
});
