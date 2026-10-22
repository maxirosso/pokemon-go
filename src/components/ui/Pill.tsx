import { memo, type ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/utils/haptics';
import { Text, type TextColor } from './Text';

type Tone = 'neutral' | 'accent' | 'blue' | 'purple' | 'success' | 'warning' | 'danger';

export function useTone(tone: Tone) {
  const { c } = useTheme();
  switch (tone) {
    case 'accent':
      return { fg: c.accent, bg: c.accentSoft, color: 'accent' as TextColor };
    case 'blue':
      return { fg: c.blue, bg: c.blueSoft, color: 'blue' as TextColor };
    case 'purple':
      return { fg: c.purple, bg: c.purpleSoft, color: 'purple' as TextColor };
    case 'success':
      return { fg: c.success, bg: c.successSoft, color: 'success' as TextColor };
    case 'warning':
      return { fg: c.warning, bg: c.warningSoft, color: 'warning' as TextColor };
    case 'danger':
      return { fg: c.danger, bg: c.dangerSoft, color: 'danger' as TextColor };
    default:
      return { fg: c.textSecondary, bg: c.shimmer, color: 'secondary' as TextColor };
  }
}

export interface PillProps {
  label: string;
  tone?: Tone;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Small uppercase telemetry badge (default) vs. regular-case chip. */
  micro?: boolean;
}

/** Status/verdict/league badge. Surfaces are tinted at ~12 % with solid-coloured text. */
export const Pill = memo(function Pill({ label, tone = 'neutral', icon, style, micro = true }: PillProps) {
  const t = useTone(tone);
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: t.bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
        style,
      ]}
    >
      {icon}
      <Text variant={micro ? 'micro' : 'small'} color={t.color} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
});

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: Tone;
  icon?: ReactNode;
  count?: number;
  accessibilityLabel?: string;
}

/** Selectable filter chip. */
export const Chip = memo(function Chip({ label, selected, onPress, tone = 'accent', icon, count, accessibilityLabel }: ChipProps) {
  const { c } = useTheme();
  const t = useTone(tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => {
        haptic('select');
        onPress?.();
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 36,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        backgroundColor: selected ? t.bg : c.surface,
        borderWidth: 1,
        borderColor: selected ? t.fg : c.border,
      }}
    >
      {icon}
      <Text variant="small" color={selected ? t.color : 'secondary'} style={{ fontFamily: 'Geist_500Medium' }}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text variant="numSm" color={selected ? t.color : 'muted'}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
});
