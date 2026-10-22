import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Segmented } from '@/components/ui/Form';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { GOALS, PRIORITY_LEVELS } from '@/constants/goals';
import type { GoalId, GoalWeight } from '@/engine/types';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/utils/haptics';

const levelOf = (w: number) => (PRIORITY_LEVELS.reduce((best, l) => (Math.abs(l.weight - w) < Math.abs(best.weight - w) ? l : best))).label;

/** Multi-select goal matrix with a relative priority per selected goal (blended goals supported). */
export function GoalPicker({ value, onChange }: { value: GoalWeight[]; onChange: (g: GoalWeight[]) => void }) {
  const { c } = useTheme();
  const toggle = (id: GoalId) => {
    haptic('select');
    onChange(value.some((g) => g.goal === id) ? value.filter((g) => g.goal !== id) : [...value, { goal: id, weight: 0.7 }]);
  };
  const setWeight = (id: GoalId, weight: number) => onChange(value.map((g) => (g.goal === id ? { ...g, weight } : g)));
  return (
    <View style={{ gap: 10 }}>
      {GOALS.map((g) => {
        const sel = value.find((x) => x.goal === g.id);
        return (
          <Card key={g.id} variant={sel ? 'glow' : 'default'} padded={false}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!sel }} aria-checked={!!sel} accessibilityLabel={g.label} onPress={() => toggle(g.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
              <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: sel ? c.accent : c.borderStrong, backgroundColor: sel ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {sel ? <Check size={15} color={c.accentOn} strokeWidth={3} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">{g.label}</Text>
                <Text variant="caption" color="muted">
                  {g.description}
                </Text>
              </View>
            </Pressable>
            {sel ? (
              <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 6 }}>
                <Text variant="micro" color="muted">
                  RELATIVE PRIORITY
                </Text>
                <Segmented
                  options={PRIORITY_LEVELS.map((l) => ({ value: l.label, label: l.label }))}
                  value={levelOf(sel.weight)}
                  onChange={(label) => setWeight(g.id, PRIORITY_LEVELS.find((l) => l.label === label)?.weight ?? 0.7)}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}
