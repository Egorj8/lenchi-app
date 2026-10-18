// Состояние онлайн-записи для экранов: заявки, время последнего обмена, ошибка.
// Обмен запускает (tabs)/_layout.tsx: при запуске, возвращении в приложение, раз в 3 минуты и после изменений.
import { useSyncExternalStore } from 'react';
import type { Db } from '@/db/types';
import type { CloudRequest } from './cloud';
import { cloudErrorText, hideRequests, syncCloud } from './cloudSync';
import { todayKey } from './date';
import { notifyNewRequests } from './notify';

export type CloudState = {
  configured: boolean;
  requests: CloudRequest[];
  newCount: number;
  lastSync: number;
  error: string | null;
  syncing: boolean;
};

let state: CloudState = { configured: false, requests: [], newCount: 0, lastSync: 0, error: null, syncing: false };
const listeners = new Set<() => void>();

function set(patch: Partial<CloudState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useCloud(): CloudState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => state,
    () => state,
  );
}

let running: Promise<void> | null = null;

/** Обмен с облаком; одновременно идёт только один, остальные вызовы ждут его */
export function runCloudSync(db: Db): Promise<void> {
  if (running) return running;
  running = (async () => {
    set({ syncing: true });
    try {
      const res = await syncCloud(db, todayKey());
      if (!res) {
        set({ configured: false, requests: [], newCount: 0, error: null });
        return;
      }
      set({
        configured: true,
        requests: res.requests,
        newCount: res.requests.filter((r) => r.status === 'new').length,
        lastSync: res.at,
        error: null,
      });
      if (res.fresh.length) notifyNewRequests(res.fresh).catch(() => {});
    } catch (e) {
      set({ configured: true, error: cloudErrorText(e) });
    } finally {
      set({ syncing: false });
      running = null;
    }
  })();
  return running;
}

/** Убрать обработанные заявки из списка */
export async function hideHandled(db: Db, ids: number[]) {
  await hideRequests(db, ids);
  set({ requests: state.requests.filter((r) => r.status === 'new' || !ids.includes(r.id)) });
}

/** После «принять» / «отклонить» — сразу убрать заявку из новых, не дожидаясь обмена */
export function markRequest(id: number, status: CloudRequest['status']) {
  const requests = state.requests.map((r) => (r.id === id ? { ...r, status } : r));
  set({ requests, newCount: requests.filter((r) => r.status === 'new').length });
}
