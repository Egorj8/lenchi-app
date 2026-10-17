import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';
import type { Db } from './types';

// Телефон: нативный SQLite из expo-sqlite (используется с <Suspense>)
export function DbProvider({ children, onInit }: { children: ReactNode; onInit: (db: Db) => Promise<void> }) {
  return (
    <SQLiteProvider databaseName="lenchi.db" onInit={(db) => onInit(db as unknown as Db)} useSuspense>
      {children}
    </SQLiteProvider>
  );
}

export function useDb(): Db {
  return useSQLiteContext() as unknown as Db;
}
