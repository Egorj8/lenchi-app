import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tap } from '@/components/ui';
import { colors, radius } from '@/theme';
import { openTelegram, openWhatsApp } from '@/utils/messages';

/** Две компактные кнопки «WhatsApp» и «Telegram» с готовым текстом; onSent — после нажатия */
export function ContactActions({ phone, telegram, text, onSent }: { phone: string; telegram: string; text: string; onSent?: () => void }) {
  return (
    <View style={s.row}>
      <Pressable
        onPress={() => { tap(); openWhatsApp(phone, text); onSent?.(); }}
        style={({ pressed }) => [s.btn, s.wa, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="logo-whatsapp" size={17} color={colors.ink} />
        <Text style={[s.text, { color: colors.ink }]}>WhatsApp</Text>
      </Pressable>
      <Pressable
        onPress={() => { tap(); openTelegram(telegram, phone, text); onSent?.(); }}
        style={({ pressed }) => [s.btn, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="paper-plane" size={16} color={colors.yellow} />
        <Text style={s.text}>Telegram</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40,
    borderRadius: radius.sm + 2, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface,
  },
  wa: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  text: { color: colors.text, fontSize: 14, fontWeight: '700' },
});
