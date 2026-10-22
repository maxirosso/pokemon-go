import { memo, useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/utils/haptics';
import { Text } from './Text';

/** Bottom sheet (modal). Dismiss by tapping the backdrop or the close handle. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
  tall,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  tall?: boolean;
}) {
  const { c, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(150)} exiting={reduceMotion ? undefined : FadeOut.duration(120)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.overlay }}>
          <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View
          entering={reduceMotion ? undefined : SlideInDown.duration(240)}
          exiting={reduceMotion ? undefined : SlideOutDown.duration(180)}
          style={{
            backgroundColor: c.elevated,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderTopWidth: 1,
            borderColor: c.borderStrong,
            maxHeight: tall ? '92%' : '80%',
            paddingBottom: insets.bottom + 8,
          }}
        >
          <Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong }} />
          </Pressable>
          {title ? (
            <Text variant="h3" style={{ paddingHorizontal: 20, paddingBottom: 8 }} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 14 }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Discrete slider (e.g. IV 0–15) built on PanResponder. Tap or drag; accessible increment/decrement actions.
 */
export const StepSlider = memo(function StepSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 15,
  color,
  disabled,
  muted,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  color: string;
  disabled?: boolean;
  muted?: boolean;
}) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const range = max - min;
  const thumb = 26;
  const usable = Math.max(1, w - thumb);

  const pan = useMemo(() => {
    const update = (x: number) => {
      const ratio = Math.max(0, Math.min(1, (x - thumb / 2) / usable));
      const next = Math.round(min + ratio * range);
      if (next !== value) {
        haptic('select');
        onChange(next);
      }
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => update(e.nativeEvent.locationX),
      onPanResponderMove: (e) => update(e.nativeEvent.locationX),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usable, value, disabled, min, range]);

  const left = ((value - min) / range) * usable;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + 1));
        if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - 1));
      }}
      style={{ height: 44, justifyContent: 'center', opacity: disabled ? 0.45 : 1 }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      {...pan.panHandlers}
    >
      <View pointerEvents="none" style={{ height: 8, borderRadius: 4, backgroundColor: c.elevatedHigh, marginHorizontal: thumb / 2 }}>
        <View style={{ width: left, height: 8, borderRadius: 4, backgroundColor: muted ? c.textMuted : color }} />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left,
          width: thumb,
          height: thumb,
          borderRadius: thumb / 2,
          backgroundColor: muted ? c.textMuted : color,
          borderWidth: 3,
          borderColor: c.elevated,
          shadowColor: color,
          shadowOpacity: muted ? 0 : 0.5,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </View>
  );
});
