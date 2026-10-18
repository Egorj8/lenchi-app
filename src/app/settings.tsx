import { router, useFocusEffect } from 'expo-router';
import { useDb } from '@/db/provider';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Chip, Field, SectionTitle, success } from '@/components/ui';
import { getSettings, saveSettings, type Settings } from '@/db/queries';
import { DEFAULT_SETTINGS } from '@/db/schema';
import { colors, space } from '@/theme';
import { parseTime } from '@/utils/date';
import { COUNTRIES } from '@/utils/phone';
import { emitDataChanged } from '@/utils/events';
import { requestNotifyPermission } from '@/utils/notify';
import { showAlert } from '@/utils/dialog';

const WEEK = [
  [1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс'],
] as const;
const CURRENCIES = ['₺', '₽', '$', '€'];

export default function SettingsScreen() {
  const db = useDb();
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
    if (ws === null || we === null || we <= ws) return showAlert('Проверьте рабочие часы', 'Формат ЧЧ:ММ, конец позже начала.');
    if (!Number(s.slot_length)) return showAlert('Укажите длину окошка в минутах');
    await saveSettings(db, s);
    emitDataChanged(); // пересоберёт утреннюю сводку с новым временем
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

        <Text style={st.label}>Код страны для номеров без «+»</Text>
        <View style={st.row}>
          {COUNTRIES.map((c) => <Chip key={c.code} label={c.label} selected={s.default_country === c.code} onPress={() => set('default_country')(c.code)} />)}
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

        <SectionTitle>Подсказки и уведомления</SectionTitle>
        <View style={st.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.switchLabel}>Утренняя сводка</Text>
            <Text style={st.hint}>Записи на день, кому не отправлено напоминание, дни рождения.</Text>
          </View>
          <Switch
            value={s.notify_morning === '1'}
            onValueChange={async (v) => {
              if (v && !(await requestNotifyPermission())) {
                showAlert('Уведомления выключены', 'Разрешите уведомления для Lenchi Studio в настройках телефона.', [
                  { text: 'Отмена', style: 'cancel' },
                  { text: 'Открыть настройки', onPress: () => Linking.openSettings() },
                ]);
                return;
              }
              set('notify_morning')(v ? '1' : '0');
            }}
            trackColor={{ true: colors.yellow3, false: colors.surface }}
            thumbColor={s.notify_morning === '1' ? colors.yellow : colors.muted}
          />
        </View>
        {s.notify_morning === '1' ? (
          <View style={st.row}>
            {['08:00', '09:00', '10:00'].map((t) => <Chip key={t} label={t} selected={s.morning_time === t} onPress={() => set('morning_time')(t)} />)}
          </View>
        ) : null}
        <Text style={st.label}>«Пора на коррекцию» — через сколько дней после визита</Text>
        <View style={st.row}>
          {['14', '21', '28', '35'].map((d) => <Chip key={d} label={`${d} дн.`} selected={s.rebook_days === d} onPress={() => set('rebook_days')(d)} />)}
        </View>

        <SectionTitle>Шаблоны сообщений</SectionTitle>
        <Field
          label="Напоминание клиентке"
          value={s.reminder_template}
          onChangeText={set('reminder_template')}
          multiline
          hint="Подстановки: {имя}, {дата}, {время}, {услуга}, {адрес}, {мастер}, {телефон}"
        />
        <Field
          label="Пора на коррекцию"
          value={s.rebook_template}
          onChangeText={set('rebook_template')}
          multiline
          hint="Подстановки: {имя}, {дней}, {окошки}, {мастер}"
        />
        <Field label="Поздравление с днём рождения" value={s.birthday_template} onChangeText={set('birthday_template')} multiline hint="Подстановки: {имя}, {мастер}" />
        <Field
          label="Освободилось время (лист ожидания)"
          value={s.waitlist_template}
          onChangeText={set('waitlist_template')}
          multiline
          hint="Подстановки: {имя}, {дата}, {время}, {мастер}"
        />
        <Field label="Начало поста «Свободные окошки»" value={s.slots_header} onChangeText={set('slots_header')} multiline hint="Можно использовать {телефон}" />
        <Field label="Конец поста" value={s.slots_footer} onChangeText={set('slots_footer')} multiline />
        <Button
          title="Вернуть шаблоны по умолчанию"
          variant="ghost"
          icon="refresh"
          onPress={() =>
            setS({
              ...s,
              reminder_template: DEFAULT_SETTINGS.reminder_template,
              slots_header: DEFAULT_SETTINGS.slots_header,
              slots_footer: DEFAULT_SETTINGS.slots_footer,
              rebook_template: DEFAULT_SETTINGS.rebook_template,
              birthday_template: DEFAULT_SETTINGS.birthday_template,
              waitlist_template: DEFAULT_SETTINGS.waitlist_template,
            })
          }
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
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  switchLabel: { color: colors.text, fontSize: 16, fontWeight: '600' },
  hint: { color: colors.dim, fontSize: 12, marginTop: 2, lineHeight: 17 },
});
