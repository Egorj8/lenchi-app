// Приведение телефонов к международному формату (+код страны),
// иначе ссылки WhatsApp и Telegram открывают не тот номер.

export const COUNTRIES = [
  { code: '90', label: 'Турция +90' },
  { code: '7', label: 'Россия, Казахстан +7' },
  { code: '380', label: 'Украина +380' },
  { code: '375', label: 'Беларусь +375' },
] as const;

/**
 * '0532 123 45 67' → '+905321234567' (Турция)
 * '8 999 123-45-67' → '+79991234567' (Россия)
 * '00 90 532…'      → '+90532…'
 * Если формат не распознан, возвращаем исходную строку без изменений.
 */
export function normalizePhone(raw: string, defaultCountry = '90'): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  let d = trimmed.replace(/\D/g, '');
  if (!d) return trimmed;

  if (trimmed.startsWith('+')) return `+${d}`;
  if (d.startsWith('00')) return `+${d.slice(2)}`;

  // Россия / Казахстан: 8XXXXXXXXXX или 7XXXXXXXXXX
  if (d.length === 11 && (d.startsWith('8') || d.startsWith('7')) && defaultCountry === '7') return `+7${d.slice(1)}`;
  if (d.length === 11 && d.startsWith('7')) return `+${d}`;
  if (d.length === 11 && d.startsWith('8') && d[1] === '9') return `+7${d.slice(1)}`;

  // Турция: 05XXXXXXXXX или 5XXXXXXXXX
  if (d.length === 11 && d.startsWith('0') && defaultCountry === '90') return `+90${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('5') && defaultCountry === '90') return `+90${d}`;
  if (d.length === 12 && d.startsWith('90')) return `+${d}`;

  // Общий случай: ведущий 0 = национальный префикс
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length >= 9 && d.length <= 10) return `+${defaultCountry}${d}`;
  if (d.length > 10) return `+${d}`;
  return trimmed;
}

/** '+905321234567' → '+90 532 123 45 67' для показа */
export function formatPhone(phone: string): string {
  const m = /^\+(\d+)$/.exec(phone);
  if (!m) return phone;
  const d = m[1];
  if (d.startsWith('90') && d.length === 12) return `+90 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  if (d.startsWith('7') && d.length === 11) return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  if (d.startsWith('380') && d.length === 12) return `+380 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  if (d.startsWith('375') && d.length === 12) return `+375 ${d.slice(3, 5)} ${d.slice(5, 8)}-${d.slice(8, 10)}-${d.slice(10)}`;
  return phone;
}

/** Только цифры международного номера — для сравнения и ссылок wa.me */
export function phoneKey(phone: string, defaultCountry = '90'): string {
  return normalizePhone(phone, defaultCountry).replace(/\D/g, '');
}
