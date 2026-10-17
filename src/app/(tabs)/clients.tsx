import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Card, Empty, Fab, ScreenTitle } from '@/components/ui';
import { listClients, type ClientRow } from '@/db/queries';
import { colors, radius, space } from '@/theme';
import { fmtDayShort, plural, todayKey } from '@/utils/date';

export default function ClientsScreen() {
  const db = useSQLiteContext();
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<ClientRow[]>([]);

  const load = useCallback(async () => {
    setClients(await listClients(db, todayKey(), query));
  }, [db, query]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.header}>
        <ScreenTitle
          subtitle={clients.length ? `${clients.length} ${plural(clients.length, 'клиентка', 'клиентки', 'клиенток')}` : 'База клиентов'}
          title="Клиенты"
        />
        <View style={s.search}>
          <Ionicons name="search" size={18} color={colors.dim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Имя, телефон или @telegram"
            placeholderTextColor={colors.dim}
            selectionColor={colors.yellow}
            style={s.searchInput}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <FlatList
        data={clients}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Empty
            icon="people-outline"
            title={query ? 'Никого не нашли' : 'Пока нет клиентов'}
            text={query ? 'Попробуйте другой запрос.' : 'Добавьте первую клиентку кнопкой «+» или прямо при создании записи.'}
          />
        }
        renderItem={({ item: c }) => (
          <Card style={s.row} onPress={() => router.push(`/client/${c.id}`)}>
            <Avatar name={c.name} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.name} numberOfLines={1}>{c.name}</Text>
              <Text style={s.sub} numberOfLines={1}>
                {c.next_visit
                  ? `Следующий визит: ${fmtDayShort(c.next_visit)}`
                  : c.last_visit
                    ? `Была ${fmtDayShort(c.last_visit)} · ${c.visits} ${plural(c.visits, 'визит', 'визита', 'визитов')}`
                    : c.phone || (c.telegram ? `@${c.telegram}` : 'Нет визитов')}
              </Text>
            </View>
            {c.next_visit ? <View style={s.dot} /> : null}
            <Ionicons name="chevron-forward" size={18} color={colors.dim} />
          </Card>
        )}
      />

      <Fab label="Новая клиентка" icon="person-add" onPress={() => router.push('/client/edit')} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.md },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 48, marginBottom: space.md,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16 },
  list: { paddingHorizontal: space.lg, paddingBottom: 110, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 13 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.yellow },
});
