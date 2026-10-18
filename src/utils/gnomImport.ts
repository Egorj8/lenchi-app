// Импорт клиенток из выгрузки ГномГуру (Excel: «Name», «Name in message», «Phone», «Comments»…).
// Без React Native — тестируется на sql.js (tests/gnom.test.mts).
import { unzipSync, strFromU8 } from 'fflate';
import type { Db } from '@/db/types';
import { normalizePhone } from './phone';

/** Строки первого листа .xlsx: массив массивов ячеек-строк */
export function readXlsx(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('not_xlsx');
  }
  const sheetName = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d*\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error('not_xlsx');
  const shared: string[] = [];
  if (files['xl/sharedStrings.xml']) {
    for (const si of xml(files['xl/sharedStrings.xml']).match(/<si>[\s\S]*?<\/si>/g) ?? []) shared.push(texts(si));
  }
  const rows: string[][] = [];
  for (const row of xml(files[sheetName]).match(/<row[\s>][\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];
    for (const m of row.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = m[1];
      const body = m[2] ?? '';
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const col = ref ? colIndex(ref) : cells.length;
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = texts(body);
      else if (v !== undefined) value = unescape(v);
      while (cells.length < col) cells.push('');
      cells[col] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/** Текст XML без префиксов пространств имён: ГномГуру пишет <x:row>, Excel — <row> */
function xml(bytes: Uint8Array) {
  return strFromU8(bytes).replace(/<(\/?)[A-Za-z][\w.-]*:/g, '<$1');
}

function colIndex(ref: string) {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function texts(xml: string) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join('');
}

function unescape(s: string) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

export type GnomClient = { name: string; call_name: string; phone: string; telegram: string; notes: string };

// заголовки ГномГуру (английские и на случай русской выгрузки)
const HEADERS: Record<keyof GnomClient | 'email' | 'instagram', RegExp> = {
  name: /^(name|имя|клиент|фио)$/i,
  call_name: /^(name in message|имя в сообщени\S*|обращение)$/i,
  phone: /^(phone|телефон)$/i,
  telegram: /^telegram$/i,
  notes: /^(comments?|комментари\S*|заметк\S*)$/i,
  email: /^(e-?mail|почта)$/i,
  instagram: /^instagram$/i,
};

/** Клиентки из строк таблицы. Пустые строки пропускаются, номера приводятся к +код. */
export function parseGnomClients(rows: string[][], country: string): GnomClient[] {
  const head = rows[0]?.map((h) => h.trim()) ?? [];
  const col = (k: keyof typeof HEADERS) => head.findIndex((h) => HEADERS[k].test(h));
  const idx = { name: col('name'), call: col('call_name'), phone: col('phone'), tg: col('telegram'), notes: col('notes'), email: col('email'), insta: col('instagram') };
  if (idx.name < 0 && idx.call < 0) throw new Error('no_columns');
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const out: GnomClient[] = [];
  for (const r of rows.slice(1)) {
    const call = get(r, idx.call);
    const name = get(r, idx.name) || call;
    if (!name) continue;
    const extra = [get(r, idx.insta) && `Instagram: ${get(r, idx.insta)}`, get(r, idx.email) && `Почта: ${get(r, idx.email)}`].filter(Boolean);
    // несколько номеров в ячейке: «+7…;+7…» — первый основной, остальные в заметку
    const [phone = '', ...more] = get(r, idx.phone).split(/[;,/\n]+/).map((p) => p.trim()).filter(Boolean);
    if (more.length) extra.push(`Ещё ${more.length > 1 ? 'телефоны' : 'телефон'}: ${more.join(', ')}`);
    out.push({
      name,
      // обращение нужно, только если оно отличается от первого слова имени
      call_name: call && call !== name.split(/\s+/)[0] ? call : '',
      phone: phone ? normalizePhone(phone, country) : '',
      telegram: get(r, idx.tg).replace(/^@/, '').replace(/^https?:\/\/t\.me\//, ''),
      notes: [get(r, idx.notes), ...extra].filter(Boolean).join('\n'),
    });
  }
  return out;
}

export type GnomPlan = {
  /** новые клиентки */
  add: GnomClient[];
  /** уже есть в базе (по номеру) — дополним пустые поля */
  update: { id: number; call_name?: string; telegram?: string; notes?: string }[];
  /** уже есть и дополнять нечего, или повтор внутри файла */
  skipped: number;
};

type Existing = { id: number; name: string; phone: string; telegram: string; notes: string; call_name: string };

/** Что будет сделано: без дублей — по номеру телефона, у кого номера нет — по имени */
export async function planGnomImport(db: Db, items: GnomClient[]): Promise<GnomPlan> {
  const rows = await db.getAllAsync<Existing>('SELECT id, name, phone, telegram, notes, call_name FROM live_clients');
  const byPhone = new Map(rows.filter((r) => r.phone).map((r) => [r.phone, r]));
  const byName = new Map(rows.filter((r) => !r.phone).map((r) => [r.name.toLowerCase(), r]));
  const plan: GnomPlan = { add: [], update: [], skipped: 0 };
  const seen = new Set<string>();
  for (const it of items) {
    const key = it.phone || `name:${it.name.toLowerCase()}`;
    if (seen.has(key)) { plan.skipped++; continue; }
    seen.add(key);
    const ex = it.phone ? byPhone.get(it.phone) : byName.get(it.name.toLowerCase());
    if (!ex) { plan.add.push(it); continue; }
    const patch: GnomPlan['update'][number] = { id: ex.id };
    if (!ex.call_name && it.call_name) patch.call_name = it.call_name;
    if (!ex.telegram && it.telegram) patch.telegram = it.telegram;
    if (it.notes && !ex.notes.includes(it.notes)) patch.notes = ex.notes ? `${ex.notes}\n${it.notes}` : it.notes;
    if (Object.keys(patch).length > 1) plan.update.push(patch);
    else plan.skipped++;
  }
  return plan;
}

export async function applyGnomImport(db: Db, plan: GnomPlan) {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const c of plan.add) {
      await db.runAsync(
        'INSERT INTO clients (name, call_name, phone, telegram, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        c.name, c.call_name, c.phone, c.telegram, c.notes, now,
      );
    }
    for (const u of plan.update) {
      const sets = (['call_name', 'telegram', 'notes'] as const).filter((k) => u[k] !== undefined);
      await db.runAsync(`UPDATE clients SET ${sets.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...sets.map((k) => u[k]!), u.id);
    }
  });
}
