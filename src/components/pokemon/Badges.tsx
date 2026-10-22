import { memo } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Pill } from '@/components/ui/Pill';
import type { PokemonType } from '@/engine/types';
import type { Tier, VerdictAction } from '@/engine/recommendations/types';
import { VERDICT_LABEL } from '@/engine/recommendations/types';
import { typeColors } from '@/theme/tokens';

const ABBR: Record<PokemonType, string> = {
  Normal: 'NORM',
  Fire: 'FIRE',
  Water: 'WATER',
  Electric: 'ELEC',
  Grass: 'GRASS',
  Ice: 'ICE',
  Fighting: 'FIGHT',
  Poison: 'POIS',
  Ground: 'GRND',
  Flying: 'FLY',
  Psychic: 'PSYCH',
  Bug: 'BUG',
  Rock: 'ROCK',
  Ghost: 'GHOST',
  Dragon: 'DRAG',
  Dark: 'DARK',
  Steel: 'STEEL',
  Fairy: 'FAIRY',
};

/** Type affinity badge: 15 % tinted surface, solid type-coloured label. */
export const TypeBadge = memo(function TypeBadge({ type, compact }: { type: PokemonType; compact?: boolean }) {
  const color = typeColors[type];
  return (
    <View
      accessible
      accessibilityLabel={`${type} type`}
      style={{ height: compact ? 18 : 22, borderRadius: 6, paddingHorizontal: compact ? 5 : 8, backgroundColor: `${color}26`, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}
    >
      {!compact ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} /> : null}
      <Text variant="micro" style={{ color, fontSize: compact ? 9 : 10 }}>
        {compact ? ABBR[type] : type}
      </Text>
    </View>
  );
});

export const TypeRow = memo(function TypeRow({ types, compact }: { types: PokemonType[]; compact?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: compact ? 4 : 6 }}>
      {types.map((t) => (
        <TypeBadge key={t} type={t} compact={compact} />
      ))}
    </View>
  );
});

const TIER_TONE: Record<Tier, 'accent' | 'blue' | 'purple' | 'warning' | 'neutral'> = { S: 'accent', A: 'blue', B: 'purple', C: 'warning', D: 'neutral' };

export const TierBadge = memo(function TierBadge({ tier, label }: { tier: Tier | null; label?: string }) {
  if (!tier) return <Pill label={label ?? 'N/A'} tone="neutral" />;
  return <Pill label={label ?? `${tier} TIER`} tone={TIER_TONE[tier]} />;
});

const ACTION_TONE: Record<VerdictAction, 'accent' | 'blue' | 'purple' | 'warning' | 'danger' | 'neutral'> = {
  POWER_UP: 'accent',
  EVOLVE: 'accent',
  KEEP: 'neutral',
  SAVE_FOR_PVP: 'blue',
  CHANGE_MOVES: 'purple',
  WAIT_FOR_EVENT: 'warning',
  DONT_INVEST: 'danger',
  CONSIDER_TRANSFER: 'danger',
  MORE_INFO: 'neutral',
};

export const VerdictPill = memo(function VerdictPill({ action, label }: { action: VerdictAction; label?: string }) {
  return <Pill label={label ?? VERDICT_LABEL[action]} tone={ACTION_TONE[action]} />;
});

export function verdictTone(action: VerdictAction) {
  return ACTION_TONE[action];
}
