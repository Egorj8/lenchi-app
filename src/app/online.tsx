import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, Field, Row, SectionTitle, success } from '@/components/ui';
import { useDb } from '@/db/provider';
import { DEFAULT_SETTINGS } from '@/db/schema';
import { getSettings, saveSettings, type Settings } from '@/db/queries';
import { colors, space } from '@/theme';
import { BOOKING_URL } from '@/utils/cloud';
import { runCloudSync, useCloud } from '@/utils/cloudStore';
import { checkKey, cloudErrorText, resetCloudMarks } from '@/utils/cloudSync';
import { plural } from '@/utils/date';
import { showAlert } from '@/utils/dialog';

function ago(ts: number) {
  if (!ts) return 'ещё не было';
  const min = Math.floor((Date.now() - ts) / 60_000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} ${plural(min, 'минуту', 'минуты', 'минут')} назад`;
  const h = Math.floor(min / 60);
  return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
}

export default function OnlineScreen() {
  const db = useDb();
  const toast = useToast();
  const cloud = useCloud();
  const [s, setS] = useState<Settings | null>(null);
  const [key, setKey] = useState('');
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    const st = await getSettings(db);
    setS(st);
    setKey(st.cloud_key);
  }, [db]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!s) return <View style={st.screen} />;
  const connected = !!s.cloud_key;

  const connect = async () => {
    const k = key.trim();
    if (!k) return showAlert('Нет ключа', 'Вставьте ключ мастера — он записан в файле с паролями на компьютере.');
    setChecking(true);
    try {
      if (!(await checkKey(k))) {
        showAlert('Ключ не подходит', 'Облако его не узнало. Проверьте, что ключ скопирован целиком, без пробелов.');
        return;
      }
      await saveSettings(db, { cloud_key: k });
      await resetCloudMarks(db);
      await runCloudSync(db);
      await load();
      success();
      toast({ message: 'Онлайн-запись подключена', icon: 'checkmark-circle' });
    } catch (e) {
      showAlert('Не получилось подключить', cloudErrorText(e));
    } finally {
      setChecking(false);
    }
  };

  const disconnect = () =>
    showAlert('Отключить онлайн-запись?', 'Приложение перестанет получать заявки и обновлять время на сайте. Страница записи продолжит работать по старым данным.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отключить',
        style: 'destructive',
        onPress: async () => {
          await saveSettings(db, { cloud_key: '' });
          await resetCloudMarks(db);
          await runCloudSync(db);
          load();
        },
      },
    ]);

  const syncNow = async () => {
    await resetCloudMarks(db); // выгрузить всё заново, даже если «ничего не менялось»
    await runCloudSync(db);
    toast({ message: 'Сайт обновлён', icon: 'cloud-done-outline' });
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(BOOKING_URL);
    toast({ message: 'Ссылка скопирована', icon: 'copy-outline' });
  };

  const setT = (k: keyof Settings) => (v: string) => setS({ ...s, [k]: v });
  const saveTemplates = async () => {
    await saveSettings(db, { confirm_template: s.confirm_template, decline_template: s.decline_template });
    success();
    toast({ message: 'Сохранено', icon: 'checkmark-circle' });
  };

  return (
    <KeyboardAvoidingView style={st.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <Card style={[st.status, connected && !cloud.error && st.statusOk]}>
          <Ionicons
            name={!connected ? 'cloud-offline-outline' : cloud.error ? 'warning' : 'cloud-done'}
            size={28}
            color={!connected ? colors.dim : cloud.error ? colors.yellow : colors.success}
          />
          <View style={{ flex: 1 }}>
            <Text style={st.statusTitle}>{!connected ? 'Не подключена' : cloud.error ? 'Нет связи с облаком' : 'Подключена'}</Text>
            <Text style={st.statusSub}>
              {connected ? (cloud.error ?? `Обмен с сайтом: ${cloud.syncing ? 'идёт…' : ago(cloud.lastSync)}`) : 'Заявки с сайта не приходят в приложение'}
            </Text>
          </View>
        </Card>

        {connected ? (
          <Card style={st.group}>
            <Row icon="mail-unread-outline" label="Заявки с сайта" value={cloud.newCount ? `${cloud.newCount} новых` : undefined} onPress={() => router.push('/requests')} />
            <Row icon="refresh-outline" label="Обновить сайт сейчас" onPress={syncNow} last />
          </Card>
        ) : null}

        <SectionTitle>Страница записи для клиенток</SectionTitle>
        <Card style={st.linkCard}>
          <Text style={st.link} selectable>{BOOKING_URL}</Text>
          <Text style={st.hint}>Эту ссылку можно поставить в Instagram, Telegram-канал и отправлять клиенткам.</Text>
          <View style={st.row}>
            <Button title="Скопировать" icon="copy-outline" variant="secondary" onPress={copyLink} style={{ flex: 1 }} />
            <Button title="Открыть" icon="open-outline" variant="secondary" onPress={() => Linking.openURL(BOOKING_URL)} style={{ flex: 1 }} />
          </View>
        </Card>
        <Text style={st.explain}>
          На сайт уходят: услуги и цены, рабочие дни и часы, занятое время — без имён и телефонов. Меняете что-то в приложении —
          сайт обновляется сам.
        </Text>

        <SectionTitle>Ключ облака</SectionTitle>
        <Field
          label="Ключ мастера"
          value={key}
          onChangeText={setKey}
          placeholder="lenchi-…"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={connected && key === s.cloud_key}
          hint="Секретный: по нему приложение видит заявки. Записан в файле с паролями на компьютере. Никому не пересылайте."
        />
        {!connected || key.trim() !== s.cloud_key ? (
          <Button title={connected ? 'Сохранить новый ключ' : 'Подключить'} icon="link-outline" onPress={connect} loading={checking} />
        ) : (
          <Button title="Отключить" icon="unlink-outline" variant="ghost" onPress={disconnect} />
        )}

        <SectionTitle>Ответы клиенткам</SectionTitle>
        <Field label="Заявка принята" value={s.confirm_template} onChangeText={setT('confirm_template')} multiline hint="Подстановки: {имя}, {дата}, {время}, {услуга}, {адрес}, {мастер}" />
        <Field label="Заявка отклонена" value={s.decline_template} onChangeText={setT('decline_template')} multiline hint="Подстановки: {имя}, {дата}, {время}, {ссылка} — на страницу записи, {мастер}" />
        <View style={st.row}>
          <Button title="Сохранить" icon="checkmark" onPress={saveTemplates} style={{ flex: 1 }} />
          <Button
            title="Как было"
            variant="ghost"
            onPress={() => setS({ ...s, confirm_template: DEFAULT_SETTINGS.confirm_template, decline_template: DEFAULT_SETTINGS.decline_template })}
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 60 },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  statusOk: { borderColor: 'rgba(95,211,141,0.4)' },
  statusTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  statusSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  group: { paddingVertical: 0 },
  linkCard: { gap: space.sm },
  link: { color: colors.yellow1, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  explain: { color: colors.dim, fontSize: 13, lineHeight: 18, marginTop: space.sm, paddingHorizontal: 4 },
  row: { flexDirection: 'row', gap: space.sm },
});
