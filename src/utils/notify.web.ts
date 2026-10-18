// Веб-версия: локальных уведомлений нет.
import type { Db } from '@/db/types';

export async function requestNotifyPermission() {
  return false;
}
export async function notifyPermissionGranted() {
  return false;
}
export async function rescheduleMorning(_db: Db) {}
export async function notifyNewRequests(_fresh: unknown[]) {}
export function useNotificationRouting() {}
export const notificationsSupported = false;
