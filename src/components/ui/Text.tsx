import { memo } from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { textStyles, type Palette, type TextVariant } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export type TextColor = 'primary' | 'secondary' | 'muted' | 'accent' | 'blue' | 'purple' | 'success' | 'warning' | 'danger' | 'onAccent';

const colorKey: Record<TextColor, keyof Palette> = {
  primary: 'text',
  secondary: 'textSecondary',
  muted: 'textMuted',
  accent: 'accent',
  blue: 'blue',
  purple: 'purple',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  onAccent: 'accentOn',
};

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: TextColor;
  align?: TextStyle['textAlign'];
  /** Tabular numerals for aligned figures. */
  tnum?: boolean;
}

/** Typography primitive: Geist for prose, JetBrains Mono for figures/labels (see theme/tokens.ts). */
export const Text = memo(function Text({ variant = 'body', color = 'primary', align, tnum, style, children, ...rest }: AppTextProps) {
  const { c } = useTheme();
  const base = textStyles[variant];
  const upper = base.textTransform === 'uppercase';
  return (
    <RNText
      {...rest}
      allowFontScaling
      maxFontSizeMultiplier={1.3}
      style={[
        { fontFamily: base.fontFamily, fontSize: base.fontSize, lineHeight: base.lineHeight, letterSpacing: base.letterSpacing, color: c[colorKey[color]] },
        align ? { textAlign: align } : null,
        tnum ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    >
      {upper && typeof children === 'string' ? children.toUpperCase() : children}
    </RNText>
  );
});
