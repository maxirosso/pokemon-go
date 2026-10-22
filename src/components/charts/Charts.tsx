import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/useTheme';
import type { IVs } from '@/engine/types';

export const RadialGauge = memo(function RadialGauge({
  value,
  size = 112,
  stroke = 10,
  color,
  children,
  label,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  label?: string;
}) {
  const { c } = useTheme();
  const r = (size - stroke) / 2;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const col = color ?? c.accent;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={value === null ? undefined : { min: 0, max: 100, now: Math.round(value) }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.elevatedHigh} strokeWidth={stroke} fill="none" />
        {value !== null && pct > 0 ? <Path d={arcPath(size / 2, size / 2, r, 0, Math.min(359.9, 360 * pct))} stroke={col} strokeWidth={stroke} strokeLinecap="round" fill="none" /> : null}
      </Svg>
      {children}
    </View>
  );
});

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(endDeg));
  const y2 = cy + r * Math.sin(rad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/** 240° arc used for the Pokémon level dial (level / max level). */
export const LevelArc = memo(function LevelArc({ level, max = 50, width = 280, children }: { level: number | null; max?: number; width?: number; children?: ReactNode }) {
  const { c } = useTheme();
  const h = width * 0.62;
  const r = width / 2 - 14;
  const start = -120;
  const sweep = 240;
  const pct = level === null ? 0 : Math.max(0, Math.min(1, level / max));
  return (
    <View style={{ width, height: h, alignItems: 'center' }}>
      <Svg width={width} height={h}>
        <Defs>
          <LinearGradient id="lvl" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={c.accent} stopOpacity="0.5" />
            <Stop offset="1" stopColor={c.accent} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Path d={arcPath(width / 2, width / 2, r, start, start + sweep)} stroke={c.elevatedHigh} strokeWidth={10} strokeLinecap="round" fill="none" />
        {level !== null ? <Path d={arcPath(width / 2, width / 2, r, start, start + sweep * pct)} stroke="url(#lvl)" strokeWidth={10} strokeLinecap="round" fill="none" /> : null}
      </Svg>
      <View style={{ position: 'absolute', bottom: 0, alignItems: 'center' }}>{children}</View>
    </View>
  );
});

/** Segmented IV telemetry: three blocks per stat (5 IV points each). Maxed stats glow lime. */
export const IvBars = memo(function IvBars({ ivs, compact }: { ivs: IVs | null; compact?: boolean }) {
  const { c } = useTheme();
  const rows: { key: keyof IVs; label: string }[] = [
    { key: 'atk', label: 'ATK' },
    { key: 'def', label: 'DEF' },
    { key: 'sta', label: 'HP' },
  ];
  return (
    <View style={{ gap: compact ? 5 : 9 }} accessible accessibilityLabel={ivs ? `IVs ${ivs.atk} ${ivs.def} ${ivs.sta}` : 'IVs unknown'}>
      {rows.map((r) => {
        const v = ivs ? ivs[r.key] : null;
        return (
          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="micro" color="muted" style={{ width: compact ? 24 : 34 }}>
              {r.label}
            </Text>
            <View style={{ flex: 1, flexDirection: 'row', gap: 3 }}>
              {[0, 1, 2].map((i) => {
                const fill = v === null ? 0 : Math.max(0, Math.min(1, (v - i * 5) / 5));
                const maxed = v === 15;
                return (
                  <View key={i} style={{ flex: 1, height: compact ? 4 : 7, borderRadius: 3, backgroundColor: c.elevatedHigh, overflow: 'hidden' }}>
                    <View style={{ width: `${fill * 100}%`, height: '100%', backgroundColor: maxed ? c.accent : c.text, borderRadius: 3 }} />
                  </View>
                );
              })}
            </View>
            <Text variant="numSm" color={v === 15 ? 'accent' : v === null ? 'muted' : 'primary'} style={{ width: 22, textAlign: 'right' }}>
              {v ?? '?'}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

/** Horizontal bar used for base stats / comparisons. `value` relative to `max`. */
export const StatBar = memo(function StatBar({ label, value, max, color, right }: { label: string; value: number; max: number; color?: string; right?: string }) {
  const { c } = useTheme();
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text variant="micro" color="muted" style={{ width: 42 }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c.elevatedHigh, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: color ?? c.blue, borderRadius: 4 }} />
      </View>
      <Text variant="numSm" style={{ width: 56, textAlign: 'right' }}>
        {right ?? Math.round(value)}
      </Text>
    </View>
  );
});

/** Tiny bar chart for per-type coverage etc. */
export const MiniBars = memo(function MiniBars({ values, colors, height = 40, max = 100 }: { values: (number | null)[]; colors?: string[]; height?: number; max?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, height: v === null ? 3 : Math.max(3, (v / max) * height), borderRadius: 2, backgroundColor: v === null ? c.elevatedHigh : colors?.[i] ?? c.accent, opacity: v === null ? 0.7 : 1 }} />
      ))}
    </View>
  );
});
