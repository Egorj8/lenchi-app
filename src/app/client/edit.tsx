import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Button, Field, success } from '@/components/ui';
import { deleteClient, getClient, saveClient } from '@/db/queries';
import { colors, space } from '@/theme';
import { todayKey } from '@/utils/date';

export default function ClientEdit() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : undefined;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editId) return;
    getClient(db, editId, todayKey()).then((c) => {
      if (!c) return;
      setName(c.name);
      setPhone(c.phone);
      setTelegram(c.telegram);
      setNotes(c.notes);
    });
  }, [db, editId]);

  const save = async () => {
    if (!name.trim()) return Alert.alert('Введите имя');
    setSaving(true);
    try {
      const newId = await saveClient(db, { id: editId, name, phone, telegram, notes });
      success();
      if (editId) router.back();
      else router.replace(`/client/${newId}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert('Удалить клиентку?', 'Её записи останутся в календаре, но без имени.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await deleteClient(db, editId!);
          router.dismissAll();
          router.navigate('/clients');
        },
      },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editId ? 'Изменить клиентку' : 'Новая клиентка' }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <Field label="Имя" value={name} onChangeText={setName} placeholder="Имя и фамилия" autoFocus={!editId} />
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
        <Field label="Заметки" value={notes} onChangeText={setNotes} placeholder="Форма ногтей, любимые оттенки, аллергия…" multiline />
        <Button title="Сохранить" icon="checkmark" onPress={save} loading={saving} />
        {editId ? <Button title="Удалить клиентку" icon="trash-outline" variant="danger" onPress={remove} style={{ marginTop: space.md }} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
