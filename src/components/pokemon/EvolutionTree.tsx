import { memo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { describeRequirements, type EvolutionNode } from '@/engine/evolution/evolution';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import type { EvolutionEdge } from '@/engine/types';
import { useTheme } from '@/theme/useTheme';
import { TypeRow } from './Badges';
import { PokemonImage } from './PokemonImage';

const Node = memo(function Node({ node, highlightKey, onPress }: { node: EvolutionNode; highlightKey?: string; onPress?: (key: string) => void }) {
  const { c } = useTheme();
  const active = node.species.key === highlightKey;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={speciesDisplayName(node.species)}
      onPress={() => onPress?.(node.species.key)}
      style={{ width: 112, alignItems: 'center', gap: 4, padding: 8, borderRadius: 18, backgroundColor: active ? c.accentSoft : c.surface, borderWidth: 1, borderColor: active ? c.accent : c.border }}
    >
      <PokemonImage speciesId={node.species.speciesId} form={node.species.form} size={64} />
      <Text variant="small" numberOfLines={1} style={{ fontFamily: 'Geist_600SemiBold' }}>
        {speciesDisplayName(node.species)}
      </Text>
      <TypeRow types={node.species.types} compact />
    </Pressable>
  );
});

function EdgeLabel({ edge }: { edge: EvolutionEdge }) {
  const { c } = useTheme();
  const reqs = describeRequirements(edge);
  return (
    <View style={{ alignItems: 'center', width: 78, gap: 2 }}>
      <ArrowRight size={16} color={c.textMuted} />
      {reqs.slice(0, 3).map((r, i) => (
        <Text key={i} variant="caption" color="muted" align="center" style={{ fontSize: 10, lineHeight: 12 }} numberOfLines={2}>
          {r}
        </Text>
      ))}
    </View>
  );
}

function Branch({ node, highlightKey, onPress }: { node: EvolutionNode; highlightKey?: string; onPress?: (key: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Node node={node} highlightKey={highlightKey} onPress={onPress} />
      {node.children.length > 0 ? (
        <View style={{ gap: 10 }}>
          {node.children.map(({ edge, node: child }) => (
            <View key={child.species.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <EdgeLabel edge={edge} />
              <Branch node={child} highlightKey={highlightKey} onPress={onPress} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Full evolution family (branches included), horizontally scrollable. Requirements come from provider data. */
export const EvolutionTree = memo(function EvolutionTree({ root, highlightKey, onPress }: { root: EvolutionNode; highlightKey?: string; onPress?: (key: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
      <Branch node={root} highlightKey={highlightKey} onPress={onPress} />
    </ScrollView>
  );
});
