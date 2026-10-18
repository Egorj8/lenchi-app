import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, success } from '@/components/ui';
import { useDb } from '@/db/provider';
import { getSettings } from '@/db/queries';
import { colors, space } from '@/theme';
import { pickFileBytes } from '@/utils/backupFiles';
import { plural } from '@/utils/date';
import { showAlert } from '@/utils/dialog';
import { emitDataChanged } from '@/utils/events';
import { applyGnomImport, parseGnomClients, planGnomImport, readXlsx, type GnomPlan } from '@/utils/gnomImport';
import { formatPhone } from '@/utils/phone';

const clientsWord = (n: number) => `${n} ${plural(n, 'клиентка', 'клиентки', 'клиенток')}`;

export default function GnomImport() {
  const db = useDb();
  const [plan, setPlan] = useState<GnomPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setBusy(true);
    try {
      const bytes = await pickFileBytes();
      if (!bytes) return;
      const s = await getSettings(db);
      const items = parseGnomClients(readXlsx(bytes), s.default_country);
      if (!items.length) return showAlert('Клиенток не нашлось', 'В файле нет строк с именами. Выберите выгрузку «Клиенты» из ГномГуру.');
      setPlan(await planGnomImport(db, items));
    } catch (e) {
      const code = (e as Error)?.message;
      showAlert(
        'Не получилось прочитать файл',
        code === 'not_xlsx' || code === 'no_columns'
          ? 'Это не выгрузка клиентов ГномГуру. Нужен файл Excel со столбцами «Name» и «Phone» (например, gnom_clients.xlsx).'
          : String(code ?? e),
      );
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await applyGnomImport(db, plan);
      success();
      emitDataChanged();
      const parts = [`Добавлено: ${clientsWord(plan.add.length)}.`, plan.update.length ? `Дополнено: ${plan.update.length}.` : ''];
      showAlert('Готово', parts.filter(Boolean).join('\n'), [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      showAlert('Не получилось', String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      {!plan ? (
        <>
          <Card style={s.card}>
            <Ionicons name="document-text-outline" size={32} color={colors.yellow} />
            <Text style={s.title}>Перенос клиенток из ГномГуру</Text>
            <Text style={s.text}>
              В ГномГуру: Клиенты → Экспорт. Получится файл Excel (например, gnom_clients.xlsx). Перешлите его себе на телефон —
              в Telegram «Избранное» или по почте — и выберите здесь.
            </Text>
            <Text style={s.text}>
              Перенесутся имена, телефоны, обращение для сообщений («Катя» для «Лопатина Катя») и комментарии. Кто уже есть в
              приложении — не задвоится: у них только дополнятся пустые поля.
            </Text>
          </Card>
          <Button title="Выбрать файл" icon="folder-open-outline" onPress={pick} loading={busy} />
        </>
      ) : (
        <>
          <Card style={s.card}>
            <Text style={s.title}>Что будет сделано</Text>
            <Row icon="person-add-outline" color={colors.success} text={`Новых: ${clientsWord(plan.add.length)}`} />
            {plan.update.length ? <Row icon="create-outline" color={colors.yellow} text={`Уже есть, дополним: ${plan.update.length}`} /> : null}
            {plan.skipped ? <Row icon="checkmark-done-outline" color={colors.dim} text={`Уже есть, без изменений: ${plan.skipped}`} /> : null}
          </Card>
          {plan.add.length ? (
            <Card style={s.card}>
              <Text style={s.sub}>Первые в списке</Text>
              {plan.add.slice(0, 5).map((c, i) => (
                <View key={i} style={s.person}>
                  <Text style={s.name} numberOfLines={1}>{c.name}{c.call_name ? <Text style={s.dim}>  · «{c.call_name}»</Text> : null}</Text>
                  <Text style={s.dim}>{c.phone ? formatPhone(c.phone) : 'без телефона'}</Text>
                </View>
              ))}
            </Card>
          ) : null}
          <Button
            title={plan.add.length || plan.update.length ? 'Перенести' : 'Переносить нечего'}
            icon="cloud-download-outline"
            onPress={run}
            loading={busy}
            disabled={!plan.add.length && !plan.update.length}
          />
          <Button title="Выбрать другой файл" variant="ghost" onPress={() => setPlan(null)} style={{ marginTop: space.sm }} />
        </>
      )}
    </ScrollView>
  );
}

function Row({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  return (
    <View style={s.row}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={s.rowText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 40, gap: space.md },
  card: { gap: space.sm },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  text: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  sub: { color: colors.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { color: colors.text, fontSize: 16 },
  person: { paddingVertical: 4 },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  dim: { color: colors.dim, fontSize: 13, fontWeight: '400' },
});
