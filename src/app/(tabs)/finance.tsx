import { useFocusEffect } from 'expo-router';
import { useDb } from '@/db/provider';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Chip, ScreenTitle, SectionTitle } from '@/components/ui';
import { financeSummary, getSettings, type FinanceSummary } from '@/db/queries';
import { colors, gradients, radius, space } from '@/theme';
import { addDays, fromKey, range, todayKey, toKey, weekdayShort, plural } from '@/utils/date';
import { money } from '@/utils/messages';

type Period = 'week' | 'month' | 'year';

function periodRange(p: Period): [string, string, string] {
  const t = todayKey();
  const d = fromKey(t);
  if (p === 'week') {
    const shift = (d.getDay() + 6) % 7; // понедельник
    const from = addDays(t, -shift);
    return [from, addDays(from, 6), 'Эта неделя'];
  }
  if (p === 'month') {
    const from = toKey(new Date(d.getFullYear(), d.getMonth(), 1));
    const to = toKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return [from, to, 'Этот месяц'];
  }
  return [toKey(new Date(d.getFullYear(), 0, 1)), toKey(new Date(d.getFullYear(), 11, 31)), 'Этот год'];
}

export default function FinanceScreen() {
  const db = useDb();
  const [period, setPeriod] = useState<Period>('week');
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [cur, setCur] = useState('₺');
  const [from, to, label] = periodRange(period);

  const load = useCallback(async () => {
    const [f, s] = await Promise.all([financeSummary(db, from, to), getSettings(db)]);
    setData(f);
    setCur(s.currency);
  }, [db, from, to]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Для недели — столбики по дням, для месяца и года — топ дней
  const bars = useMemo(() => {
    if (!data) return [];
    if (period === 'week') {
      return range(from, 7).map((d) => ({ key: d, label: weekdayShort(d), sum: data.byDay.find((x) => x.date === d)?.sum ?? 0 }));
    }
    return [...data.byDay].sort((a, b) => b.sum - a.sum).slice(0, 7)
      .map((x) => ({ key: x.date, label: String(fromKey(x.date).getDate()), sum: x.sum }));
  }, [data, period, from]);
  const maxBar = Math.max(1, ...bars.map((b) => b.sum));
  const avg = data && data.visits ? data.revenue / data.visits : 0;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <ScreenTitle subtitle={label} title="Финансы" />

        <View style={s.periods}>
          <Chip label="Неделя" selected={period === 'week'} onPress={() => setPeriod('week')} />
          <Chip label="Месяц" selected={period === 'month'} onPress={() => setPeriod('month')} />
          <Chip label="Год" selected={period === 'year'} onPress={() => setPeriod('year')} />
        </View>

        <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <Text style={s.heroLabel}>Заработано</Text>
          <Text style={s.heroValue} adjustsFontSizeToFit numberOfLines={1}>{money(data?.revenue ?? 0, cur)}</Text>
          <Text style={s.heroSub}>
            {data?.visits ?? 0} {plural(data?.visits ?? 0, 'визит', 'визита', 'визитов')}
            {data?.expected ? ` · ещё ожидается ${money(data.expected, cur)}` : ''}
          </Text>
        </LinearGradient>

        <View style={s.grid}>
          <Tile value={money(avg, cur)} label="Средний чек" />
          <Tile value={String(data?.expectedVisits ?? 0)} label="Впереди записей" />
          <Tile value={String(data?.newClients ?? 0)} label="Новых клиенток" />
          <Tile value={String(data?.noShows ?? 0)} label="Не пришли" warn={!!data?.noShows} />
        </View>

        <SectionTitle>{period === 'week' ? 'По дням' : 'Лучшие дни'}</SectionTitle>
        <Card>
          {bars.length === 0 ? (
            <Text style={s.muted}>Пока нет завершённых визитов. Отмечайте «Клиентка пришла», и здесь появится статистика.</Text>
          ) : (
            <View style={s.chart}>
              {bars.map((b) => (
                <View key={b.key} style={s.barCol}>
                  <Text style={s.barValue}>{b.sum ? Math.round(b.sum / 100) / 10 + 'k' : ''}</Text>
                  <View style={s.barTrack}>
                    <LinearGradient
                      colors={gradients.gold}
                      style={[s.bar, { height: `${Math.max(b.sum ? 6 : 0, (b.sum / maxBar) * 100)}%` }]}
                    />
                  </View>
                  <Text style={[s.barLabel, b.key === todayKey() && { color: colors.yellow }]}>{b.label}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        <SectionTitle>Популярные услуги</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          {!data?.topServices.length ? (
            <Text style={[s.muted, { paddingVertical: 12 }]}>Нет данных за период.</Text>
          ) : (
            data.topServices.map((t, i) => (
              <View key={t.name} style={[s.line, i < data.topServices.length - 1 && s.lineBorder]}>
                <Text style={s.rank}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.lineName}>{t.name}</Text>
                  <Text style={s.muted}>{t.n} {plural(t.n, 'раз', 'раза', 'раз')}</Text>
                </View>
                <Text style={s.linePrice}>{money(t.sum, cur)}</Text>
              </View>
            ))
          )}
        </Card>
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <View style={s.tile}>
      <Text style={[s.tileValue, warn && { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingTop: space.md },
  periods: { flexDirection: 'row', gap: 8, marginBottom: space.lg },
  hero: { borderRadius: radius.xl, padding: space.xl },
  heroLabel: { color: 'rgba(26,27,30,0.7)', fontSize: 14, fontWeight: '700' },
  heroValue: { color: colors.ink, fontSize: 40, fontWeight: '800', letterSpacing: -1, marginVertical: 4 },
  heroSub: { color: 'rgba(26,27,30,0.75)', fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  tile: {
    flexBasis: '48%', flexGrow: 1, padding: space.lg, borderRadius: radius.lg,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  tileValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  tileLabel: { color: colors.muted, fontSize: 13, marginTop: 2 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 170, gap: 8 },
  barCol: { flex: 1, alignItems: 'center', height: '100%' },
  barValue: { color: colors.muted, fontSize: 10, height: 14 },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end', marginVertical: 4 },
  bar: { width: '100%', borderRadius: 6 },
  barLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  lineBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rank: { color: colors.yellow, fontWeight: '800', fontSize: 16, width: 18 },
  lineName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  linePrice: { color: colors.yellow1, fontSize: 15, fontWeight: '700' },
});
