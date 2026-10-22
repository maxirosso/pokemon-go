import { memo } from 'react';
import { View } from 'react-native';
import { ProgressBar } from '@/components/ui/Form';
import { Pill } from '@/components/ui/Pill';
import { Text } from '@/components/ui/Text';
import { ROLE_LABEL, type Cost, type RoleId, type RoleRating } from '@/engine/recommendations/types';
import { useTheme } from '@/theme/useTheme';
import { fmtInt } from '@/utils/format';
import { TierBadge } from './Badges';

const BASIS_LABEL = { simulation: 'MODEL', provider: 'PVPOKE', estimate: 'ESTIMATE' } as const;

/** One role row: tier badge, now → potential bar, evidence line and provenance. */
export const RatingRow = memo(function RatingRow({ rating, label }: { rating: RoleRating; label?: string }) {
  const { c } = useTheme();
  const pot = rating.potential;
  const now = rating.now;
  const color = pot === null ? c.textMuted : pot >= 94 || (rating.basis === 'provider' && pot >= 78) ? c.accent : pot >= 70 ? c.blue : pot >= 50 ? c.warning : c.textMuted;
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${label ?? ROLE_LABEL[rating.role]} rating ${pot ?? 'unavailable'}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="bodyMedium">{label ?? ROLE_LABEL[rating.role]}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pill label={BASIS_LABEL[rating.basis]} />
          <TierBadge tier={rating.tier} />
        </View>
      </View>
      {pot !== null ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <ProgressBar value={pot / 100} height={8} label={`${label ?? ROLE_LABEL[rating.role]} potential`} />
              {now !== null ? (
                <View style={{ position: 'absolute', left: `${Math.min(99, Math.max(0, now))}%`, top: -2, width: 3, height: 12, borderRadius: 2, backgroundColor: c.text }} />
              ) : null}
            </View>
            <Text variant="numSm" style={{ width: 60, textAlign: 'right', color }}>
              {rating.potentialRange ? `${rating.potentialRange.low}–${rating.potentialRange.high}` : pot}
              <Text variant="caption" color="muted">
                /100
              </Text>
            </Text>
          </View>
          <Text variant="caption" color="muted">
            {now !== null ? `Now ${now} · ` : ''}
            {rating.detail}
            {rating.uncertain ? ' · uncertain (IVs/level not fully known)' : ''}
          </Text>
        </>
      ) : (
        <Text variant="caption" color="muted">
          {rating.detail}
        </Text>
      )}
    </View>
  );
});

/** Resource cost with colour-coded affordability. */
export const CostMatrix = memo(function CostMatrix({ cost, affordable }: { cost: Cost; affordable: boolean | null }) {
  const { c } = useTheme();
  const color = affordable === true ? c.success : affordable === false ? c.danger : c.textSecondary;
  const items: { label: string; value: string }[] = [];
  if (cost.stardust) items.push({ label: 'STARDUST', value: fmtInt(cost.stardust) });
  if (cost.candy) items.push({ label: 'CANDY', value: fmtInt(cost.candy) });
  if (cost.xlCandy) items.push({ label: 'CANDY XL', value: fmtInt(cost.xlCandy) });
  for (const e of cost.extras) items.push({ label: 'REQUIRES', value: e });
  if (items.length === 0) return null;
  return (
    <View style={{ backgroundColor: c.canvas, borderRadius: 14, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="micro" color="muted">
          COST MATRIX
        </Text>
        <Text variant="micro" style={{ color }}>
          {affordable === true ? 'AFFORDABLE' : affordable === false ? 'NOT ENOUGH YET' : 'ENTER RESOURCES TO CHECK'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {items.map((i, idx) => (
          <View key={`${i.label}-${idx}`} style={{ gap: 2 }}>
            <Text variant="micro" color="muted">
              {i.label}
            </Text>
            <Text variant="numMd" style={{ color }}>
              {i.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

export function KeyValue({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'warning' | 'danger' | 'success' | 'primary' }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 }}>
      <Text variant="small" color="secondary">
        {label}
      </Text>
      <Text variant="numSm" color={tone ?? 'primary'} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

export type { RoleId };
