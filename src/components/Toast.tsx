import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tap, type IconName } from '@/components/ui';
import { colors, radius, space } from '@/theme';

type ToastOptions = {
  message: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void };
  duration?: number;
};

const ToastContext = createContext<(o: ToastOptions) => void>(() => {});

/** Короткое сообщение внизу экрана, например «Запись удалена · Вернуть» */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { key: number }) | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
  }, [anim]);

  const show = useCallback(
    (o: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ ...o, key: Date.now() });
      anim.setValue(0);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
      timer.current = setTimeout(hide, o.duration ?? (o.action ? 8000 : 3000));
    },
    [anim, hide],
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.key}
          pointerEvents="box-none"
          style={[
            s.wrap,
            { bottom: insets.bottom + 84, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] },
          ]}
        >
          <View style={s.toast}>
            <Ionicons name={toast.icon ?? 'checkmark-circle'} size={20} color={colors.yellow} />
            <Text style={s.text} numberOfLines={2}>{toast.message}</Text>
            {toast.action ? (
              <Pressable
                hitSlop={10}
                onPress={() => {
                  tap();
                  toast.action?.onPress();
                  hide();
                }}
              >
                <Text style={s.action}>{toast.action.label}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, zIndex: 100 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: space.lg,
    borderRadius: radius.md, backgroundColor: '#34363c', borderWidth: 1, borderColor: colors.borderStrong,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  text: { color: colors.text, fontSize: 15, flex: 1 },
  action: { color: colors.yellow, fontSize: 15, fontWeight: '800', textTransform: 'uppercase' },
});
