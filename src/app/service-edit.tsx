import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDb } from '@/db/provider';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, Chip, Field, SectionTitle, success } from '@/components/ui';
import { getService, getSettings, saveService } from '@/db/queries';
import { colors, space } from '@/theme';
import { showAlert } from '@/utils/dialog';

const DURATIONS = [30, 60, 70, 90, 120, 150, 180];

export default function ServiceEdit() {
  const db = useDb();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : undefined;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('60');
  const [price, setPrice] = useState('');
  const [archived, setArchived] = useState(0);
  const [cur, setCur] = useState('₺');

  useEffect(() => {
    getSettings(db).then((s) => setCur(s.currency));
    if (!editId) return;
    getService(db, editId).then((sv) => {
      if (!sv) return;
      setName(sv.name);
      setDescription(sv.description);
      setDuration(String(sv.duration));
      setPrice(String(sv.price));
      setArchived(sv.archived);
    });
  }, [db, editId]);

  const save = async (archivedValue = archived) => {
    const d = Number(duration);
    const p = Number(price.replace(',', '.'));
    if (!name.trim()) return showAlert('Введите название');
    if (!d || d < 5) return showAlert('Укажите длительность в минутах');
    if (Number.isNaN(p)) return showAlert('Укажите цену');
    await saveService(db, { id: editId, name: name.trim(), description: description.trim(), duration: d, price: p, archived: archivedValue });
    success();
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editId ? 'Изменить услугу' : 'Новая услуга' }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <Field label="Название" value={name} onChangeText={setName} placeholder="Например, Комплекс 1" />
        <Field label="Описание" value={description} onChangeText={setDescription} placeholder="Что входит в услугу" />
        <Field label={`Цена, ${cur}`} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="1200" />
        <Field label="Длительность, мин" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -6, marginBottom: space.lg }}>
          {DURATIONS.map((d) => (
            <Chip key={d} label={`${d}`} selected={Number(duration) === d} onPress={() => setDuration(String(d))} />
          ))}
        </View>
        <Button title="Сохранить" icon="checkmark" onPress={() => save()} />
        {editId ? (
          <>
            <SectionTitle>Видимость</SectionTitle>
            <Button
              title={archived ? 'Вернуть в прайс' : 'Скрыть из прайса'}
              icon={archived ? 'eye-outline' : 'eye-off-outline'}
              variant="secondary"
              onPress={() => save(archived ? 0 : 1)}
            />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
