import type { PokemonType } from '@/engine/types';

/**
 * Design tokens — "Midnight Orbit" (see the Stitch wireframes in /stitch_go_compass_companion_app).
 * Deep-space surfaces, hairline strokes, Electric Lime / Orbital Blue / Cosmic Purple accents.
 * Brand name lives in src/constants/brand.ts so the app can be re-branded in one place.
 */

export interface Palette {
  background: string;
  canvas: string;
  surface: string;
  elevated: string;
  elevatedHigh: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  accentOn: string;
  blue: string;
  blueSoft: string;
  purple: string;
  purpleSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
  dock: string;
  shimmer: string;
  glow: string;
}

export const darkPalette: Palette = {
  background: '#080B12',
  canvas: '#101521',
  surface: '#151B2A',
  elevated: '#1D2536',
  elevatedHigh: '#252F44',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#F6F8FC',
  textSecondary: '#A3AEC4',
  textMuted: '#657187',
  accent: '#A7F36B',
  accentSoft: 'rgba(167,243,107,0.12)',
  accentOn: '#080B12',
  blue: '#86A9FF',
  blueSoft: 'rgba(134,169,255,0.12)',
  purple: '#AA92FF',
  purpleSoft: 'rgba(170,146,255,0.12)',
  success: '#57D7A1',
  successSoft: 'rgba(87,215,161,0.12)',
  warning: '#FFC66D',
  warningSoft: 'rgba(255,198,109,0.12)',
  danger: '#FF7784',
  dangerSoft: 'rgba(255,119,132,0.12)',
  overlay: 'rgba(4,6,10,0.72)',
  dock: 'rgba(29,37,54,0.92)',
  shimmer: 'rgba(255,255,255,0.06)',
  glow: 'rgba(167,243,107,0.25)',
};

export const lightPalette: Palette = {
  background: '#F3F5FA',
  canvas: '#E9EDF5',
  surface: '#FFFFFF',
  elevated: '#F7F9FD',
  elevatedHigh: '#E6EBF4',
  border: 'rgba(14,19,32,0.09)',
  borderStrong: 'rgba(14,19,32,0.18)',
  text: '#0E1320',
  textSecondary: '#455068',
  textMuted: '#7B879D',
  accent: '#3F8F00',
  accentSoft: 'rgba(63,143,0,0.10)',
  accentOn: '#FFFFFF',
  blue: '#2F5FD0',
  blueSoft: 'rgba(47,95,208,0.10)',
  purple: '#6847D0',
  purpleSoft: 'rgba(104,71,208,0.10)',
  success: '#157F57',
  successSoft: 'rgba(21,127,87,0.10)',
  warning: '#9A6200',
  warningSoft: 'rgba(154,98,0,0.12)',
  danger: '#C62E41',
  dangerSoft: 'rgba(198,46,65,0.10)',
  overlay: 'rgba(14,19,32,0.45)',
  dock: 'rgba(255,255,255,0.94)',
  shimmer: 'rgba(14,19,32,0.06)',
  glow: 'rgba(63,143,0,0.20)',
};

export const typeColors: Record<PokemonType, string> = {
  Normal: '#B5B9C4',
  Fire: '#FF6B4A',
  Water: '#53A4FF',
  Electric: '#FFD84A',
  Grass: '#5CD67A',
  Ice: '#7FE3E8',
  Fighting: '#E4573D',
  Poison: '#B565D9',
  Ground: '#D9B35F',
  Flying: '#8DA8FF',
  Psychic: '#FF6FA8',
  Bug: '#A3C93A',
  Rock: '#BFA970',
  Ghost: '#8B6FD6',
  Dragon: '#7E6BFF',
  Dark: '#8A7B73',
  Steel: '#8FA0B5',
  Fairy: '#F5A0DD',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 6, md: 12, lg: 16, xl: 20, xxl: 24, pill: 999 } as const;

export const fontFamily = {
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemi: 'Geist_600SemiBold',
  sansBold: 'Geist_700Bold',
  mono: 'JetBrainsMono_500Medium',
  monoSemi: 'JetBrainsMono_600SemiBold',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodyMedium'
  | 'small'
  | 'caption'
  | 'numLg'
  | 'numMd'
  | 'numSm'
  | 'label'
  | 'micro';

export const textStyles: Record<TextVariant, { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing?: number; textTransform?: 'uppercase' }> = {
  display: { fontFamily: fontFamily.sansBold, fontSize: 44, lineHeight: 48, letterSpacing: -1.6 },
  h1: { fontFamily: fontFamily.sansSemi, fontSize: 30, lineHeight: 36, letterSpacing: -0.9 },
  h2: { fontFamily: fontFamily.sansSemi, fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  h3: { fontFamily: fontFamily.sansSemi, fontSize: 17, lineHeight: 23, letterSpacing: -0.2 },
  body: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fontFamily.sansMedium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fontFamily.sans, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 16 },
  numLg: { fontFamily: fontFamily.monoBold, fontSize: 28, lineHeight: 32, letterSpacing: -0.6 },
  numMd: { fontFamily: fontFamily.monoSemi, fontSize: 18, lineHeight: 22, letterSpacing: -0.2 },
  numSm: { fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 17 },
  label: { fontFamily: fontFamily.mono, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textTransform: 'uppercase' },
  micro: { fontFamily: fontFamily.monoSemi, fontSize: 10, lineHeight: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
};
