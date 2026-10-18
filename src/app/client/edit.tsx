import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDb } from '@/db/provider';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Field, success } from '@/components/ui';
import { pickContact } from '@/utils/contacts';
import { formatPhone } from '@/utils/phone';
import { birthdayInput, parseBirthday } from '@/utils/attention';
import { emitDataChanged } from '@/utils/events';
import { deleteClient, getClient, getSettings, restoreClient, saveClient } from '@/db/queries';
import { colors, space } from '@/theme';
import { todayKey } from '@/utils/date';
import { showAlert } from '@/utils/dialog';

export default function ClientEdit() {
  const db = useDb();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : undefined;
  const [name, setName] = useState('');
  const [callAs, setCallAs] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [notes, setNotes] = useState('');
  const [birthday, setBirthday] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!editId) return;
    getClient(db, editId, todayKey()).then((c) => {
      if (!c) return;
      setName(c.name);
      setCallAs(c.call_name);
      setPhone(formatPhone(c.phone));
      setTelegram(c.telegram);
      setNotes(c.notes);
      setBirthday(birthdayInput(c.birthday));
    });
  }, [db, editId]);

  const save = async () => {
    if (!name.trim()) return showAlert('Введите имя');
    setSaving(true);
    try {
      const bd = parseBirthday(birthday);
      if (bd === undefined) {
        setSaving(false);
        return showAlert('День рождения', 'Напишите дату как 12.03 или 12.03.1990.');
      }
      const newId = await saveClient(db, { id: editId, name, call_name: callAs, phone, telegram, notes, birthday: bd });
      success();
      if (editId) router.back();
      else router.replace(`/client/${newId}`);
    } finally {
      setSaving(false);
    }
  };

  const fromContacts = async () => {
    const s = await getSettings(db);
    const c = await pickContact(s.default_country);
    if (!c) return;
    if (c.name) setName(c.name);
    if (c.phones[0]) setPhone(formatPhone(c.phones[0]));
  };

  const remove = async () => {
    const id = editId!;
    await deleteClient(db, id);
    router.dismissAll();
    router.navigate('/clients');
    toast({
      message: `${name.trim() || 'Клиентка'} — в корзине`,
      icon: 'trash-outline',
      action: { label: 'Вернуть', onPress: () => restoreClient(db, id).then(emitDataChanged) },
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editId ? 'Изменить клиентку' : 'Новая клиентка' }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <Button title="Выбрать из контактов" icon="people-outline" variant="secondary" onPress={fromContacts} style={{ marginBottom: space.lg }} />
        <Field label="Имя" value={name} onChangeText={setName} placeholder="Имя и фамилия" autoFocus={!editId} />
        <Field
          label="Обращение в сообщениях"
          value={callAs}
          onChangeText={setCallAs}
          placeholder={name.trim().split(/\s+/)[0] || 'Катя'}
          hint="Как писать в напоминаниях: «Здравствуйте, Катя!». Пусто — первое слово имени."
        />
        <Field
          label="Телефон"
          value={phone}
          onChangeText={setPhone}
          placeholder="+90 5xx xxx xx xx"
          keyboardType="phone-pad"
          hint="С кодом страны — нужен для WhatsApp и звонков."
        />
        <Field
          label="Telegram"
          value={telegram}
          onChangeText={setTelegram}
          placeholder="@username"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field
          label="День рождения"
          value={birthday}
          onChangeText={setBirthday}
          placeholder="12.03 или 12.03.1990"
          keyboardType="numbers-and-punctuation"
          hint="Утром в этот день придёт напоминание и готовое поздравление."
        />
        <Field label="Заметки" value={notes} onChangeText={setNotes} placeholder="Форма ногтей, любимые оттенки, аллергия…" multiline />
        <Button title="Сохранить" icon="checkmark" onPress={save} loading={saving} />
        {editId ? <Button title="Удалить клиентку" icon="trash-outline" variant="danger" onPress={remove} style={{ marginTop: space.md }} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
