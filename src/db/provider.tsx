import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import type { ReactNode } from 'react';
import type { Db } from './types';

// Телефон: нативный SQLite из expo-sqlite (используется с <Suspense>)
export function DbProvider({ children, onInit }: { children: ReactNode; onInit: (db: Db) => Promise<void> }) {
  // ВАЖНО: onInit передаём как есть, без обёртки-стрелки. expo-sqlite кэширует открытую базу
  // по ссылке на onInit; новая функция на каждой перерисовке заставляет его закрывать
  // и открывать базу заново по кругу — приложение навсегда зависает на загрузке.
  return (
    <SQLiteProvider databaseName="lenchi.db" onInit={onInit as unknown as (db: SQLiteDatabase) => Promise<void>} useSuspense>
      {children}
    </SQLiteProvider>
  );
}

export function useDb(): Db {
  return useSQLiteContext() as unknown as Db;
}
