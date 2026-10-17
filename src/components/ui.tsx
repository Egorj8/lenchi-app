import Ionicons from '@expo/vector-icons/Ionicons';
import MaskedViewBase, { type MaskedViewProps } from '@react-native-masked-view/masked-view';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, gradients, radius, space } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// Типы masked-view ещё не обновлены под React 19
const MaskedView = MaskedViewBase as unknown as ComponentType<MaskedViewProps>;

export const tap = () => Haptics.selectionAsync().catch(() => {});
export const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

/** Текст с серо-жёлтым градиентом и мягким свечением — как имя на визитке */
export function GradientText({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <View>
      <Text style={[style, styles.glow]} aria-hidden>
        {children}
      </Text>
      <View style={StyleSheet.absoluteFill}>
        <MaskedView maskElement={<Text style={style}>{children}</Text>}>
          <LinearGradient colors={gradients.title} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Text style={[style, { opacity: 0 }]}>{children}</Text>
          </LinearGradient>
        </MaskedView>
      </View>
    </View>
  );
}

export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <GradientText style={styles.title}>{title}</GradientText>
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  pulse?: boolean;
};

export function Button({ title, onPress, icon, variant = 'primary', loading, disabled, style, pulse }: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.03, duration: 900, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, scale]);

  const isPrimary = variant === 'primary';
  const fg = isPrimary ? colors.ink : variant === 'danger' ? colors.danger : colors.text;
  const content = (
    <View style={styles.btnInner}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </View>
  );

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        disabled={disabled || loading}
        onPress={() => {
          tap();
          onPress();
        }}
        style={({ pressed }) => [
          styles.btn,
          variant === 'secondary' && styles.btnSecondary,
          variant === 'ghost' && styles.btnGhost,
          variant === 'danger' && styles.btnDanger,
          isPrimary && styles.btnShadow,
          (disabled || loading) && { opacity: 0.5 },
          pressed && { transform: [{ scale: 0.97 }] },
        ]}
      >
        {isPrimary ? (
          <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGradient}>
            {content}
          </LinearGradient>
        ) : (
          content
        )}
      </Pressable>
    </Animated.View>
  );
}

export function IconButton({ icon, onPress, color = colors.text, size = 22, label, style }: {
  icon: IconName; onPress: () => void; color?: string; size?: number; label: string; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.iconBtn, style, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

/** Круглая кнопка действия (звонок, WhatsApp, Telegram) */
export function ActionCircle({ icon, label, onPress, accent }: { icon: IconName; label: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <View style={[styles.actionIcon, accent && { backgroundColor: colors.yellow, borderColor: colors.yellow }]}>
        <Ionicons name={icon} size={22} color={accent ? colors.ink : colors.yellow} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

export function Fab({ onPress, icon = 'add', label }: { onPress: () => void; icon?: IconName; label: string }) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
    >
      <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabInner}>
        <Ionicons name={icon} size={30} color={colors.ink} />
      </LinearGradient>
    </Pressable>
  );
}

export function Field({ label, hint, style, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.dim}
        selectionColor={colors.yellow}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }, style]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, sub, disabled }: { label: string; selected?: boolean; onPress: () => void; sub?: string; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipOn,
        disabled && { opacity: 0.35 },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, selected && { color: colors.ink }]}>{label}</Text>
      {sub ? <Text style={[styles.chipSub, selected && { color: colors.ink }]}>{sub}</Text> : null}
    </Pressable>
  );
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';
  return (
    <LinearGradient
      colors={['#3a3c42', '#2a2c30']}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </LinearGradient>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Empty({ icon, title, text, children }: { icon: IconName; title: string; text?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.yellow} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {children}
    </View>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color + '66', backgroundColor: color + '1f' }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function Row({ icon, label, value, onPress, last }: { icon: IconName; label: string; value?: string; onPress?: () => void; last?: boolean }) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color={colors.yellow} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.dim} /> : null}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  glow: {
    color: colors.yellow3,
    textShadowColor: 'rgba(255,198,26,0.55)',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginBottom: space.lg },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: 2, textTransform: 'capitalize' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  btn: { borderRadius: radius.md, overflow: 'hidden', minHeight: 54, justifyContent: 'center' },
  btnGradient: { minHeight: 54, justifyContent: 'center', paddingHorizontal: space.xl },
  btnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: space.xl },
  btnGhost: { backgroundColor: 'transparent', paddingHorizontal: space.lg },
  btnDanger: { backgroundColor: 'rgba(255,107,107,0.1)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.35)', paddingHorizontal: space.xl },
  btnShadow: { shadowColor: colors.yellow, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnText: { fontSize: 16, fontWeight: '700' },
  iconBtn: {
    width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  action: { alignItems: 'center', gap: 6, flex: 1 },
  actionIcon: {
    width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong,
  },
  actionLabel: { color: colors.muted, fontSize: 12 },
  fab: {
    position: 'absolute', right: 20, bottom: 20, borderRadius: 22,
    shadowColor: colors.yellow, shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  fabInner: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.muted, fontSize: 13, marginBottom: 6, fontWeight: '600' },
  hint: { color: colors.dim, fontSize: 12, marginTop: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  chipSub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,198,26,0.35)' },
  avatarText: { color: colors.yellow1, fontWeight: '700' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.md },
  section: { color: colors.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 8 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,198,26,0.1)', borderWidth: 1, borderColor: 'rgba(255,198,26,0.3)', marginBottom: 6,
  },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: {
    width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,198,26,0.1)',
  },
  rowLabel: { color: colors.text, fontSize: 16, flex: 1 },
  rowValue: { color: colors.muted, fontSize: 14, maxWidth: '45%' },
});
