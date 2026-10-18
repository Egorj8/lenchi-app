import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContactActions } from '@/components/ContactActions';
import { Badge, Button, Card, Empty, SectionTitle, success } from '@/components/ui';
import { useDb } from '@/db/provider';
import { getSettings, listAppointmentsBetween, listEventsBetween, type Appointment, type Settings } from '@/db/queries';
import { colors, radius, space } from '@/theme';
import { BOOKING_URL, outsideWorkHours, requestConflicts, type CloudRequest } from '@/utils/cloud';
import { markRequest, runCloudSync, useCloud } from '@/utils/cloudStore';
import { acceptRequest, cloudErrorText, declineRequest } from '@/utils/cloudSync';
import { addDays, fmtDayLong, fmtDuration, fmtTime, todayKey, weekday } from '@/utils/date';
import { showAlert } from '@/utils/dialog';
import { emitDataChanged } from '@/utils/events';
import { fill, money, openTelegram, openWhatsApp } from '@/utils/messages';
import { expandEvents, type EventOccurrence } from '@/utils/personal';
import { formatPhone, normalizePhone } from '@/utils/phone';

const STATUS: Record<CloudRequest['status'], { label: string; color: string }> = {
  new: { label: 'Новая', color: colors.yellow },
  accepted: { label: 'Принята', color: colors.success },
  declined: { label: 'Отклонена', color: colors.danger },
  cancelled: { label: 'Отменена', color: colors.dim },
};

const firstName = (name: string) => name.trim().split(' ')[0];
const servicesLabel = (r: CloudRequest) => r.services.map((x) => x.name).filter(Boolean).join(', ') || 'маникюр';

export default function RequestsScreen() {
  const db = useDb();
  const cloud = useCloud();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [events, setEvents] = useState<EventOccurrence[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  // календарь мастера — чтобы предупредить, если время заявки уже занято
  const load = useCallback(async () => {
    const t = todayKey();
    const to = addDays(t, 90);
    const [s, a, ev] = await Promise.all([getSettings(db), listAppointmentsBetween(db, t, to), listEventsBetween(db, t, to)]);
    setSettings(s);
    setAppts(a);
    setEvents(expandEvents(ev, t, to));
  }, [db]);

  useFocusEffect(useCallback(() => {
    load();
    runCloudSync(db);
  }, [db, load]));

  const fresh = cloud.requests.filter((r) => r.status === 'new').sort((a, b) => a.day.localeCompare(b.day) || a.start_min - b.start_min);
  const done = cloud.requests.filter((r) => r.status !== 'new');

  // сообщение клиентке: в тот мессенджер, который она выбрала на сайте
  const offerMessage = (r: CloudRequest, title: string, text: string) => {
    const name = firstName(r.name);
    const tg = { text: 'Telegram', onPress: () => openTelegram('', r.phone, text) };
    const wa = { text: 'WhatsApp', onPress: () => openWhatsApp(r.phone, text) };
    // последняя кнопка — главная (справа)
    showAlert(title, `Написать ${name}?\n\n${text}`, [{ text: 'Позже', style: 'cancel' }, ...(r.channel === 'tg' ? [wa, tg] : [tg, wa])]);
  };

  const vars = (r: CloudRequest, s: Settings) => ({
    имя: firstName(r.name),
    дата: fmtDayLong(r.day),
    время: fmtTime(r.start_min),
    услуга: servicesLabel(r),
    адрес: s.address,
    мастер: s.master_name,
    ссылка: BOOKING_URL,
  });

  const doAccept = async (r: CloudRequest) => {
    setBusyId(r.id);
    try {
      await acceptRequest(db, r);
      markRequest(r.id, 'accepted');
      success();
      emitDataChanged();
      load();
      const s = settings ?? (await getSettings(db));
      offerMessage(r, 'Запись создана ✓', fill(s.confirm_template, vars(r, s)));
    } catch (e) {
      showAlert('Не получилось принять', cloudErrorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const accept = (r: CloudRequest) => {
    const hits = requestConflicts(r, appts, events);
    const outside = settings ? outsideWorkHours(r, settings, weekday) : false;
    if (!hits.length && !outside) return doAccept(r);
    const why = [hits.length ? `В это время уже: ${hits.join(', ')}.` : '', outside ? 'Время вне рабочего графика.' : ''].filter(Boolean).join('\n');
    showAlert('Время занято', `${why}\n\nВсё равно принять?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Принять', onPress: () => doAccept(r) },
    ]);
  };

  const decline = (r: CloudRequest) =>
    showAlert('Отклонить заявку?', `${r.name}, ${fmtDayLong(r.day)} в ${fmtTime(r.start_min)}.\nВремя снова станет свободным на сайте.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отклонить',
        style: 'destructive',
        onPress: async () => {
          setBusyId(r.id);
          try {
            await declineRequest(db, r);
            markRequest(r.id, 'declined');
            emitDataChanged();
            const s = settings ?? (await getSettings(db));
            offerMessage(r, 'Заявка отклонена', fill(s.decline_template, vars(r, s)));
          } catch (e) {
            showAlert('Не получилось отклонить', cloudErrorText(e));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);

  // запись в календаре, созданная из заявки
  const openAppointment = async (r: CloudRequest) => {
    const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM live_appointments WHERE notes LIKE ? LIMIT 1', `%Заявка с сайта №${r.id}%`);
    if (row) router.push(`/appointment/${row.id}`);
    else showAlert('Запись не найдена', 'Возможно, её удалили из календаря.');
  };

  if (!cloud.configured && !cloud.syncing) {
    return (
      <View style={s.screen}>
        <Empty icon="globe-outline" title="Онлайн-запись не подключена" text="Введите ключ облака — и заявки со страницы записи будут приходить сюда.">
          <Button title="Подключить" icon="link-outline" onPress={() => router.replace('/online')} />
        </Empty>
      </View>
    );
  }

  const cur = settings?.currency ?? '₺';

  const renderCard = (r: CloudRequest) => {
    const isNew = r.status === 'new';
    const hits = isNew ? requestConflicts(r, appts, events) : [];
    const outside = isNew && settings ? outsideWorkHours(r, settings, weekday) : false;
    const phone = settings ? normalizePhone(r.phone, settings.default_country) : r.phone;
    return (
      <Card key={r.id} style={[s.card, isNew && s.cardNew]}>
        <View style={s.head}>
          <Text style={s.name} numberOfLines={1}>{r.name}</Text>
          {r.first_time ? <Badge label="впервые" color={colors.info} /> : null}
          <Badge label={STATUS[r.status].label} color={STATUS[r.status].color} />
        </View>
        <View style={s.line}>
          <Ionicons name="calendar-outline" size={16} color={colors.yellow} />
          <Text style={s.when}>{fmtDayLong(r.day)} · {fmtTime(r.start_min)}–{fmtTime(r.start_min + r.duration)}</Text>
        </View>
        <View style={s.line}>
          <Ionicons name="sparkles-outline" size={16} color={colors.yellow} />
          <Text style={s.text}>{servicesLabel(r)} · {fmtDuration(r.duration)} · <Text style={s.price}>{money(r.price, cur)}</Text></Text>
        </View>
        <View style={s.line}>
          <Ionicons name={r.channel === 'tg' ? 'paper-plane-outline' : 'logo-whatsapp'} size={16} color={colors.muted} />
          <Text style={s.muted}>{formatPhone(phone)} · ответ в {r.channel === 'tg' ? 'Telegram' : 'WhatsApp'}</Text>
        </View>
        {r.comment ? <Text style={s.comment}>«{r.comment}»</Text> : null}
        {hits.length || outside ? (
          <View style={s.warn}>
            <Ionicons name="warning" size={16} color={colors.yellow} />
            <Text style={s.warnText}>
              {[hits.length ? `Время пересекается: ${hits.join(', ')}` : '', outside ? 'Вне рабочего графика' : ''].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}
        {isNew ? (
          <>
            <View style={s.actions}>
              <Button title="Принять" icon="checkmark" onPress={() => accept(r)} loading={busyId === r.id} style={{ flex: 1 }} />
              <Button title="Отклонить" variant="secondary" onPress={() => decline(r)} disabled={busyId === r.id} style={{ flex: 1 }} />
            </View>
            <ContactActions phone={phone} telegram="" text="" />
          </>
        ) : r.status === 'accepted' ? (
          <Button title="Открыть запись" icon="open-outline" variant="ghost" onPress={() => openAppointment(r)} />
        ) : null}
      </Card>
    );
  };

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={cloud.syncing} onRefresh={() => runCloudSync(db)} tintColor={colors.yellow} colors={[colors.yellow]} />}
    >
      {cloud.error ? (
        <View style={[s.warn, { marginBottom: space.md }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.yellow} />
          <Text style={s.warnText}>{cloud.error}</Text>
        </View>
      ) : null}

      <SectionTitle>{fresh.length ? `Новые · ${fresh.length}` : 'Новые'}</SectionTitle>
      {fresh.length ? fresh.map(renderCard) : (
        <Text style={s.empty}>Новых заявок нет. Как только клиентка запишется на сайте, заявка появится здесь и придёт уведомление.</Text>
      )}

      {done.length ? (
        <>
          <SectionTitle>За 30 дней</SectionTitle>
          {done.map(renderCard)}
        </>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 40 },
  card: { gap: 8, marginBottom: space.md },
  cardNew: { borderColor: 'rgba(255,198,26,0.45)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  when: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  text: { color: colors.text, fontSize: 14, flex: 1 },
  price: { color: colors.yellow1, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 13, flex: 1 },
  comment: { color: colors.muted, fontSize: 14, fontStyle: 'italic' },
  warn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: space.sm, borderRadius: radius.sm,
    backgroundColor: 'rgba(255,198,26,0.1)', borderWidth: 1, borderColor: 'rgba(255,198,26,0.35)',
  },
  warnText: { color: colors.yellow1, fontSize: 13, flex: 1 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: 4 },
  empty: { color: colors.dim, fontSize: 14, lineHeight: 20, marginBottom: space.lg },
});
