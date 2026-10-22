import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import type { TypeCoverageEntry } from '@/engine/recommendations/types';
import { typeColors } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/** 18-type raid-attacker coverage. Cell intensity = best owned attacker's current score; empty = none owned. */
export const TypeCoverageGrid = memo(function TypeCoverageGrid({ coverage, onPress }: { coverage: TypeCoverageEntry[]; onPress?: (e: TypeCoverageEntry) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {coverage.map((e) => {
        const color = typeColors[e.type];
        const score = e.best ? (e.best.now ?? Math.round(e.best.potential * 0.5)) : null;
        const alpha = score === null ? 0 : Math.max(0.15, Math.min(0.9, score / 100));
        return (
          <Pressable
            key={e.type}
            accessibilityRole="button"
            accessibilityLabel={`${e.type}: ${e.best ? `best attacker scores ${score}` : 'no attacker'}`}
            onPress={() => onPress?.(e)}
            style={{ width: '15.6%', aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: score === null ? c.canvas : `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`, borderWidth: 1, borderColor: score === null ? c.border : color }}
          >
            <Text variant="micro" style={{ color: score === null ? c.textMuted : alpha > 0.5 ? '#080B12' : c.text, fontSize: 8 }}>
              {e.type.slice(0, 4)}
            </Text>
            <Text variant="numSm" style={{ color: score === null ? c.textMuted : alpha > 0.5 ? '#080B12' : c.text, fontSize: 12 }}>
              {score === null ? '—' : score}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});
