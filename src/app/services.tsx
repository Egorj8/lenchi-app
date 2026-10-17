import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Card, Fab } from '@/components/ui';
import { getSettings, listServices, type Service } from '@/db/queries';
import { colors, space } from '@/theme';
import { fmtDuration } from '@/utils/date';
import { money } from '@/utils/messages';

export default function ServicesScreen() {
  const db = useSQLiteContext();
  const [services, setServices] = useState<Service[]>([]);
  const [cur, setCur] = useState('₺');

  const load = useCallback(async () => {
    const [sv, st] = await Promise.all([listServices(db, true), getSettings(db)]);
    setServices(sv);
    setCur(st.currency);
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={services}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <Card
            style={[s.row, !!item.archived && { opacity: 0.45 }]}
            onPress={() => router.push({ pathname: '/service-edit', params: { id: String(item.id) } })}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.name}>{item.name}{item.archived ? ' · скрыта' : ''}</Text>
              {item.description ? <Text style={s.desc}>{item.description}</Text> : null}
              <View style={s.meta}>
                <Ionicons name="time-outline" size={14} color={colors.dim} />
                <Text style={s.desc}>{fmtDuration(item.duration)}</Text>
              </View>
            </View>
            <Text style={s.price}>{money(item.price, cur)}</Text>
          </Card>
        )}
      />
      <Fab label="Новая услуга" onPress={() => router.push('/service-edit')} />
    </View>
  );
}

const s = StyleSheet.create({
  list: { padding: space.lg, paddingBottom: 110, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  desc: { color: colors.muted, fontSize: 13 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  price: { color: colors.yellow1, fontSize: 17, fontWeight: '800' },
});
