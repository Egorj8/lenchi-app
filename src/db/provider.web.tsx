import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { colors } from '@/theme';
import type { Db, Param } from './types';

/*
 * Браузер: SQLite через sql.js (WebAssembly) с сохранением файла базы в IndexedDB.
 * Работает в любом современном браузере, включая Safari на iPhone,
 * и не требует OPFS и специальных заголовков сервера.
 * Файлы sql.js лежат в public/sqljs и подключаются скриптом, а не через бандлер.
 */

type SqlValue = string | number | null | Uint8Array;
type Statement = {
  bind(values: Param[]): void;
  step(): boolean;
  getAsObject(): Record<string, SqlValue>;
  free(): void;
};
type SqlDatabase = {
  exec(sql: string): unknown;
  prepare(sql: string): Statement;
  getRowsModified(): number;
  export(): Uint8Array;
};
type SqlJs = { Database: new (data?: Uint8Array) => SqlDatabase };

declare global {
  interface Window {
    initSqlJs?: (config: { locateFile: (file: string) => string }) => Promise<SqlJs>;
  }
}

const IDB_NAME = 'lenchi-studio';
const IDB_STORE = 'db';
const IDB_KEY = 'main';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadBytes(): Promise<Uint8Array | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result as Uint8Array | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function saveBytes(bytes: Uint8Array) {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.initSqlJs) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.head.appendChild(s);
  });
}

class WebDb implements Db {
  private inTx = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private db: SqlDatabase) {
    // iOS может выгрузить приложение в фоне — сохраняемся при сворачивании
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
    window.addEventListener('pagehide', () => this.flush());
  }

  private scheduleSave() {
    if (this.inTx) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    if (this.inTx) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    saveBytes(this.db.export()).catch((e) => console.error('Не удалось сохранить базу', e));
  }

  private all<T>(sql: string, params: Param[]): T[] {
    const stmt = this.db.prepare(sql);
    try {
      if (params.length) stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  async execAsync(sql: string) {
    this.db.exec(sql);
    this.scheduleSave();
  }

  async runAsync(sql: string, ...params: Param[]) {
    this.all(sql, params);
    const changes = this.db.getRowsModified();
    const id = this.all<{ id: number }>('SELECT last_insert_rowid() AS id', [])[0]?.id ?? 0;
    this.scheduleSave();
    return { lastInsertRowId: id, changes };
  }

  async getAllAsync<T>(sql: string, ...params: Param[]) {
    return this.all<T>(sql, params);
  }

  async getFirstAsync<T>(sql: string, ...params: Param[]) {
    return this.all<T>(sql, params)[0] ?? null;
  }

  async withTransactionAsync(task: () => Promise<void>) {
    this.db.exec('BEGIN');
    this.inTx = true;
    try {
      await task();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    } finally {
      this.inTx = false;
    }
    this.scheduleSave();
  }
}

async function openDb(onInit: (db: Db) => Promise<void>) {
  await loadScript('/sqljs/sql-wasm.js');
  const SQL = await window.initSqlJs!({ locateFile: (f) => `/sqljs/${f}` });
  const db = new WebDb(new SQL.Database(await loadBytes()));
  await onInit(db);
  db.flush();
  // просим браузер не удалять данные при нехватке места
  navigator.storage?.persist?.().catch(() => {});
  return db;
}

const DbContext = createContext<Db | null>(null);

export function DbProvider({ children, onInit }: { children: ReactNode; onInit: (db: Db) => Promise<void> }) {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    openDb(onInit).then(setDb, (e) => setError(String(e?.message ?? e)));
  }, [onInit]);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8 }}>Не удалось открыть базу</Text>
        <Text style={{ color: colors.muted, textAlign: 'center' }}>{error}</Text>
      </View>
    );
  }
  if (!db) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): Db {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb вызван вне DbProvider');
  return db;
}
