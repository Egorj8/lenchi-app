import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tap, type IconName } from '@/components/ui';
import { colors, radius, space } from '@/theme';

type Item = { icon: IconName; label: string; count: number; hint: string; href: '/rebook' | '/birthdays' | '/waitlist'; color: string };

/** Три плитки над списком клиенток: коррекция, дни рождения, лист ожидания */
export function AttentionBar({ rebook, birthdays, waitlist }: { rebook: number; birthdays: number; waitlist: number }) {
  const items: Item[] = [
    { icon: 'sparkles', label: 'Пора на коррекцию', count: rebook, hint: rebook ? 'написать' : 'все записаны', href: '/rebook', color: colors.yellow },
    { icon: 'gift', label: 'Дни рождения', count: birthdays, hint: birthdays ? 'скоро' : 'нет в 2 нед.', href: '/birthdays', color: '#ff6b9a' },
    { icon: 'hourglass', label: 'Лист ожидания', count: waitlist, hint: waitlist ? 'ждут' : 'пусто', href: '/waitlist', color: '#7aa7ff' },
  ];
  return (
    <View style={s.row}>
      {items.map((it) => (
        <Pressable
          key={it.href}
          onPress={() => { tap(); router.push(it.href); }}
          style={({ pressed }) => [s.tile, it.count > 0 && { borderColor: it.color + '88' }, pressed && { opacity: 0.7 }]}
        >
          <View style={s.top}>
            <Ionicons name={it.icon} size={18} color={it.color} />
            <Text style={[s.count, { color: it.count ? it.color : colors.dim }]}>{it.count}</Text>
          </View>
          <Text style={s.label} numberOfLines={2}>{it.label}</Text>
          <Text style={s.hint} numberOfLines={1}>{it.hint}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  tile: {
    flex: 1, padding: space.md, borderRadius: radius.md, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, gap: 2,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 20, fontWeight: '800' },
  label: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 4, minHeight: 34 },
  hint: { color: colors.dim, fontSize: 11 },
});
