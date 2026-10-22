import { memo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { radius, textStyles } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/utils/haptics';
import { Text } from './Text';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  size?: 'md' | 'sm';
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Tactical pill button. Primary = solid Electric Lime, secondary = glass, destructive = danger tint. */
export const Button = memo(function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  fullWidth = true,
  style,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const { c, reduceMotion } = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = disabled || loading;
  const palette = {
    primary: { bg: c.accent, fg: c.accentOn, border: 'transparent' },
    secondary: { bg: c.shimmer, fg: c.text, border: c.borderStrong },
    destructive: { bg: c.dangerSoft, fg: c.danger, border: 'rgba(255,119,132,0.3)' },
    ghost: { bg: 'transparent', fg: c.textSecondary, border: 'transparent' },
  }[variant];
  const height = size === 'sm' ? 38 : 52;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      testID={testID}
      disabled={inactive}
      onPress={() => {
        haptic('light');
        onPress?.();
      }}
      onPressIn={() => {
        if (!reduceMotion) scale.value = withTiming(0.98, { duration: 70 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 100 });
      }}
      style={[
        {
          height,
          borderRadius: radius.pill,
          backgroundColor: palette.bg,
          borderWidth: variant === 'primary' || variant === 'ghost' ? 0 : 1,
          borderColor: palette.border,
          paddingHorizontal: size === 'sm' ? 14 : 22,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: inactive ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        anim,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : icon}
      <Text
        variant="bodyMedium"
        style={{ color: palette.fg, fontFamily: textStyles.h3.fontFamily, fontSize: size === 'sm' ? 14 : 16 }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {!loading && iconRight ? <View>{iconRight}</View> : null}
    </AnimatedPressable>
  );
});
