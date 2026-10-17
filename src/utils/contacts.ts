import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { Linking, Platform } from 'react-native';
import { showAlert } from './dialog';
import { normalizePhone } from './phone';

export type PhoneContact = { id: string; name: string; phones: string[] };

const FIELDS = [ContactField.FULL_NAME, ContactField.PHONES] as const;

/** Запрос доступа к контактам. Если пользователь отказал навсегда — предлагаем открыть настройки. */
async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    showAlert('Недоступно', 'Контакты телефона доступны только в приложении для Android.');
    return false;
  }
  const res = await requestPermissionsAsync();
  if (res.granted) return true;
  showAlert(
    'Нет доступа к контактам',
    'Разрешите доступ в настройках телефона: Приложения → Lenchi Studio → Разрешения → Контакты.',
    res.canAskAgain
      ? [{ text: 'Понятно' }]
      : [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Открыть настройки', onPress: () => Linking.openSettings() },
        ],
  );
  return false;
}

function toPhoneContact(id: string, name: string | null | undefined, phones: { number?: string | null }[] | null | undefined, country: string): PhoneContact {
  const list = (phones ?? [])
    .map((p) => normalizePhone(p.number ?? '', country))
    .filter(Boolean);
  return { id, name: (name ?? '').trim(), phones: [...new Set(list)] };
}

/** Системный экран выбора контакта. null — если отменили. */
export async function pickContact(country: string): Promise<PhoneContact | null> {
  if (!(await ensurePermission())) return null;
  const contact = await Contact.presentPicker();
  if (!contact) return null;
  const d = await contact.getDetails(FIELDS);
  return toPhoneContact(contact.id, d.fullName, d.phones, country);
}

/** Все контакты с телефонами, по алфавиту */
export async function loadContacts(country: string): Promise<PhoneContact[] | null> {
  if (!(await ensurePermission())) return null;
  const all = await Contact.getAllDetails(FIELDS);
  return all
    .map((c) => toPhoneContact(c.id, c.fullName, c.phones, country))
    .filter((c) => c.name && c.phones.length)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
