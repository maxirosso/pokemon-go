import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSettings } from '@/store/settings';
import { darkPalette, lightPalette, type Palette } from './tokens';

export interface Theme {
  c: Palette;
  isDark: boolean;
  reduceMotion: boolean;
}

export function useTheme(): Theme {
  const pref = useSettings((s) => s.theme);
  const motionPref = useSettings((s) => s.reducedMotion);
  const system = useColorScheme();
  const systemReduce = useReducedMotion();
  const isDark = pref === 'system' ? system !== 'light' : pref === 'dark';
  const reduceMotion = motionPref === 'system' ? systemReduce : motionPref === 'on';
  return useMemo(() => ({ c: isDark ? darkPalette : lightPalette, isDark, reduceMotion }), [isDark, reduceMotion]);
}
