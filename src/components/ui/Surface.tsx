import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/utils/haptics';

export interface CardProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 'glow' = focal/active card (lime stroke + soft radiance). */
  variant?: 'default' | 'elevated' | 'glow' | 'outline' | 'danger' | 'warning';
  padded?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Rounded 24px card with hairline stroke and bevel highlight (Midnight Orbit "interactive plane"). */
export const Card = memo(function Card({ children, style, variant = 'default', padded = true, onPress, onLongPress, accessibilityLabel, testID }: CardProps) {
  const { c, reduceMotion } = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const bg = variant === 'elevated' ? c.elevated : c.surface;
  const border =
    variant === 'glow' ? 'rgba(167,243,107,0.3)' : variant === 'danger' ? 'rgba(255,119,132,0.3)' : variant === 'warning' ? 'rgba(255,198,109,0.3)' : c.border;
  const shadow: ViewStyle | null =
    variant === 'glow' ? { shadowColor: c.accent, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 6 } : null;
  const base: StyleProp<ViewStyle> = [
    {
      backgroundColor: variant === 'outline' ? 'transparent' : bg,
      borderRadius: radius.xxl,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: border,
      padding: padded ? 16 : 0,
      overflow: 'hidden',
    },
    shadow,
    style,
  ];
  if (!onPress) return <View style={base} testID={testID}>{children}</View>;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      delayLongPress={350}
      onLongPress={onLongPress}
      onPress={() => {
        haptic('light');
        onPress();
      }}
      onPressIn={() => {
        if (!reduceMotion) scale.value = withTiming(0.985, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 120 });
      }}
      style={[base, anim]}
    >
      {children}
    </AnimatedPressable>
  );
});

export const Divider = memo(function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }, style]} />;
});
