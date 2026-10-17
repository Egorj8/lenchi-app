import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Chip, Field, SectionTitle, success } from '@/components/ui';
import { getSettings, saveSettings, type Settings } from '@/db/queries';
import { DEFAULT_SETTINGS } from '@/db/schema';
import { colors, space } from '@/theme';
import { parseTime } from '@/utils/date';

const WEEK = [
  [1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс'],
] as const;
const CURRENCIES = ['₺', '₽', '$', '€'];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [s, setS] = useState<Settings | null>(null);

  useFocusEffect(useCallback(() => { getSettings(db).then(setS); }, [db]));

  if (!s) return null;
  const set = (k: string) => (v: string) => setS({ ...s, [k]: v });
  const days = s.work_days.split(',').filter(Boolean).map(Number);
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    setS({ ...s, work_days: next.sort().join(',') });
  };

  const save = async () => {
    const ws = parseTime(s.work_start);
    const we = parseTime(s.work_end);
    if (ws === null || we === null || we <= ws) return Alert.alert('Проверьте рабочие часы', 'Формат ЧЧ:ММ, конец позже начала.');
    if (!Number(s.slot_length)) return Alert.alert('Укажите длину окошка в минутах');
    await saveSettings(db, s);
    success();
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <SectionTitle>Мастер</SectionTitle>
        <Field label="Название студии" value={s.studio_name} onChangeText={set('studio_name')} />
        <Field label="Ваше имя (подпись в сообщениях)" value={s.master_name} onChangeText={set('master_name')} />
        <Field label="Телефон" value={s.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <Field label="Адрес" value={s.address} onChangeText={set('address')} multiline />

        <Text style={st.label}>Валюта</Text>
        <View style={st.row}>
          {CURRENCIES.map((c) => <Chip key={c} label={c} selected={s.currency === c} onPress={() => set('currency')(c)} />)}
        </View>

        <SectionTitle>График</SectionTitle>
        <Text style={st.label}>Рабочие дни</Text>
        <View style={st.row}>
          {WEEK.map(([d, l]) => <Chip key={d} label={l} selected={days.includes(d)} onPress={() => toggleDay(d)} />)}
        </View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}><Field label="Начало" value={s.work_start} onChangeText={set('work_start')} placeholder="11:00" /></View>
          <View style={{ flex: 1 }}><Field label="Конец" value={s.work_end} onChangeText={set('work_end')} placeholder="19:00" /></View>
        </View>
        <Field
          label="Длина окошка для поста, мин"
          value={s.slot_length}
          onChangeText={set('slot_length')}
          keyboardType="number-pad"
          hint="Например, 120: в посте будут 11:00, 13:00, 15:00, 17:00."
        />

        <SectionTitle>Шаблоны сообщений</SectionTitle>
        <Field
          label="Напоминание клиентке"
          value={s.reminder_template}
          onChangeText={set('reminder_template')}
          multiline
          hint="Подстановки: {имя}, {дата}, {время}, {услуга}, {адрес}, {мастер}, {телефон}"
        />
        <Field label="Начало поста «Свободные окошки»" value={s.slots_header} onChangeText={set('slots_header')} multiline hint="Можно использовать {телефон}" />
        <Field label="Конец поста" value={s.slots_footer} onChangeText={set('slots_footer')} multiline />
        <Button
          title="Вернуть шаблоны по умолчанию"
          variant="ghost"
          icon="refresh"
          onPress={() => setS({ ...s, reminder_template: DEFAULT_SETTINGS.reminder_template, slots_header: DEFAULT_SETTINGS.slots_header, slots_footer: DEFAULT_SETTINGS.slots_footer })}
        />

        <Button title="Сохранить" icon="checkmark" onPress={save} style={{ marginTop: space.lg }} />
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  content: { padding: space.lg, paddingTop: 0 },
  label: { color: colors.muted, fontSize: 13, marginBottom: 8, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.lg },
});
