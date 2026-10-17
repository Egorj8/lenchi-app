import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/Toast';
import { Button, Chip, Field, SectionTitle, success, tap, type IconName } from '@/components/ui';
import { useDb } from '@/db/provider';
import { deleteEvent, getEvent, restoreEvent, saveEvent, setEventDone } from '@/db/queries';
import { colors, radius, space } from '@/theme';
import { addDays, fmtDayLong, fmtDuration, fmtTime, fromKey, range, todayKey, weekdayShort } from '@/utils/date';
import { showAlert } from '@/utils/dialog';
import { emitDataChanged } from '@/utils/events';
import { CATEGORIES, category, QUICK, REPEATS, type CategoryKey, type Repeat } from '@/utils/personal';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00 … 23:00
const MINUTES = [0, 15, 30, 45];
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export default function EventEdit() {
  const db = useDb();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string; date?: string; start?: string; occurrence?: string }>();
  const editId = params.id ? Number(params.id) : undefined;

  const [title, setTitle] = useState('');
  const [cat, setCat] = useState<CategoryKey>('personal');
  const [date, setDate] = useState(params.date ?? todayKey());
  const [start, setStart] = useState(params.start ? Number(params.start) : 10 * 60);
  const [duration, setDuration] = useState(60);
  const [allDay, setAllDay] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [repeatUntil, setRepeatUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [done, setDone] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(false);
  const dirtyRef = useRef(false);
  const hoursRef = useRef<ScrollView>(null);
  const hoursScrolled = useRef(false);

  useEffect(() => {
    if (!editId) return;
    getEvent(db, editId).then((e) => {
      if (!e) return;
      setTitle(e.title);
      setCat(e.category as CategoryKey);
      setDate(e.date);
      setStart(e.start);
      setDuration(e.duration);
      setAllDay(!!e.all_day);
      setRepeat(e.repeat);
      setRepeatUntil(e.repeat_until);
      setBusy(!!e.busy);
      setDone(!!e.done);
      setNotes(e.notes);
    });
  }, [db, editId]);

  // новое дело: «Назад» с введённым названием спрашивает, а не теряет молча
  dirtyRef.current = !editId && !!title.trim();
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (savedRef.current || !dirtyRef.current) return;
        e.preventDefault();
        showAlert('Выйти без сохранения?', 'Дело не сохранится.', [
          { text: 'Остаться', style: 'cancel' },
          { text: 'Выйти', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation],
  );

  const dates = useMemo(() => {
    const first = todayKey() < date ? todayKey() : date;
    const span = Math.round((fromKey(date).getTime() - fromKey(first).getTime()) / 86_400_000);
    return range(first, Math.max(60, span + 14));
  }, [date]);

  const c = category(cat);
  const hour = Math.floor(start / 60);
  const minute = start % 60;

  const applyQuick = (q: (typeof QUICK)[number]) => {
    setTitle(q.title);
    setCat(q.category);
    setDuration(q.duration);
  };

  const toggleAllDay = (v: boolean) => {
    setAllDay(v);
    // дело на весь день обычно не мешает записям (день рождения, поездка) — по умолчанию не занимает время
    setBusy(!v);
  };

  const save = async () => {
    if (!title.trim()) return showAlert('Название', 'Напишите, что за дело: например, «Магазин» или «Пробежка».');
    setSaving(true);
    try {
      await saveEvent(db, {
        id: editId, title, category: cat, date, start: allDay ? 0 : start, duration: allDay ? 24 * 60 : duration,
        all_day: allDay ? 1 : 0, repeat, repeat_until: repeat === 'none' ? null : repeatUntil, busy: busy ? 1 : 0,
        done: done ? 1 : 0, notes,
      });
      success();
      savedRef.current = true;
      emitDataChanged();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const id = editId!;
    await deleteEvent(db, id);
    savedRef.current = true;
    router.back();
    emitDataChanged();
    toast({
      message: `«${title.trim()}» удалено`,
      icon: 'trash-outline',
      action: { label: 'Вернуть', onPress: () => restoreEvent(db, id).then(emitDataChanged) },
    });
  };

  // Повторяющееся дело: закончить серию начиная с выбранного дня
  const stopRepeat = () => {
    const occ = params.occurrence ?? todayKey();
    showAlert('Остановить повтор?', `Дело перестанет появляться начиная с ${fmtDayLong(occ)}. Прошлые дни останутся.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Остановить',
        onPress: async () => {
          if (occ <= date) return remove();
          setRepeatUntil(addDays(occ, -1));
          await saveEvent(db, {
            id: editId, title, category: cat, date, start, duration, all_day: allDay ? 1 : 0, repeat,
            repeat_until: addDays(occ, -1), busy: busy ? 1 : 0, notes,
          });
          savedRef.current = true;
          emitDataChanged();
          router.back();
        },
      },
    ]);
  };

  const toggleDone = async () => {
    const v = !done;
    setDone(v);
    if (editId) {
      await setEventDone(db, editId, v);
      emitDataChanged();
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editId ? 'Личное дело' : 'Новое дело' }} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Название */}
        <View style={[s.titleBox, { borderColor: c.color + '88' }]}>
          <View style={[s.titleIcon, { backgroundColor: c.color + '22' }]}>
            <Ionicons name={c.icon as IconName} size={22} color={c.color} />
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Что за дело?"
            placeholderTextColor={colors.dim}
            selectionColor={colors.yellow}
            style={s.titleInput}
            autoFocus={!editId}
          />
        </View>

        {!editId ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quick} keyboardShouldPersistTaps="handled">
            {QUICK.map((q) => (
              <Chip key={q.title} label={q.title} selected={title === q.title} onPress={() => applyQuick(q)} />
            ))}
          </ScrollView>
        ) : null}

        {/* Категория */}
        <SectionTitle>Категория</SectionTitle>
        <View style={s.cats}>
          {CATEGORIES.map((k) => {
            const on = k.key === cat;
            return (
              <Pressable
                key={k.key}
                onPress={() => { tap(); setCat(k.key); }}
                style={[s.cat, on && { borderColor: k.color, backgroundColor: k.color + '22' }]}
              >
                <Ionicons name={k.icon as IconName} size={18} color={on ? k.color : colors.muted} />
                <Text style={[s.catText, on && { color: colors.text }]}>{k.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Дата */}
        <SectionTitle>Дата</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {dates.map((d) => {
            const on = d === date;
            return (
              <Pressable key={d} onPress={() => { tap(); setDate(d); }} style={[s.day, on && s.dayOn]}>
                <Text style={[s.dayWd, on && s.ink]}>{weekdayShort(d)}</Text>
                <Text style={[s.dayNum, on && s.ink]}>{fromKey(d).getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={[s.muted, { marginTop: 8 }]}>{fmtDayLong(date)}</Text>

        {/* Время */}
        <View style={s.switchRow}>
          <Text style={s.switchLabel}>Весь день</Text>
          <Switch value={allDay} onValueChange={toggleAllDay} trackColor={{ true: colors.yellow3, false: colors.surface }} thumbColor={allDay ? colors.yellow : colors.muted} />
        </View>

        {!allDay ? (
          <>
            <SectionTitle>Начало · {fmtTime(start)}</SectionTitle>
            <ScrollView ref={hoursRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {HOURS.map((h) => (
                <View
                  key={h}
                  // запоминаем, где стоит выбранный час, чтобы ряд сам к нему прокрутился
                  onLayout={(ev) => {
                    if (h === hour && !hoursScrolled.current) {
                      hoursScrolled.current = true;
                      hoursRef.current?.scrollTo({ x: Math.max(0, ev.nativeEvent.layout.x - 80), animated: false });
                    }
                  }}
                >
                  <Chip label={String(h).padStart(2, '0')} selected={h === hour} onPress={() => setStart(h * 60 + minute)} />
                </View>
              ))}
            </ScrollView>
            <View style={[s.row, { marginTop: 8 }]}>
              {MINUTES.map((m) => (
                <Chip key={m} label={`:${String(m).padStart(2, '0')}`} selected={m === minute} onPress={() => setStart(hour * 60 + m)} />
              ))}
            </View>

            <SectionTitle>Длительность · {fmtDuration(duration)}</SectionTitle>
            <View style={s.row}>
              {DURATIONS.map((d) => (
                <Chip key={d} label={fmtDuration(d)} selected={d === duration} onPress={() => setDuration(d)} />
              ))}
            </View>
          </>
        ) : null}

        {/* Повтор */}
        <SectionTitle>Повтор</SectionTitle>
        <View style={s.row}>
          {REPEATS.map((r) => (
            <Chip key={r.key} label={r.label} selected={repeat === r.key} onPress={() => { setRepeat(r.key); setRepeatUntil(null); }} />
          ))}
        </View>
        {repeat !== 'none' && repeatUntil ? <Text style={[s.muted, { marginTop: 8 }]}>Повтор до {fmtDayLong(repeatUntil)}</Text> : null}

        {/* Занятость */}
        <View style={[s.switchRow, { marginTop: space.lg }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchLabel}>Занимает время</Text>
            <Text style={s.hint}>
              {busy ? 'В это время нельзя записать клиентку, и его нет в «Свободных окошках».' : 'Просто напоминание — запись на это время возможна.'}
            </Text>
          </View>
          <Switch value={busy} onValueChange={setBusy} trackColor={{ true: colors.yellow3, false: colors.surface }} thumbColor={busy ? colors.yellow : colors.muted} />
        </View>

        <Field label="Заметка" value={notes} onChangeText={setNotes} placeholder="Список покупок, адрес, что не забыть…" multiline />

        {editId ? (
          <View style={{ gap: space.md }}>
            {repeat === 'none' ? (
              <Button
                title={done ? 'Отметить как не сделанное' : 'Сделано'}
                icon={done ? 'refresh' : 'checkmark-circle'}
                variant="secondary"
                onPress={toggleDone}
              />
            ) : (
              <Button title="Остановить повтор с этого дня" icon="stop-circle-outline" variant="secondary" onPress={stopRepeat} />
            )}
            <Button title={repeat === 'none' ? 'Удалить дело' : 'Удалить всю серию'} icon="trash-outline" variant="danger" onPress={remove} />
          </View>
        ) : null}
        <View style={{ height: 24 }} />
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + space.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.footLabel}>{fmtDayLong(date)}</Text>
          <Text style={s.footValue} numberOfLines={1}>
            {allDay ? 'Весь день' : `${fmtTime(start)} – ${fmtTime(start + duration)}`}
          </Text>
        </View>
        <Button title="Сохранить" icon="checkmark" onPress={save} loading={saving} style={{ minWidth: 160 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.sm },
  ink: { color: colors.ink },
  muted: { color: colors.muted, fontSize: 14 },
  hint: { color: colors.dim, fontSize: 12, marginTop: 2, lineHeight: 17 },
  titleBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 60,
    borderRadius: radius.lg, borderWidth: 1.5, backgroundColor: colors.surface,
  },
  titleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  titleInput: { flex: 1, color: colors.text, fontSize: 19, fontWeight: '700' },
  quick: { gap: 8, paddingTop: space.md },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  catText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  day: {
    width: 52, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  dayOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  dayWd: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  dayNum: { color: colors.text, fontSize: 19, fontWeight: '800' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xl, marginBottom: space.sm },
  switchLabel: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md,
    backgroundColor: colors.bg2, borderTopWidth: 1, borderTopColor: colors.border,
  },
  footLabel: { color: colors.muted, fontSize: 13 },
  footValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
});
