// Тесты чистой логики: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../src/utils/phone.ts';
import { weekStart, monthGrid, addMonths, layoutLanes, visibleRange } from '../src/utils/calendar.ts';

test('телефоны приводятся к +код', () => {
  assert.equal(normalizePhone('0532 123 45 67', '90'), '+905321234567');
  assert.equal(normalizePhone('532 123 45 67', '90'), '+905321234567');
  assert.equal(normalizePhone('8 999 123-45-67', '90'), '+79991234567');
  assert.equal(normalizePhone('+7 (995) 100-05-16', '90'), '+79951000516');
  assert.equal(normalizePhone('0090 532 123 4567', '90'), '+905321234567');
  assert.equal(normalizePhone('999 123 45 67', '7'), '+79991234567');
  assert.equal(normalizePhone('', '90'), '');
});

test('неделя начинается с понедельника', () => {
  assert.equal(weekStart('2026-10-18'), '2026-10-12'); // воскресенье → пн 12-го
  assert.equal(weekStart('2026-10-12'), '2026-10-12');
  assert.equal(weekStart('2026-11-01'), '2026-10-26');
});

test('сетка месяца: 42 дня с понедельника', () => {
  const g = monthGrid('2026-10-18');
  assert.equal(g.length, 42);
  assert.equal(g[0], '2026-09-28');
  assert.ok(g.includes('2026-10-01') && g.includes('2026-10-31'));
});

test('addMonths не выходит за конец месяца', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
});

test('пересекающиеся записи делят ширину', () => {
  const l = layoutLanes([
    { id: 1, start: 600, duration: 120 }, // 10:00–12:00
    { id: 2, start: 660, duration: 60 },  // 11:00–12:00 пересекается с 1
    { id: 3, start: 720, duration: 60 },  // 12:00–13:00 отдельно
  ]);
  assert.deepEqual(l.get(1), { lane: 0, lanes: 2 });
  assert.deepEqual(l.get(2), { lane: 1, lanes: 2 });
  assert.deepEqual(l.get(3), { lane: 0, lanes: 1 });
});

test('освободившаяся колонка переиспользуется', () => {
  const l = layoutLanes([
    { id: 1, start: 600, duration: 180 }, // 10–13
    { id: 2, start: 600, duration: 60 },  // 10–11
    { id: 3, start: 660, duration: 60 },  // 11–12 встаёт на место 2
  ]);
  assert.equal(l.get(3)!.lane, 1);
  assert.equal(l.get(3)!.lanes, 2);
});

test('видимые часы: рабочее время ±1 ч и записи вне графика', () => {
  assert.deepEqual(visibleRange(660, 1140, []), [600, 1200]);
  assert.deepEqual(visibleRange(660, 1140, [{ id: 1, start: 1230, duration: 60 }]), [600, 1320]);
});
