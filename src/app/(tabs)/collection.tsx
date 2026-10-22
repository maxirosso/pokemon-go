import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ArrowUpDown, Grid2x2, List, Plus, Search, SlidersHorizontal, Trash2, X, Heart, Tag } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PokemonCard, PokemonRow } from '@/components/pokemon/PokemonCard';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Form';
import { Chip } from '@/components/ui/Pill';
import { DOCK_HEIGHT, IconButton } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState, Note } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { activeFilterCount, applyFilters, SORT_OPTIONS, sortPokemon } from '@/features/collection/filtering';
import { useScores } from '@/features/collection/useScores';
import { useT } from '@/i18n';
import type { OwnedPokemon } from '@/engine/types';
import { useCollectionView } from '@/store/collectionView';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/utils/haptics';

const QUICK: { label: string; q: string }[] = [
  { label: 'Perfect', q: '4*' },
  { label: 'Shiny', q: 'shiny' },
  { label: 'Shadow', q: 'shadow' },
  { label: 'Legendary', q: 'legendary' },
  { label: 'Favorites', q: 'favorite' },
  { label: 'Need IVs', q: 'ivunknown' },
];

export default function CollectionScreen() {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const pokemon = useData((s) => s.pokemon);
  const toggleFavorite = useData((s) => s.toggleFavorite);
  const deletePokemon = useData((s) => s.deletePokemon);
  const restorePokemon = useData((s) => s.restorePokemon);
  const updatePokemon = useData((s) => s.updatePokemon);
  const ref = useReference((s) => s.ref);
  const { filters, sort, mode, setFilters, setSort, setMode, resetFilters } = useCollectionView();
  const scores = useScores();
  const [sortOpen, setSortOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagOpen, setTagOpen] = useState(false);
  const [tagText, setTagText] = useState('');

  useEffect(() => {
    if (typeof params.q === 'string') setFilters({ query: params.q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  const result = useMemo(() => applyFilters(pokemon, ref, filters, scores), [pokemon, ref, filters, scores]);
  const sorted = useMemo(() => sortPokemon(result.list, ref, sort, scores), [result.list, ref, sort, scores]);
  const count = activeFilterCount(filters);
  const selecting = selected.size > 0;

  const open = useCallback((p: OwnedPokemon) => {
    if (selecting) {
      haptic('select');
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(p.id)) n.delete(p.id);
        else n.add(p.id);
        return n;
      });
      return;
    }
    router.push(`/pokemon/${p.id}` as Href);
  }, [selecting]);

  const onLong = useCallback((p: OwnedPokemon) => {
    haptic('medium');
    setSelected((s) => new Set(s).add(p.id));
  }, []);

  const onFav = useCallback((p: OwnedPokemon) => void toggleFavorite(p.id), [toggleFavorite]);

  const renderItem = useCallback(
    ({ item }: { item: OwnedPokemon }) => {
      const species = ref.getSpecies(item.speciesId, item.form);
      if (!species) return null;
      const verdict = scores?.get(item.id)?.verdict ?? null;
      const Cmp = mode === 'grid' ? PokemonCard : PokemonRow;
      return (
        <View style={{ padding: 5 }}>
          <Cmp pokemon={item} species={species} verdict={verdict} onPress={open} onToggleFavorite={onFav} onLongPress={onLong} selected={selected.has(item.id)} />
        </View>
      );
    },
    [ref, scores, mode, open, onFav, onLong, selected],
  );

  const confirmDelete = () => {
    const ids = [...selected];
    Alert.alert(`Delete ${ids.length} Pokémon?`, 'They are removed from your collection. You can undo right after.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          for (const id of ids) await deletePokemon(id);
          setSelected(new Set());
          toast.info(`Deleted ${ids.length} Pokémon`, { actionLabel: 'Undo', onAction: () => ids.forEach((id) => void restorePokemon(id)) });
        },
      },
    ]);
  };

  const applyTag = async () => {
    const tag = tagText.trim();
    if (!tag) return;
    for (const id of selected) {
      const p = pokemon.find((x) => x.id === id);
      if (p && !p.tags.includes(tag)) await updatePokemon(id, { tags: [...p.tags, tag] });
    }
    toast.success(`Tagged ${selected.size} Pokémon “${tag}”`);
    setTagOpen(false);
    setTagText('');
    setSelected(new Set());
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text variant="micro" color="muted">
              GO COMPASS
            </Text>
            <Text variant="h1" accessibilityRole="header">
              {t('collection.title')}
            </Text>
          </View>
          <Text variant="numSm" color="secondary">
            {sorted.length === pokemon.length ? `${pokemon.length} Pokémon` : `${sorted.length} of ${pokemon.length}`}
          </Text>
        </View>
        <Field
          value={filters.query}
          onChangeText={(q) => setFilters({ query: q })}
          placeholder={t('collection.searchPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          left={<Search size={18} color={c.textMuted} />}
          right={filters.query ? <Pressable accessibilityLabel="Clear search" hitSlop={10} onPress={() => setFilters({ query: '' })}><X size={18} color={c.textMuted} /></Pressable> : undefined}
        />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('collection.filters')} onPress={() => router.push('/filters')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: count ? c.accentSoft : c.surface, borderWidth: 1, borderColor: count ? c.accent : c.border }}>
            <SlidersHorizontal size={16} color={count ? c.accent : c.textSecondary} />
            <Text variant="small" color={count ? 'accent' : 'secondary'}>
              {t('collection.filters')}{count ? ` · ${count}` : ''}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('collection.sort')} onPress={() => setSortOpen(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
            <ArrowUpDown size={16} color={c.textSecondary} />
            <Text variant="small" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
              {SORT_OPTIONS.find((o) => o.key === sort)?.label}
            </Text>
          </Pressable>
          <IconButton label={mode === 'grid' ? 'Switch to list' : 'Switch to grid'} onPress={() => setMode(mode === 'grid' ? 'list' : 'grid')} size={38}>
            {mode === 'grid' ? <List size={18} color={c.textSecondary} /> : <Grid2x2 size={18} color={c.textSecondary} />}
          </IconButton>
        </View>
        <View style={{ height: 36 }}>
          <FlashList
            horizontal
            data={QUICK}
            keyExtractor={(q) => q.q}
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
            renderItem={({ item }) => <Chip label={item.label} selected={filters.query === item.q} onPress={() => setFilters({ query: filters.query === item.q ? '' : item.q })} />}
          />
        </View>
        {result.errors.length > 0 ? (
          <Note tone="warning">
            Search syntax problem: {result.errors[0]} Use & for AND, “,” for OR and ! for NOT — e.g. fire&4*, water,ice, !shiny, cp1500-, iv90-.
          </Note>
        ) : result.warnings.length > 0 ? (
          <Note>{result.warnings[0]}</Note>
        ) : null}
      </View>

      <View style={{ flex: 1, paddingHorizontal: 11, marginTop: 8 }}>
        {sorted.length === 0 ? (
          <EmptyState
            icon={<Search size={30} color={c.accent} />}
            title={pokemon.length === 0 ? 'No Pokémon yet' : t('collection.empty')}
            body={pokemon.length === 0 ? 'Add your first Pokémon or import screenshots, CSV or JSON.' : 'Try clearing a filter or simplifying the search.'}
            actionLabel={pokemon.length === 0 ? t('collection.add') : 'Clear filters & search'}
            onAction={() => (pokemon.length === 0 ? router.push('/pokemon/add') : resetFilters())}
          />
        ) : (
          <FlashList
            key={mode}
            data={sorted}
            numColumns={mode === 'grid' ? 2 : 1}
            keyExtractor={(p) => p.id}
            renderItem={renderItem}
            extraData={[selected, mode, scores]}
            contentContainerStyle={{ paddingBottom: DOCK_HEIGHT + insets.bottom + 90 }}
            showsVerticalScrollIndicator={false}
            drawDistance={600}
          />
        )}
      </View>

      {selecting ? (
        <Animated.View entering={FadeIn.duration(150)} style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + DOCK_HEIGHT - 30, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.elevatedHigh, borderRadius: 24, padding: 10, borderWidth: 1, borderColor: c.borderStrong }}>
          <IconButton label="Clear selection" size={40} onPress={() => setSelected(new Set())}><X size={18} color={c.text} /></IconButton>
          <Text variant="bodyMedium" style={{ flex: 1 }}>{selected.size} selected</Text>
          <IconButton label="Favorite selected" size={40} onPress={async () => { for (const id of selected) await updatePokemon(id, { favorite: true }); toast.success('Marked as favorite'); setSelected(new Set()); }}><Heart size={18} color={c.danger} /></IconButton>
          <IconButton label="Tag selected" size={40} onPress={() => setTagOpen(true)}><Tag size={18} color={c.text} /></IconButton>
          <IconButton label="Delete selected" size={40} onPress={confirmDelete}><Trash2 size={18} color={c.danger} /></IconButton>
        </Animated.View>
      ) : (
        <View style={{ position: 'absolute', right: 20, bottom: insets.bottom + DOCK_HEIGHT - 28 }}>
          <Button label={t('collection.add')} fullWidth={false} icon={<Plus size={20} color={c.accentOn} />} onPress={() => router.push('/pokemon/add')} testID="fab-add" style={{ shadowColor: c.accent, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8 }} />
        </View>
      )}

      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        <View style={{ gap: 6 }}>
          {SORT_OPTIONS.map((o) => (
            <Pressable
              key={o.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: sort === o.key }}
              onPress={() => {
                haptic('select');
                setSort(o.key);
                setSortOpen(false);
              }}
              style={{ paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <Text variant="bodyMedium" color={sort === o.key ? 'accent' : 'primary'}>{o.label}</Text>
              {sort === o.key ? <Text color="accent">●</Text> : null}
            </Pressable>
          ))}
          {!scores ? <Note>Investment, potential, raid and PvP sorts need the analysis to finish first.</Note> : null}
        </View>
      </Sheet>

      <Sheet visible={tagOpen} onClose={() => setTagOpen(false)} title="Tag selected Pokémon" footer={<Button label="Apply tag" onPress={applyTag} disabled={!tagText.trim()} />}>
        <Field label="TAG" value={tagText} onChangeText={setTagText} placeholder="e.g. keeper, great-league, trade" autoCapitalize="none" />
      </Sheet>
    </View>
  );
}
