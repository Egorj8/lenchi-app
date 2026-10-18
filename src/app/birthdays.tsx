import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContactActions } from '@/components/ContactActions';
import { Avatar, Card, Empty, SectionTitle, tap } from '@/components/ui';
import { useDb } from '@/db/provider';
import { clientsWithBirthday, getSettings, type Client, type Settings } from '@/db/queries';
import { colors, space } from '@/theme';
import { fillTemplate, fmtBirthday, nextBirthday, type NextBirthday } from '@/utils/attention';
import { plural, todayKey } from '@/utils/date';

type Row = Client & { next: NextBirthday };

export default function BirthdaysScreen() {
  const db = useDb();
  const [rows, setRows] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const t = todayKey();
        const [list, s] = await Promise.all([clientsWithBirthday(db), getSettings(db)]);
        setSettings(s);
        setRows(list.map((c) => ({ ...c, next: nextBirthday(c.birthday!, t) })).sort((a, b) => a.next.daysLeft - b.next.daysLeft));
      })();
    }, [db]),
  );

  if (!settings) return null;
  const soon = rows.filter((r) => r.next.daysLeft <= 14);
  const later = rows.filter((r) => r.next.daysLeft > 14);

  const when = (n: NextBirthday) =>
    n.daysLeft === 0 ? 'Сегодня! 🎂' : n.daysLeft === 1 ? 'Завтра' : `Через ${n.daysLeft} ${plural(n.daysLeft, 'день', 'дня', 'дней')}`;

  const item = (r: Row, actions: boolean) => (
    <Card key={r.id} style={[s.card, r.next.daysLeft === 0 && s.today]}>
      <Pressable style={s.head} onPress={() => { tap(); router.push(`/client/${r.id}`); }}>
        <Avatar name={r.name} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{r.name}</Text>
          <Text style={s.sub}>
            {fmtBirthday(r.birthday!)}{r.next.age ? ` · исполнится ${r.next.age}` : ''}
          </Text>
        </View>
        <Text style={[s.when, r.next.daysLeft === 0 && { color: colors.yellow1 }]}>{when(r.next)}</Text>
      </Pressable>
      {actions ? (
        <ContactActions
          phone={r.phone}
          telegram={r.telegram}
          text={fillTemplate(settings.birthday_template, { имя: r.name.split(' ')[0], мастер: settings.master_name })}
        />
      ) : null}
    </Card>
  );

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.content}>
      {rows.length === 0 ? (
        <Empty
          icon="gift-outline"
          title="Дни рождения не указаны"
          text="Добавьте дату в карточке клиентки (Клиенты → клиентка → ✎). В день рождения приложение напомнит утром и подготовит поздравление."
        />
      ) : (
        <>
          <SectionTitle>Ближайшие 2 недели</SectionTitle>
          {soon.length ? soon.map((r) => item(r, r.next.daysLeft <= 1)) : <Text style={s.muted}>В ближайшие две недели дней рождения нет.</Text>}
          {later.length ? (
            <>
              <SectionTitle>Позже</SectionTitle>
              {later.map((r) => item(r, false))}
            </>
          ) : null}
        </>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingTop: 0 },
  muted: { color: colors.muted, fontSize: 14 },
  card: { gap: space.md, marginBottom: space.sm },
  today: { borderColor: 'rgba(255,198,26,0.55)', backgroundColor: 'rgba(255,198,26,0.07)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  when: { color: colors.muted, fontSize: 13, fontWeight: '700' },
});
