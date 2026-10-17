import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useDb } from '@/db/provider';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionCircle, Avatar, Badge, Button, Card, Empty, GradientText, IconButton, SectionTitle } from '@/components/ui';
import { getClient, getSettings, listClientAppointments, type Appointment, type ClientRow, type Settings } from '@/db/queries';
import { colors, space, statusMeta } from '@/theme';
import { fmtDayLong, fmtDayShort, fmtTime, todayKey } from '@/utils/date';
import { call, money, openTelegram, openWhatsApp } from '@/utils/messages';

export default function ClientScreen() {
  const db = useDb();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setC] = useState<ClientRow | null | undefined>(undefined);
  const [history, setHistory] = useState<Appointment[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const load = useCallback(async () => {
    const [cl, h, st] = await Promise.all([
      getClient(db, Number(id), todayKey()),
      listClientAppointments(db, Number(id)),
      getSettings(db),
    ]);
    setC(cl);
    setHistory(h);
    setSettings(st);
  }, [db, id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (c === undefined || !settings) return null;
  if (c === null) return <Empty icon="person-outline" title="Клиентка не найдена" />;

  const cur = settings.currency;
  const avg = c.visits ? c.spent / c.visits : 0;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.content}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <IconButton icon="create-outline" label="Изменить" color={colors.yellow}
              onPress={() => router.push({ pathname: '/client/edit', params: { id: String(c.id) } })} />
          ),
        }}
      />

      <View style={s.hero}>
        <Avatar name={c.name} size={84} />
        <GradientText style={s.name}>{c.name}</GradientText>
        <Text style={s.muted}>
          {[c.phone, c.telegram ? `@${c.telegram}` : ''].filter(Boolean).join(' · ') || 'Контакты не указаны'}
        </Text>
      </View>

      <View style={s.actions}>
        <ActionCircle icon="call" label="Позвонить" onPress={() => call(c.phone)} />
        <ActionCircle icon="logo-whatsapp" label="WhatsApp" onPress={() => openWhatsApp(c.phone)} />
        <ActionCircle icon="paper-plane" label="Telegram" onPress={() => openTelegram(c.telegram, c.phone)} />
      </View>

      <View style={s.stats}>
        <Stat value={String(c.visits)} label="визитов" />
        <Stat value={money(c.spent, cur)} label="потрачено" />
        <Stat value={money(avg, cur)} label="средний чек" />
      </View>

      <Button
        title="Записать"
        icon="calendar"
        onPress={() => router.push({ pathname: '/appointment/edit', params: { clientId: String(c.id) } })}
        style={{ marginTop: space.lg }}
      />

      {c.notes ? (
        <>
          <SectionTitle>Заметки</SectionTitle>
          <Card><Text style={s.notes}>{c.notes}</Text></Card>
        </>
      ) : null}

      <SectionTitle>История визитов</SectionTitle>
      {history.length === 0 ? (
        <Card><Text style={s.muted}>Визитов пока не было.</Text></Card>
      ) : (
        history.map((a) => {
          const m = statusMeta[a.status];
          return (
            <Card key={a.id} style={s.visit} onPress={() => router.push(`/appointment/${a.id}`)}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.visitDate}>
                  {a.date >= todayKey() ? fmtDayLong(a.date) : fmtDayShort(a.date)} · {fmtTime(a.start)}
                </Text>
                <Text style={s.muted} numberOfLines={2}>{a.services_label ?? 'Без услуг'}</Text>
                <Badge label={m.label} color={m.color} />
              </View>
              <Text style={s.visitPrice}>{money(a.price, cur)}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.dim} />
            </Card>
          );
        })
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingTop: 0 },
  hero: { alignItems: 'center', gap: 8, marginBottom: space.xl },
  name: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  muted: { color: colors.muted, fontSize: 14 },
  actions: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: {
    flex: 1, padding: space.md, borderRadius: 16, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  statValue: { color: colors.yellow1, fontSize: 18, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  notes: { color: colors.text, fontSize: 15, lineHeight: 22 },
  visit: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: space.sm },
  visitDate: { color: colors.text, fontSize: 15, fontWeight: '700' },
  visitPrice: { color: colors.yellow1, fontSize: 15, fontWeight: '700' },
});
