// Веб-версия: файловой системы нет — копию скачиваем файлом, автокопий нет.
import { exportAll } from '@/db/backup';
import { saveSettings } from '@/db/queries';
import type { Db } from '@/db/types';

export type BackupKind = 'auto' | 'manual' | 'before-restore';
export type LocalBackup = { file: never; name: string; kind: BackupKind; date: Date; size: number };

export async function writeBackup(_db: Db, _kind: BackupKind): Promise<void> {}

export function listLocalBackups(): LocalBackup[] {
  return [];
}

export async function autoBackupIfNeeded(_db: Db) {}

export async function shareBackup(db: Db) {
  const data = await exportAll(db);
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lenchi-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function saveBackupToFolder(db: Db): Promise<boolean> {
  await shareBackup(db);
  await markSharedBackup(db);
  return true;
}

export async function markSharedBackup(db: Db) {
  await saveSettings(db, { last_shared_backup: String(Date.now()) });
}

export async function shareLocalBackup(_b: LocalBackup) {}

export function pickBackupText(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/plain';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}

export function pickFileBytes(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.arrayBuffer().then((b) => resolve(new Uint8Array(b)), () => resolve(null));
    };
    input.click();
  });
}

export const backupFilesSupported = false;
