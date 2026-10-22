import { FlashList } from '@shopify/flash-list';
import { Search, X } from 'lucide-react-native';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Field } from '@/components/ui/Form';
import { EmptyState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Surface';
import { normalizeName, speciesDisplayName } from '@/engine/reference/referenceData';
import type { GoSpecies, PokemonType } from '@/engine/types';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';
import { TypeRow } from './Badges';
import { PokemonImage } from './PokemonImage';

const SpeciesRow = memo(function SpeciesRow({ species, onPress, trailing }: { species: GoSpecies; onPress: (s: GoSpecies) => void; trailing?: (s: GoSpecies) => React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ paddingVertical: 4 }}>
      <Card onPress={() => onPress(species)} padded={false} accessibilityLabel={`${speciesDisplayName(species)}, number ${species.speciesId}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
          <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>
            <PokemonImage speciesId={species.speciesId} form={species.form} size={46} kind="sprite" />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="h3" numberOfLines={1}>
              {speciesDisplayName(species)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="numSm" color="muted">
                #{String(species.speciesId).padStart(3, '0')}
              </Text>
              <TypeRow types={species.types} compact />
            </View>
          </View>
          {trailing ? trailing(species) : null}
        </View>
      </Card>
    </View>
  );
});

/** Searchable Pokédex selector: name, number, type or "gen3". */
export function SpeciesList({
  onSelect,
  trailing,
  filter,
  header,
  initialQuery = '',
}: {
  onSelect: (s: GoSpecies) => void;
  trailing?: (s: GoSpecies) => React.ReactNode;
  filter?: (s: GoSpecies) => boolean;
  header?: React.ReactNode;
  initialQuery?: string;
}) {
  const { c } = useTheme();
  const ref = useReference((s) => s.ref);
  const [q, setQ] = useState(initialQuery);
  const all = useMemo(() => ref.listSpecies(), [ref]);
  const results = useMemo(() => {
    const base = filter ? all.filter(filter) : all;
    const query = q.trim().toLowerCase();
    if (!query) return base;
    const num = /^#?(\d{1,4})$/.exec(query);
    if (num) return base.filter((s) => s.speciesId === Number(num[1]));
    const gen = /^gen\s?(\d)$/.exec(query);
    if (gen) return base.filter((s) => s.generation === Number(gen[1]));
    const norm = normalizeName(query);
    return base.filter(
      (s) => normalizeName(speciesDisplayName(s)).includes(norm) || s.types.some((t: PokemonType) => t.toLowerCase() === query),
    );
  }, [all, q, filter]);
  const render = useCallback(({ item }: { item: GoSpecies }) => <SpeciesRow species={item} onPress={onSelect} trailing={trailing} />, [onSelect, trailing]);
  return (
    <View style={{ flex: 1, gap: 10 }}>
      <Field
        value={q}
        onChangeText={setQ}
        placeholder="Search name, #, type or gen3"
        autoCapitalize="none"
        autoCorrect={false}
        left={<Search size={18} color={c.textMuted} />}
        right={q ? <Pressable hitSlop={10} accessibilityLabel="Clear search" onPress={() => setQ('')}><X size={18} color={c.textMuted} /></Pressable> : undefined}
      />
      {header}
      {results.length === 0 ? (
        <EmptyState icon={<Search size={28} color={c.accent} />} title="No species found" body="Try the Pokédex number or a different spelling." />
      ) : (
        <FlashList data={results} renderItem={render} keyExtractor={(s) => s.key} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} />
      )}
    </View>
  );
}
