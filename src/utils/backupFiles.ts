// Файлы резервных копий на телефоне: автокопии, отправка наружу, выбор файла для восстановления.
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { exportAll } from '@/db/backup';
import { getSettings, saveSettings } from '@/db/queries';
import type { Db } from '@/db/types';

export type BackupKind = 'auto' | 'manual' | 'before-restore';
export type LocalBackup = { file: File; name: string; kind: BackupKind; date: Date; size: number };

const KEEP_AUTO = 7;
const AUTO_EVERY_MS = 20 * 60 * 60 * 1000; // раз в сутки (с запасом)

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

function backupsDir() {
  const dir = new Directory(Paths.document, 'backups');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export async function writeBackup(db: Db, kind: BackupKind): Promise<File> {
  const data = await exportAll(db);
  const file = new File(backupsDir(), `lenchi-${kind}-${stamp()}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(data));
  return file;
}

export function listLocalBackups(): LocalBackup[] {
  const out: LocalBackup[] = [];
  for (const item of backupsDir().list()) {
    if (!(item instanceof File) || !item.name.endsWith('.json')) continue;
    const m = /^lenchi-(auto|manual|before-restore)-(\d{4})-(\d\d)-(\d\d)_(\d\d)-(\d\d)-(\d\d)\.json$/.exec(item.name);
    if (!m) continue;
    const date = new Date(+m[2], +m[3] - 1, +m[4], +m[5], +m[6], +m[7]);
    out.push({ file: item, name: item.name, kind: m[1] as BackupKind, date, size: item.size ?? 0 });
  }
  return out.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Раз в сутки сохраняем копию внутри телефона, храним последние 7 автокопий */
export async function autoBackupIfNeeded(db: Db) {
  const s = await getSettings(db);
  const last = Number(s.last_auto_backup) || 0;
  if (Date.now() - last < AUTO_EVERY_MS) return;
  await writeBackup(db, 'auto');
  await saveSettings(db, { last_auto_backup: String(Date.now()) });
  const autos = listLocalBackups().filter((b) => b.kind === 'auto');
  for (const old of autos.slice(KEEP_AUTO)) old.file.delete();
}

/**
 * Создать копию и открыть меню «Поделиться» (Telegram, Google Диск, Файлы…).
 * Узнать, куда пользователь отправил файл (и отправил ли), нельзя — отметку ставит вызывающий после подтверждения.
 */
export async function shareBackup(db: Db) {
  const file = await writeBackup(db, 'manual');
  // ручные копии внутри телефона не копим — оставляем три последних
  const manuals = listLocalBackups().filter((b) => b.kind === 'manual');
  for (const old of manuals.slice(3)) if (old.name !== file.name) old.file.delete();
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Сохраните резервную копию',
    UTI: 'public.json',
  });
}

/** Сохранить копию в выбранную папку телефона (например, «Загрузки») — она переживёт удаление приложения. */
export async function saveBackupToFolder(db: Db): Promise<boolean> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return false; // папку не выбрали
  }
  const data = await exportAll(db);
  const file = dir.createFile(`lenchi-backup-${stamp()}.json`, 'application/json');
  file.write(JSON.stringify(data));
  await markSharedBackup(db);
  return true;
}

export async function markSharedBackup(db: Db) {
  await saveSettings(db, { last_shared_backup: String(Date.now()) });
}

export async function shareLocalBackup(b: LocalBackup) {
  await Sharing.shareAsync(b.file.uri, { mimeType: 'application/json', dialogTitle: 'Резервная копия', UTI: 'public.json' });
}

/** Системный выбор файла. null — если отменили. */
export async function pickBackupText(): Promise<string | null> {
  const res = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', 'application/octet-stream', '*/*'] });
  if (res.canceled || !res.result) return null;
  return res.result.text();
}

export const backupFilesSupported = true;
