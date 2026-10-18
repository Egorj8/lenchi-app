import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Button, Chip, Field, SectionTitle, success, tap } from '@/components/ui';
import { useDb } from '@/db/provider';
import { closeWaitEntry, getWaitEntry, listClients, saveWaitEntry, type ClientRow } from '@/db/queries';
import { colors, radius, space } from '@/theme';
import { DAY_PARTS, type DayPart } from '@/utils/attention';
import { addDays, fmtDayLong, todayKey } from '@/utils/date';
import { showAlert } from '@/utils/dialog';
import { emitDataChanged } from '@/utils/events';
import { formatPhone } from '@/utils/phone';

const WEEK = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс']] as const;
const UNTIL = [
  { label: 'Без срока', days: 0 },
  { label: '2 недели', days: 14 },
  { label: 'Месяц', days: 30 },
];

export default function WaitlistEdit() {
  const db = useDb();
  const { id, clientId } = useLocalSearchParams<{ id?: string; clientId?: string }>();
  const editId = id ? Number(id) : undefined;
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [client, setClient] = useState<number | null>(clientId ? Number(clientId) : null);
  const [query, setQuery] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [part, setPart] = useState<DayPart>('any');
  const [note, setNote] = useState('');
  const [until, setUntil] = useState<string | null>(null);

  useEffect(() => {
    listClients(db, todayKey()).then(setClients);
    if (!editId) return;
    getWaitEntry(db, editId).then((w) => {
      if (!w) return;
      setClient(w.client_id);
      setDays(w.days.split(',').filter(Boolean).map(Number));
      setPart(w.part);
      setNote(w.note);
      setUntil(w.until);
    });
  }, [db, editId]);

  const picked = clients.find((c) => c.id === client);
  const q = query.trim().toLowerCase();
  const found = clients.filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 6);

  const save = async () => {
    if (!client) return showAlert('Выберите клиентку');
    await saveWaitEntry(db, { id: editId, client_id: client, days: days.join(','), part, note: note.trim(), until });
    success();
    emitDataChanged();
    router.back();
  };

  const remove = async () => {
    await closeWaitEntry(db, editId!);
    emitDataChanged();
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editId ? 'Пожелания клиентки' : 'В лист ожидания' }} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <SectionTitle>Клиентка</SectionTitle>
        {picked ? (
          <Pressable onPress={() => { tap(); setClient(null); }} style={s.picked}>
            <Avatar name={picked.name} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{picked.name}</Text>
              {picked.phone ? <Text style={s.sub}>{formatPhone(picked.phone)}</Text> : null}
            </View>
            <Ionicons name="close-circle" size={22} color={colors.dim} />
          </Pressable>
        ) : (
          <>
            <View style={s.search}>
              <Ionicons name="search" size={18} color={colors.dim} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Поиск по имени или телефону"
                placeholderTextColor={colors.dim}
                selectionColor={colors.yellow}
                style={s.searchInput}
              />
            </View>
            {found.map((c) => (
              <Pressable key={c.id} onPress={() => { tap(); setClient(c.id); }} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
                <Avatar name={c.name} size={34} />
                <Text style={[s.name, { flex: 1 }]}>{c.name}</Text>
              </Pressable>
            ))}
            {!clients.length ? <Text style={s.sub}>Сначала добавьте клиентку во вкладке «Клиенты».</Text> : null}
          </>
        )}

        <SectionTitle>Удобные дни</SectionTitle>
        <View style={s.chips}>
          {WEEK.map(([d, l]) => (
            <Chip key={d} label={l} selected={days.includes(d)} onPress={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))} />
          ))}
        </View>
        <Text style={s.hint}>{days.length ? '' : 'Ничего не выбрано — подходит любой день.'}</Text>

        <SectionTitle>Время</SectionTitle>
        <View style={s.chips}>
          {DAY_PARTS.map((p) => <Chip key={p.key} label={p.label} selected={part === p.key} onPress={() => setPart(p.key)} />)}
        </View>

        <SectionTitle>Сколько ждёт</SectionTitle>
        <View style={s.chips}>
          {UNTIL.map((u) => {
            const val = u.days ? addDays(todayKey(), u.days) : null;
            const on = u.days ? until !== null && Math.abs(new Date(until).getTime() - new Date(val!).getTime()) < 86_400_000 : until === null;
            return <Chip key={u.label} label={u.label} selected={on} onPress={() => setUntil(val)} />;
          })}
        </View>
        {until ? <Text style={s.hint}>Уберётся из листа после {fmtDayLong(until)}.</Text> : null}

        <View style={{ height: space.lg }} />
        <Field label="Заметка" value={note} onChangeText={setNote} placeholder="Что хочет: коррекция, френч, наращивание…" multiline />
        <Button title="Сохранить" icon="checkmark" onPress={save} />
        {editId ? <Button title="Убрать из листа" icon="checkmark-done" variant="secondary" onPress={remove} style={{ marginTop: space.md }} /> : null}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingTop: 0 },
  picked: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg,
    backgroundColor: colors.card, borderWidth: 1, borderColor: 'rgba(255,198,26,0.45)',
  },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 13 },
  hint: { color: colors.dim, fontSize: 12, marginTop: 6 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 48, marginBottom: 6,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
