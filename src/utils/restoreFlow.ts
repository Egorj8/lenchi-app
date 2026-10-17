import { success } from '@/components/ui';
import { parseBackup, restoreAll, summarize } from '@/db/backup';
import type { Db } from '@/db/types';
import { plural } from './date';
import { writeBackup } from './backupFiles';
import { showAlert } from './dialog';
import { emitDataChanged } from './events';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function fmtDateTime(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Проверить копию, показать, что в ней, и после подтверждения заменить данные */
export function confirmAndRestore(db: Db, text: string, onDone?: () => void) {
  let data;
  try {
    data = parseBackup(text);
  } catch (e) {
    showAlert('Не получилось', e instanceof Error ? e.message : String(e));
    return;
  }
  const s = summarize(data);
  const when = s.exportedAt ? `Копия от ${fmtDateTime(s.exportedAt)}.` : 'Дата копии неизвестна.';
  showAlert(
    'Восстановить из копии?',
    `${when}\nВ ней ${s.clients} ${plural(s.clients, 'клиентка', 'клиентки', 'клиенток')}, ` +
      `${s.appointments} ${plural(s.appointments, 'запись', 'записи', 'записей')}, ` +
      `${s.services} ${plural(s.services, 'услуга', 'услуги', 'услуг')}.\n\n` +
      'Текущие данные будут заменены. Перед этим приложение сохранит их копию на телефоне — её можно будет вернуть.',
    [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Восстановить',
        style: 'destructive',
        onPress: async () => {
          try {
            await writeBackup(db, 'before-restore');
            await restoreAll(db, data);
            emitDataChanged();
            success();
            showAlert('Готово', 'Данные восстановлены из копии.', [{ text: 'OK', onPress: onDone }]);
          } catch (e) {
            showAlert('Ошибка восстановления', `${e instanceof Error ? e.message : String(e)}\n\nТекущие данные не изменены.`);
          }
        },
      },
    ],
  );
}
