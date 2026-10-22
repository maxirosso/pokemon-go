import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/utils/haptics';
import { Text } from './Text';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  items: ToastItem[];
  show: (message: string, opts?: { kind?: ToastKind; actionLabel?: string; onAction?: () => void; durationMs?: number }) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  show(message, opts = {}) {
    const id = nextId;
    nextId += 1;
    haptic(opts.kind === 'error' ? 'error' : opts.kind === 'success' ? 'success' : 'light');
    set((s) => ({ items: [...s.items.slice(-2), { id, kind: opts.kind ?? 'info', message, actionLabel: opts.actionLabel, onAction: opts.onAction }] }));
    setTimeout(() => get().dismiss(id), opts.durationMs ?? (opts.actionLabel ? 6000 : 3200));
  },
  dismiss(id) {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },
}));

export const toast = {
  success: (m: string, o?: { actionLabel?: string; onAction?: () => void }) => useToasts.getState().show(m, { kind: 'success', ...o }),
  error: (m: string) => useToasts.getState().show(m, { kind: 'error', durationMs: 5000 }),
  info: (m: string, o?: { actionLabel?: string; onAction?: () => void }) => useToasts.getState().show(m, { kind: 'info', ...o }),
};

/** Mount once at the root. Confirmations are announced to screen readers via accessibilityLiveRegion. */
export function ToastHost() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  useEffect(() => undefined, []);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 96, gap: 8 }}>
      {items.map((t) => (
        <Animated.View key={t.id} entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(160)}>
          <Pressable
            accessibilityLiveRegion="polite"
            onPress={() => dismiss(t.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: c.elevatedHigh,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: t.kind === 'error' ? 'rgba(255,119,132,0.4)' : c.borderStrong,
              padding: 14,
            }}
          >
            {t.kind === 'success' ? <CircleCheck size={18} color={c.success} /> : t.kind === 'error' ? <CircleAlert size={18} color={c.danger} /> : <Info size={18} color={c.blue} />}
            <Text variant="small" style={{ flex: 1 }}>
              {t.message}
            </Text>
            {t.actionLabel ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                <Text variant="small" color="accent" style={{ fontFamily: 'Geist_600SemiBold' }}>
                  {t.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}
