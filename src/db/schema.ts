import type { Db } from './types';

const DATABASE_VERSION = 1;

// Прайс Елены со страницы записи в ГномГуру
const SEED_SERVICES: [string, string, number, number][] = [
  ['Комплекс 1 · короткие', 'Маникюр с гелевым/базовым покрытием', 70, 1200],
  ['Комплекс 2 · короткие', 'Маникюр с гелевым укреплением + гель-лак', 120, 1300],
  ['Комплекс 3 · длинные', 'Гелевое укрепление без цветного гель-лака', 120, 1300],
  ['Комплекс 4 · длинные', 'Гелевое покрытие и гель-лак', 150, 1400],
  ['Комплекс 5 · длинные', 'Гелевое покрытие + френч / втирка / кошка / витраж', 150, 1500],
  ['Наращивание', 'Наращивание всех ногтей', 180, 1700],
  ['Педикюр', 'Только пальчики, однотонное покрытие', 90, 1200],
  ['Гигиена', 'Маникюр или педикюр без покрытия', 60, 600],
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  master_name: 'Елена',
  studio_name: 'Lenchi Studio',
  currency: '₺',
  phone: '+7 995 100-05-16',
  address: 'Mandalin site, А блок, 12 эт., 23 кв. Домофон: 23#',
  work_days: '2,4,5',
  work_start: '11:00',
  work_end: '19:00',
  slot_length: '120',
  reminder_template:
    'Здравствуйте, {имя}! 💅 Напоминаю о записи {дата} в {время}: {услуга}.\nАдрес: {адрес}\nЕсли планы изменились, напишите, пожалуйста. {мастер}',
  slots_header: 'Не пора ли нам записаться на маникюр/педикюр на удобное время?\nМой телефон {телефон}\n\n⏱ Свободное время для записи в ближайшие дни:',
  slots_footer: 'Если не подошло ничего, пишите в личку, что-нибудь придумаем 😉',
};

export async function migrateDbIfNeeded(db: Db) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= DATABASE_VERSION) return;

  if (current === 0) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        duration INTEGER NOT NULL,
        price REAL NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        sort INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        telegram TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        date TEXT NOT NULL,
        start INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'planned',
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS appointment_services (
        appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
        service_id INTEGER,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        duration INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(date);
      CREATE INDEX IF NOT EXISTS idx_appt_client ON appointments(client_id);
    `);

    await db.withTransactionAsync(async () => {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await db.runAsync('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', key, value);
      }
      let i = 0;
      for (const [name, description, duration, price] of SEED_SERVICES) {
        await db.runAsync(
          'INSERT INTO services (name, description, duration, price, sort) VALUES (?, ?, ?, ?, ?)',
          name, description, duration, price, i++,
        );
      }
    });
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
