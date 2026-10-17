// Простое оповещение «данные изменились» — чтобы открытые экраны обновились,
// например после «Вернуть» во всплывающем сообщении или восстановления копии.
import { useEffect } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();

export function emitDataChanged() {
  for (const l of listeners) l();
}

export function useDataChanged(callback: Listener) {
  useEffect(() => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, [callback]);
}
