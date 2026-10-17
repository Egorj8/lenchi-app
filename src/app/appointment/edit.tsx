import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDb } from '@/db/provider';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Button, Chip, Field, SectionTitle, success, tap, styles as ui } from '@/components/ui';
import {
  findConflicts,
  getAppointment,
  getAppointmentServices,
  getSettings,
  listAppointmentsByDate,
  listClients,
  listServices,
  saveAppointment,
  saveClient,
  type Appointment,
  type ClientRow,
  type Service,
  type Settings,
} from '@/db/queries';
import { colors, radius, space } from '@/theme';
import { fmtDuration, fmtTime, fromKey, parseTime, range, todayKey, weekday, weekdayShort, fmtDayLong } from '@/utils/date';
import { money, workDays } from '@/utils/messages';
import { showAlert } from '@/utils/dialog';

const STEP = 15;

export default function AppointmentEdit() {
  const db = useDb();
  const params = useLocalSearchParams<{ id?: string; date?: string; start?: string; clientId?: string }>();
  const editId = params.id ? Number(params.id) : undefined;

  const [settings, setSettings] = useState<Settings | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [dayAppts, setDayAppts] = useState<Appointment[]>([]);

  const [clientId, setClientId] = useState<number | null>(params.clientId ? Number(params.clientId) : null);
  const [clientQuery, setClientQuery] = useState('');
  const [newClient, setNewClient] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const [picked, setPicked] = useState<number[]>([]);
  const [date, setDate] = useState(params.date ?? todayKey());
  const [start, setStart] = useState<number | null>(params.start ? Number(params.start) : null);
  const [durationOverride, setDurationOverride] = useState<string>('');
  const [priceOverride, setPriceOverride] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  // для старых записей, где услуга уже удалена из прайса
  const [legacyServices, setLegacyServices] = useState<{ service_id: number | null; name: string; price: number; duration: number }[]>([]);

  useEffect(() => {
    (async () => {
      const [s, sv, cl] = await Promise.all([getSettings(db), listServices(db, true), listClients(db, todayKey())]);
      setSettings(s);
      setServices(sv);
      setClients(cl);
      if (editId) {
        const a = await getAppointment(db, editId);
        if (a) {
          const as = await getAppointmentServices(db, editId);
          setClientId(a.client_id);
          setDate(a.date);
          setStart(a.start);
          setNotes(a.notes);
          const ids = as.map((x) => x.service_id).filter((x): x is number => x !== null && sv.some((v) => v.id === x));
          setPicked(ids);
          setLegacyServices(as.filter((x) => x.service_id === null || !sv.some((v) => v.id === x.service_id)));
          const sumDur = as.reduce((t, x) => t + x.duration, 0);
          const sumPrice = as.reduce((t, x) => t + x.price, 0);
          if (sumDur !== a.duration) setDurationOverride(String(a.duration));
          if (sumPrice !== a.price) setPriceOverride(String(a.price));
        }
      }
    })();
  }, [db, editId]);

  useEffect(() => {
    listAppointmentsByDate(db, date).then(setDayAppts);
  }, [db, date]);

  const activeServices = services.filter((s) => !s.archived || picked.includes(s.id));
  const chosen = useMemo(
    () => [
      ...legacyServices,
      ...picked.map((id) => services.find((s) => s.id === id)).filter((s): s is Service => !!s)
        .map((s) => ({ service_id: s.id, name: s.name, price: s.price, duration: s.duration })),
    ],
    [picked, services, legacyServices],
  );
  const autoDuration = chosen.reduce((t, s) => t + s.duration, 0) || 60;
  const autoPrice = chosen.reduce((t, s) => t + s.price, 0);
  const duration = Number(durationOverride) || autoDuration;
  const price = priceOverride !== '' ? Number(priceOverride.replace(',', '.')) || 0 : autoPrice;
  const cur = settings?.currency ?? '₺';

  const dates = useMemo(() => range(todayKey() < date ? todayKey() : date, 60), [date]);

  // Сетка времени: шаг 15 минут в рабочие часы, занятые слоты отмечены
  const timeGrid = useMemo(() => {
    if (!settings) return [];
    const ws = parseTime(settings.work_start) ?? 600;
    const we = parseTime(settings.work_end) ?? 1140;
    const busy = dayAppts.filter((a) => a.status !== 'cancelled' && a.id !== editId);
    const out: { t: number; free: boolean }[] = [];
    for (let t = ws; t + STEP <= we; t += STEP) {
      const free = !busy.some((a) => a.start < t + duration && a.start + a.duration > t);
      out.push({ t, free });
    }
    if (start !== null && !out.some((x) => x.t === start)) out.push({ t: start, free: true });
    return out.sort((a, b) => a.t - b.t);
  }, [settings, dayAppts, duration, editId, start]);

  const filteredClients = clients.filter((c) => {
    const q = clientQuery.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.telegram.toLowerCase().includes(q);
  });
  const selectedClient = clients.find((c) => c.id === clientId);

  const toggleService = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function save(force = false) {
    if (start === null) return showAlert('Выберите время', 'Нажмите на свободное время в списке.');
    if (newClient && !newName.trim()) return showAlert('Имя клиентки', 'Введите имя или выберите клиентку из списка.');
    if (!force) {
      const conflicts = await findConflicts(db, date, start, duration, editId);
      if (conflicts.length) {
        const c = conflicts[0];
        return showAlert(
          'Время занято',
          `Пересекается с записью ${fmtTime(c.start)}–${fmtTime(c.start + c.duration)}${c.client_name ? ` (${c.client_name})` : ''}.`,
          [
            { text: 'Изменить время', style: 'cancel' },
            { text: 'Всё равно сохранить', style: 'destructive', onPress: () => save(true) },
          ],
        );
      }
    }
    setSaving(true);
    try {
      let cid = clientId;
      if (newClient) cid = await saveClient(db, { name: newName, phone: newPhone, telegram: '', notes: '' });
      const id = await saveAppointment(db, { id: editId, client_id: cid, date, start, duration, price, notes, services: chosen });
      success();
      if (editId) router.back();
      else router.replace(`/appointment/${id}`);
    } finally {
      setSaving(false);
    }
  }

  const isWork = settings ? workDays(settings).includes(weekday(date)) : true;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editId ? 'Изменить запись' : 'Новая запись' }} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Клиент */}
        <SectionTitle
          right={
            <Pressable onPress={() => { tap(); setNewClient((v) => !v); setClientId(null); }}>
              <Text style={s.link}>{newClient ? 'Выбрать из списка' : '+ Новая клиентка'}</Text>
            </Pressable>
          }
        >
          Клиентка
        </SectionTitle>

        {newClient ? (
          <View>
            <Field label="Имя" value={newName} onChangeText={setNewName} placeholder="Например, Анна" autoFocus />
            <Field label="Телефон" value={newPhone} onChangeText={setNewPhone} placeholder="+90 5xx xxx xx xx" keyboardType="phone-pad" />
          </View>
        ) : selectedClient ? (
          <Pressable onPress={() => { tap(); setClientId(null); }} style={[s.clientPicked]}>
            <Avatar name={selectedClient.name} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={s.clientName}>{selectedClient.name}</Text>
              {selectedClient.phone ? <Text style={s.clientSub}>{selectedClient.phone}</Text> : null}
            </View>
            <Ionicons name="close-circle" size={22} color={colors.dim} />
          </Pressable>
        ) : (
          <View>
            <View style={s.search}>
              <Ionicons name="search" size={18} color={colors.dim} />
              <TextInput
                value={clientQuery}
                onChangeText={setClientQuery}
                placeholder="Поиск по имени или телефону"
                placeholderTextColor={colors.dim}
                selectionColor={colors.yellow}
                style={s.searchInput}
              />
            </View>
            {filteredClients.length === 0 ? (
              <Text style={s.muted}>
                {clients.length ? 'Никого не нашли.' : 'Клиентов пока нет.'} Нажмите «+ Новая клиентка».
              </Text>
            ) : (
              filteredClients.slice(0, 6).map((c) => (
                <Pressable key={c.id} onPress={() => { tap(); setClientId(c.id); }} style={({ pressed }) => [s.clientRow, pressed && { opacity: 0.6 }]}>
                  <Avatar name={c.name} size={36} />
                  <Text style={[s.clientName, { flex: 1 }]}>{c.name}</Text>
                  <Text style={s.clientSub}>{c.phone}</Text>
                </Pressable>
              ))
            )}
          </View>
        )}

        {/* Услуги */}
        <SectionTitle>Услуги</SectionTitle>
        <View style={s.services}>
          {activeServices.map((sv) => {
            const on = picked.includes(sv.id);
            return (
              <Pressable
                key={sv.id}
                onPress={() => { tap(); toggleService(sv.id); }}
                style={({ pressed }) => [s.service, on && s.serviceOn, pressed && { opacity: 0.7 }]}
              >
                <View style={[s.check, on && s.checkOn]}>{on ? <Ionicons name="checkmark" size={16} color={colors.ink} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text style={s.serviceName}>{sv.name}</Text>
                  {sv.description ? <Text style={s.serviceDesc} numberOfLines={1}>{sv.description}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.servicePrice}>{money(sv.price, cur)}</Text>
                  <Text style={s.serviceDesc}>{fmtDuration(sv.duration)}</Text>
                </View>
              </Pressable>
            );
          })}
          {legacyServices.map((l, i) => (
            <View key={`l${i}`} style={[s.service, s.serviceOn]}>
              <Text style={[s.serviceName, { flex: 1 }]}>{l.name}</Text>
              <Text style={s.servicePrice}>{money(l.price, cur)}</Text>
            </View>
          ))}
        </View>

        {/* Дата */}
        <SectionTitle>Дата</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {dates.map((d) => {
            const on = d === date;
            const work = settings ? workDays(settings).includes(weekday(d)) : true;
            return (
              <Pressable
                key={d}
                onPress={() => { tap(); setDate(d); setStart(null); }}
                style={[s.day, on && s.dayOn, !work && !on && { opacity: 0.45 }]}
              >
                <Text style={[s.dayWd, on && { color: colors.ink }]}>{weekdayShort(d)}</Text>
                <Text style={[s.dayNum, on && { color: colors.ink }]}>{fromKey(d).getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={[s.muted, { marginTop: 8 }]}>
          {fmtDayLong(date)}{isWork ? '' : ' · выходной по настройкам'}
        </Text>

        {/* Время */}
        <SectionTitle>Время · {fmtDuration(duration)}</SectionTitle>
        <View style={s.times}>
          {timeGrid.map(({ t, free }) => (
            <Chip key={t} label={fmtTime(t)} selected={start === t} disabled={!free && start !== t} onPress={() => setStart(t)} />
          ))}
        </View>
        {start !== null ? (
          <Text style={[s.muted, { marginTop: 10 }]}>
            {fmtTime(start)} – {fmtTime(start + duration)}
          </Text>
        ) : null}

        {/* Детали */}
        <SectionTitle>Детали</SectionTitle>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label={`Цена, ${cur}`} value={priceOverride} onChangeText={setPriceOverride} placeholder={String(autoPrice)} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Длительность, мин" value={durationOverride} onChangeText={setDurationOverride} placeholder={String(autoDuration)} keyboardType="number-pad" />
          </View>
        </View>
        <Field label="Заметка" value={notes} onChangeText={setNotes} placeholder="Дизайн, пожелания, аллергия…" multiline />

        <View style={s.total}>
          <Text style={s.totalLabel}>Итого</Text>
          <Text style={s.totalValue}>{money(price, cur)}</Text>
        </View>

        <Button title={editId ? 'Сохранить' : 'Записать'} icon="checkmark" onPress={() => save()} loading={saving} />
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingTop: 0 },
  link: { color: colors.yellow, fontWeight: '700', fontSize: 14 },
  muted: { color: colors.muted, fontSize: 14 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 48, marginBottom: 8,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  clientPicked: {
    ...ui.card, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderColor: 'rgba(255,198,26,0.45)',
  },
  clientName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  clientSub: { color: colors.muted, fontSize: 13 },
  services: { gap: 8 },
  service: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  serviceOn: { borderColor: colors.yellow, backgroundColor: 'rgba(255,198,26,0.08)' },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: colors.dim, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  serviceName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  serviceDesc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  servicePrice: { color: colors.yellow1, fontSize: 15, fontWeight: '700' },
  day: {
    width: 52, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  dayOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  dayWd: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  dayNum: { color: colors.text, fontSize: 19, fontWeight: '800' },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  total: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: space.lg, marginBottom: space.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  totalLabel: { color: colors.muted, fontSize: 16 },
  totalValue: { color: colors.yellow1, fontSize: 26, fontWeight: '800' },
});
