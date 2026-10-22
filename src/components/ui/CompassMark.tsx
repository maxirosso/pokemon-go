import { memo } from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useTheme } from '@/theme/useTheme';

const rot = (cx: number, cy: number, x: number, y: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
};

/** Brand mark (compass). Geometry is pre-rotated (no SVG transforms) so it renders identically on native and web. */
export const CompassMark = memo(function CompassMark({ size = 96 }: { size?: number }) {
  const { c } = useTheme();
  const needle = (pts: [number, number][]) => pts.map(([x, y]) => rot(50, 50, x, y, 35)).map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + ' Z';
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="38" stroke={c.accent} strokeWidth="4.5" fill="none" />
      <Line x1="50" y1="6" x2="50" y2="16" stroke={c.accent} strokeWidth="4" strokeLinecap="round" />
      <Line x1="50" y1="84" x2="50" y2="94" stroke={c.accent} strokeWidth="4" strokeLinecap="round" />
      <Line x1="6" y1="50" x2="16" y2="50" stroke={c.accent} strokeWidth="4" strokeLinecap="round" />
      <Line x1="84" y1="50" x2="94" y2="50" stroke={c.accent} strokeWidth="4" strokeLinecap="round" />
      <Path d={needle([[50, 18], [58, 50], [42, 50]])} fill={c.accent} />
      <Path d={needle([[50, 82], [58, 50], [42, 50]])} fill={c.text} />
      <Circle cx="50" cy="50" r="4" fill={c.background} />
    </Svg>
  );
});
