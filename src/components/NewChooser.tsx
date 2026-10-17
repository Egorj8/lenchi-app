import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tap, type IconName } from '@/components/ui';
import { colors, radius, space } from '@/theme';
import { fmtDayLong, fmtTime } from '@/utils/date';

type Props = {
  visible: boolean;
  date: string;
  start?: number;
  onClose: () => void;
  onAppointment: () => void;
  onEvent: () => void;
};

/** Нижняя панель «Что добавить?»: запись клиентки или личное дело */
export function NewChooser({ visible, date, start, onClose, onAppointment, onEvent }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + space.lg }]} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={s.title}>Что добавить?</Text>
          <Text style={s.sub}>{fmtDayLong(date)}{start !== undefined ? `, ${fmtTime(start)}` : ''}</Text>
          <Option
            icon="sparkles"
            color={colors.yellow}
            title="Запись клиентки"
            text="Услуга, время, напоминание"
            onPress={() => { tap(); onAppointment(); }}
          />
          <Option
            icon="calendar-clear-outline"
            color="#7aa7ff"
            title="Личное дело"
            text="Магазин, пробежка, врач — что угодно"
            onPress={() => { tap(); onEvent(); }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Option({ icon, color, title, text, onPress }: { icon: IconName; color: string; title: string; text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.option, pressed && { opacity: 0.7 }]}>
      <View style={[s.icon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.optTitle}>{title}</Text>
        <Text style={s.optText}>{text}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.dim} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg2, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md,
    borderTopWidth: 1, borderColor: colors.border,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: space.sm },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 14, marginTop: -6, marginBottom: space.xs },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg,
    borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  optTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  optText: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
