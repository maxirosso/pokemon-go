import { memo, useEffect, type ReactNode } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { CircleAlert } from 'lucide-react-native';
import { useTheme } from '@/theme/useTheme';
import { Button } from './Button';
import { Card } from './Surface';
import { Text } from './Text';

export const Skeleton = memo(function Skeleton({ width = '100%', height = 16, radius = 8, style }: { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { c, reduceMotion } = useTheme();
  const o = useSharedValue(0.5);
  useEffect(() => {
    if (reduceMotion) return;
    o.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [o, reduceMotion]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View accessibilityLabel="Loading" style={[{ width, height, borderRadius: radius, backgroundColor: c.elevatedHigh }, anim, style]} />;
});

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card style={{ gap: 12 }}>
      <Skeleton width="45%" height={14} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === rows - 1 ? '60%' : '100%'} />
      ))}
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 12 }}>
      <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <Text variant="h3" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="small" color="secondary" align="center">
          {body}
        </Text>
      ) : null}
      {actionLabel ? <Button label={actionLabel} onPress={onAction} fullWidth={false} style={{ marginTop: 8, minWidth: 200 }} /> : null}
      {secondaryLabel ? <Button label={secondaryLabel} variant="ghost" onPress={onSecondary} fullWidth={false} /> : null}
    </View>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  const { c } = useTheme();
  return (
    <Card variant="danger" style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <CircleAlert size={20} color={c.danger} />
        <Text variant="h3" color="danger">
          {title}
        </Text>
      </View>
      {message ? (
        <Text variant="small" color="secondary">
          {message}
        </Text>
      ) : null}
      {onRetry ? <Button label="Retry" variant="secondary" size="sm" fullWidth={false} onPress={onRetry} /> : null}
    </Card>
  );
}

/** Small inline note (info / warning) used for data-freshness and uncertainty disclosures. */
export function Note({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  const { c } = useTheme();
  const bg = tone === 'warning' ? c.warningSoft : c.blueSoft;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 12, padding: 12 }}>
      <Text variant="small" color={tone === 'warning' ? 'warning' : 'blue'}>
        {children}
      </Text>
    </View>
  );
}
