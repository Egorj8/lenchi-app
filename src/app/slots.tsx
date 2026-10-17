import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chip, SectionTitle, success } from '@/components/ui';
import { getSettings, listAppointmentsBetween, type Appointment, type Settings } from '@/db/queries';
import { colors, radius, space } from '@/theme';
import { addDays, fmtDayLong, fmtTime, todayKey } from '@/utils/date';
import { computeFreeSlots, slotsPost, type DaySlots } from '@/utils/messages';

const PERIODS = [7, 14, 21];

export default function SlotsScreen() {
  const db = useSQLiteContext();
  const [days, setDays] = useState(14);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [appts, setAppts] = useState<Appointment[]>([]);
  // время, которое мастер решил не публиковать: "дата|минуты"
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const t = todayKey();
    const [s, a] = await Promise.all([getSettings(db), listAppointmentsBetween(db, t, addDays(t, 30))]);
    setSettings(s);
    setAppts(a);
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const slots = useMemo(() => (settings ? computeFreeSlots(settings, appts, todayKey(), days) : []), [settings, appts, days]);
  const visible: DaySlots[] = useMemo(
    () => slots.map((d) => ({ date: d.date, times: d.times.filter((t) => !hidden.has(`${d.date}|${t}`)) })).filter((d) => d.times.length),
    [slots, hidden],
  );
  const text = settings ? slotsPost(settings, visible) : '';

  const toggle = (key: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const copy = async () => {
    await Clipboard.setStringAsync(text);
    success();
    Alert.alert('Скопировано', 'Откройте канал в Telegram и вставьте пост.');
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.content}>
      <Text style={s.lead}>
        Свободное время считается по рабочим дням и часам из настроек, с учётом уже созданных записей. Нажмите на время, чтобы убрать его из поста.
      </Text>

      <View style={s.row}>
        {PERIODS.map((p) => (
          <Chip key={p} label={`${p} дней`} selected={days === p} onPress={() => setDays(p)} />
        ))}
      </View>

      {slots.length === 0 ? (
        <Card><Text style={s.muted}>Свободного времени не нашлось. Проверьте рабочие дни и часы в настройках.</Text></Card>
      ) : (
        slots.map((d) => (
          <View key={d.date} style={s.day}>
            <Text style={s.dayTitle}>{fmtDayLong(d.date)}</Text>
            <View style={s.times}>
              {d.times.map((t) => {
                const key = `${d.date}|${t}`;
                return <Chip key={key} label={fmtTime(t)} selected={!hidden.has(key)} onPress={() => toggle(key)} />;
              })}
            </View>
          </View>
        ))
      )}

      <SectionTitle>Готовый пост</SectionTitle>
      <View style={s.preview}>
        <Text style={s.previewText} selectable>{text}</Text>
      </View>

      <Button title="Скопировать пост" icon="copy-outline" onPress={copy} disabled={!visible.length} pulse />
      <Button
        title="Поделиться"
        icon="share-social-outline"
        variant="secondary"
        onPress={() => Share.share({ message: text })}
        disabled={!visible.length}
        style={{ marginTop: space.md }}
      />
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.sm },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: space.lg },
  muted: { color: colors.muted, fontSize: 14 },
  row: { flexDirection: 'row', gap: 8, marginBottom: space.lg },
  day: { marginBottom: space.lg },
  dayTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8, textTransform: 'capitalize' },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preview: {
    padding: space.lg, borderRadius: radius.lg, marginBottom: space.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  previewText: { color: colors.text, fontSize: 14, lineHeight: 21 },
});
