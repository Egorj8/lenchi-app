import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Button, Empty, success, tap } from '@/components/ui';
import { useDb } from '@/db/provider';
import { existingPhones, getSettings, importClients } from '@/db/queries';
import { colors, radius, space } from '@/theme';
import { loadContacts, type PhoneContact } from '@/utils/contacts';
import { plural } from '@/utils/date';
import { showAlert } from '@/utils/dialog';
import { formatPhone } from '@/utils/phone';

export default function ImportContacts() {
  const db = useDb();
  const [contacts, setContacts] = useState<PhoneContact[] | null | undefined>(undefined);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  // выбранный номер для каждого контакта: id → phone
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings(db);
      const [list, phones] = await Promise.all([loadContacts(s.default_country), existingPhones(db)]);
      setKnown(phones);
      setContacts(list);
    })().catch((e) => {
      setContacts(null);
      showAlert('Не удалось прочитать контакты', String(e?.message ?? e));
    });
  }, [db]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return (contacts ?? []).filter(
      (c) => !q || c.name.toLowerCase().includes(q) || (qd.length >= 3 && c.phones.some((p) => p.includes(qd))),
    );
  }, [contacts, query]);

  const isKnown = (c: PhoneContact) => c.phones.some((p) => known.has(p));
  const newOnes = filtered.filter((c) => !isKnown(c));

  const toggle = (c: PhoneContact) =>
    setPicked((m) => {
      const n = new Map(m);
      if (n.has(c.id)) n.delete(c.id);
      else n.set(c.id, c.phones[0]);
      return n;
    });

  const selectAll = () =>
    setPicked((m) => {
      const n = new Map(m);
      const allOn = newOnes.length > 0 && newOnes.every((c) => n.has(c.id));
      for (const c of newOnes) {
        if (allOn) n.delete(c.id);
        else if (!n.has(c.id)) n.set(c.id, c.phones[0]);
      }
      return n;
    });

  const save = async () => {
    if (!contacts) return;
    const items = contacts.filter((c) => picked.has(c.id)).map((c) => ({ name: c.name, phone: picked.get(c.id)! }));
    setSaving(true);
    try {
      const n = await importClients(db, items);
      success();
      showAlert('Готово', `Добавлено ${n} ${plural(n, 'клиентка', 'клиентки', 'клиенток')}.`, [{ text: 'OK', onPress: () => router.back() }]);
    } finally {
      setSaving(false);
    }
  };

  if (contacts === undefined) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.yellow} size="large" />
        <Text style={s.muted}>Читаю контакты…</Text>
      </View>
    );
  }
  if (contacts === null) {
    return <Empty icon="lock-closed-outline" title="Нет доступа к контактам" text="Разрешите доступ в настройках телефона и откройте этот экран снова." />;
  }

  const allOn = newOnes.length > 0 && newOnes.every((c) => picked.has(c.id));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <View style={s.top}>
        <View style={s.search}>
          <Ionicons name="search" size={18} color={colors.dim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Поиск среди ${contacts.length} контактов`}
            placeholderTextColor={colors.dim}
            selectionColor={colors.yellow}
            style={s.searchInput}
          />
        </View>
        <Pressable onPress={() => { tap(); selectAll(); }} hitSlop={8}>
          <Text style={s.link}>{allOn ? 'Снять все' : 'Выбрать все'}</Text>
        </Pressable>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={30}
        ListEmptyComponent={<Empty icon="search-outline" title="Ничего не нашлось" />}
        renderItem={({ item: c }) => {
          const already = isKnown(c);
          const on = picked.has(c.id);
          return (
            <Pressable
              disabled={already}
              onPress={() => { tap(); toggle(c); }}
              style={({ pressed }) => [s.row, already && { opacity: 0.45 }, pressed && { opacity: 0.6 }]}
            >
              <View style={[s.check, on && s.checkOn]}>{on ? <Ionicons name="checkmark" size={16} color={colors.ink} /> : null}</View>
              <Avatar name={c.name} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{c.name}</Text>
                {on && c.phones.length > 1 ? (
                  <View style={s.phones}>
                    {c.phones.map((p) => (
                      <Pressable
                        key={p}
                        onPress={() => { tap(); setPicked((m) => new Map(m).set(c.id, p)); }}
                        style={[s.phoneChip, picked.get(c.id) === p && s.phoneChipOn]}
                      >
                        <Text style={[s.phoneText, picked.get(c.id) === p && { color: colors.ink }]}>{formatPhone(p)}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={s.sub} numberOfLines={1}>
                    {already ? 'Уже в базе' : formatPhone(c.phones[0]) + (c.phones.length > 1 ? ` · ещё ${c.phones.length - 1}` : '')}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        }}
      />

      <View style={s.bottom}>
        <Button
          title={picked.size ? `Добавить ${picked.size} ${plural(picked.size, 'клиентку', 'клиентки', 'клиенток')}` : 'Выберите контакты'}
          icon="person-add"
          onPress={save}
          disabled={!picked.size}
          loading={saving}
        />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: colors.muted, fontSize: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, paddingBottom: space.sm },
  search: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 46,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16 },
  link: { color: colors.yellow, fontWeight: '700', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: colors.dim, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  phones: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  phoneChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong },
  phoneChipOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  phoneText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  bottom: { padding: space.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg2 },
});
