// Резервные копии: формат файла, проверка и восстановление.
// Работа с файлами — в utils/backupFiles.ts (на вебе свой вариант).
import { normalizeAllPhones, SCHEMA_VERSION } from './schema';
import type { Db, Param } from './types';

const TABLES = ['settings', 'services', 'clients', 'appointments', 'appointment_services'] as const;

// Настройки самого телефона, а не данные мастера: при восстановлении не трогаем
const DEVICE_KEYS = ['last_auto_backup', 'last_shared_backup'];
type Table = (typeof TABLES)[number];
type Row = Record<string, unknown>;

export type BackupData = {
  app: 'lenchi-studio';
  version: number; // формат файла
  schema?: number; // версия базы, из которой сделана копия
  exported_at: string;
} & Record<Table, Row[]>;

export type BackupSummary = { exportedAt: Date | null; clients: number; appointments: number; services: number };

export async function exportAll(db: Db): Promise<BackupData> {
  const data: Partial<BackupData> = {
    app: 'lenchi-studio',
    version: 2,
    schema: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
  };
  for (const t of TABLES) data[t] = await db.getAllAsync<Row>(`SELECT * FROM ${t}`);
  return data as BackupData;
}

/** Разбор и проверка файла копии. Бросает ошибку с понятным текстом. */
export function parseBackup(text: string): BackupData {
  let data: unknown;
  try {
    data = JSON.parse(text.trim());
  } catch {
    throw new Error('Это не файл резервной копии: не удалось прочитать содержимое.');
  }
  const d = data as Partial<BackupData>;
  if (!d || typeof d !== 'object' || d.app !== 'lenchi-studio') {
    throw new Error('Это не резервная копия Lenchi Studio.');
  }
  for (const t of TABLES) {
    if (t === 'appointment_services' && d[t] === undefined) continue;
    if (!Array.isArray(d[t])) throw new Error(`В копии повреждён раздел «${t}».`);
  }
  if ((d.schema ?? 1) > SCHEMA_VERSION) {
    throw new Error('Копия сделана в более новой версии приложения. Обновите приложение и попробуйте снова.');
  }
  return { appointment_services: [], ...d } as BackupData;
}

export function summarize(d: BackupData): BackupSummary {
  const alive = (rows: Row[]) => rows.filter((r) => r.deleted_at == null).length;
  const date = d.exported_at ? new Date(d.exported_at) : null;
  return {
    exportedAt: date && !Number.isNaN(date.getTime()) ? date : null,
    clients: alive(d.clients),
    appointments: alive(d.appointments),
    services: d.services.length,
  };
}

/**
 * Полностью заменяет данные содержимым копии.
 * Берём только столбцы, которые есть в текущей схеме, — так подходят и старые копии.
 */
export async function restoreAll(db: Db, d: BackupData) {
  const columns: Record<string, Set<string>> = {};
  for (const t of TABLES) {
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t})`);
    columns[t] = new Set(info.map((c) => c.name));
  }

  const keep = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN (${DEVICE_KEYS.map(() => '?').join(', ')})`,
    ...DEVICE_KEYS,
  );

  await db.withTransactionAsync(async () => {
    // порядок важен из-за внешних ключей
    for (const t of ['appointment_services', 'appointments', 'clients', 'services', 'settings'] as Table[]) {
      await db.runAsync(`DELETE FROM ${t}`);
    }
    for (const t of TABLES) {
      for (const row of d[t]) {
        if (t === 'settings' && DEVICE_KEYS.includes(String(row.key))) continue;
        const keys = Object.keys(row).filter((k) => columns[t].has(k));
        if (!keys.length) continue;
        const values = keys.map((k) => toParam(row[k]));
        await db.runAsync(
          `INSERT INTO ${t} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          ...values,
        );
      }
    }
    for (const k of keep) {
      await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', k.key, k.value);
    }
  });
  // в старых копиях телефоны могли быть без +код
  await normalizeAllPhones(db);
}

function toParam(v: unknown): Param {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return JSON.stringify(v);
}
