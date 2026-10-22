import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { NumberField, Segmented } from '@/components/ui/Form';
import { Chip } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { applyFilters, type CollectionFilters, type Tri } from '@/features/collection/filtering';
import { useScores } from '@/features/collection/useScores';
import { VERDICT_LABEL, type VerdictAction } from '@/engine/recommendations/types';
import { POKEMON_TYPES } from '@/engine/types';
import { useCollectionView } from '@/store/collectionView';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { typeColors } from '@/theme/tokens';

function TriRow({ label, value, onChange }: { label: string; value: Tri; onChange: (v: Tri) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="small" color="secondary">
        {label}
      </Text>
      <Segmented
        options={[
          { value: 'any', label: 'Any' },
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        value={value === null ? 'any' : value ? 'yes' : 'no'}
        onChange={(v) => onChange(v === 'any' ? null : v === 'yes')}
      />
    </View>
  );
}

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export default function FiltersScreen() {
  const { filters, setFilters, resetFilters } = useCollectionView();
  const pokemon = useData((s) => s.pokemon);
  const tags = useData((s) => s.tags);
  const ref = useReference((s) => s.ref);
  const scores = useScores();
  const count = useMemo(() => applyFilters(pokemon, ref, filters, scores).list.length, [pokemon, ref, filters, scores]);
  const set = (p: Partial<CollectionFilters>) => setFilters(p);

  return (
    <Screen
      title="Advanced filters"
      showBack
      onBack={() => router.back()}
      headerRight={<Button label="Reset" variant="ghost" size="sm" fullWidth={false} onPress={resetFilters} />}
      footer={<Button label={`Show ${count} Pokémon`} onPress={() => router.back()} testID="filters-apply" />}
    >
      <Text variant="caption" color="muted">
        Filters combine with each other and with the search box. {!scores ? 'Investment, raid and PvP filters need the analysis to finish.' : ''}
      </Text>

      <SectionHeader title="TYPE" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {POKEMON_TYPES.map((t) => (
          <View key={t} style={{ borderRadius: 18, borderWidth: filters.types.includes(t) ? 2 : 0, borderColor: typeColors[t] }}>
            <Chip label={t} selected={filters.types.includes(t)} onPress={() => set({ types: toggle(filters.types, t) })} />
          </View>
        ))}
      </View>

      <SectionHeader title="GENERATION" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
          <Chip key={g} label={`Gen ${g}`} selected={filters.generations.includes(g)} onPress={() => set({ generations: toggle(filters.generations, g) })} />
        ))}
      </View>

      <SectionHeader title="COMBAT POWER & IVS" />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <NumberField label="CP MIN" value={filters.cp.min} onChange={(v) => set({ cp: { ...filters.cp, min: v } })} min={0} />
          </View>
          <View style={{ flex: 1 }}>
            <NumberField label="CP MAX" value={filters.cp.max} onChange={(v) => set({ cp: { ...filters.cp, max: v } })} min={0} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <NumberField label="IV % MIN" value={filters.ivPercent.min} onChange={(v) => set({ ivPercent: { ...filters.ivPercent, min: v } })} min={0} max={100} />
          </View>
          <View style={{ flex: 1 }}>
            <NumberField label="IV % MAX" value={filters.ivPercent.max} onChange={(v) => set({ ivPercent: { ...filters.ivPercent, max: v } })} min={0} max={100} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <NumberField label="ATK IV ≥" value={filters.atkIvMin} onChange={(v) => set({ atkIvMin: v })} min={0} max={15} />
          </View>
          <View style={{ flex: 1 }}>
            <NumberField label="DEF IV ≥" value={filters.defIvMin} onChange={(v) => set({ defIvMin: v })} min={0} max={15} />
          </View>
          <View style={{ flex: 1 }}>
            <NumberField label="HP IV ≥" value={filters.staIvMin} onChange={(v) => set({ staIvMin: v })} min={0} max={15} />
          </View>
        </View>
        <Text variant="small" color="secondary">
          Appraisal stars
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {[0, 1, 2, 3, 4].map((s) => (
            <Chip key={s} label={`${s}★`} selected={filters.stars.includes(s)} onPress={() => set({ stars: toggle(filters.stars, s) })} />
          ))}
        </View>
        <TriRow label="IVs known (appraised)" value={filters.ivsKnown} onChange={(v) => set({ ivsKnown: v })} />
      </Card>

      <SectionHeader title="EVOLUTION STAGE" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['base', 'middle', 'final'] as const).map((s) => (
          <Chip key={s} label={s[0].toUpperCase() + s.slice(1)} selected={filters.stages.includes(s)} onPress={() => set({ stages: toggle(filters.stages, s) })} />
        ))}
      </View>

      <SectionHeader title="STATUS" />
      <Card style={{ gap: 12 }}>
        <TriRow label="Legendary" value={filters.legendary} onChange={(v) => set({ legendary: v })} />
        <TriRow label="Mythical" value={filters.mythical} onChange={(v) => set({ mythical: v })} />
        <TriRow label="Ultra Beast" value={filters.ultraBeast} onChange={(v) => set({ ultraBeast: v })} />
        <TriRow label="Shiny" value={filters.shiny} onChange={(v) => set({ shiny: v })} />
        <TriRow label="Shadow" value={filters.shadow} onChange={(v) => set({ shadow: v })} />
        <TriRow label="Purified" value={filters.purified} onChange={(v) => set({ purified: v })} />
        <TriRow label="Lucky" value={filters.lucky} onChange={(v) => set({ lucky: v })} />
        <TriRow label="Favorite" value={filters.favorite} onChange={(v) => set({ favorite: v })} />
        <TriRow label="Mega eligible" value={filters.megaEligible} onChange={(v) => set({ megaEligible: v })} />
        <TriRow label="Dynamax / Gigantamax flagged" value={filters.dynamax} onChange={(v) => set({ dynamax: v })} />
      </Card>

      <SectionHeader title="BATTLE & INVESTMENT" caption="Based on the on-device analysis" />
      <Card style={{ gap: 12 }}>
        <Text variant="small" color="secondary">
          PvP suitable (≥ 60/100)
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {(['great', 'ultra', 'master'] as const).map((l) => (
            <Chip key={l} label={`${l[0].toUpperCase()}${l.slice(1)} League`} selected={filters.pvpSuitable === l} onPress={() => set({ pvpSuitable: filters.pvpSuitable === l ? null : l })} />
          ))}
        </View>
        <TriRow label="Raid suitable (≥ 70/100)" value={filters.raidSuitable} onChange={(v) => set({ raidSuitable: v })} />
        <TriRow label="Evolution affordable now" value={filters.evolutionAffordable} onChange={(v) => set({ evolutionAffordable: v })} />
        <TriRow label="Power-up affordable now" value={filters.powerUpAffordable} onChange={(v) => set({ powerUpAffordable: v })} />
        <Text variant="small" color="secondary">
          Investment priority (1 = highest)
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[1, 2, 3].map((p) => (
            <Chip key={p} label={`Top ${p}`} selected={filters.maxPriority === p} onPress={() => set({ maxPriority: filters.maxPriority === p ? null : p })} />
          ))}
        </View>
        <Text variant="small" color="secondary">
          Current appraisal / verdict
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {(Object.keys(VERDICT_LABEL) as VerdictAction[]).map((v) => (
            <Chip key={v} label={VERDICT_LABEL[v]} selected={filters.verdicts.includes(v)} onPress={() => set({ verdicts: toggle(filters.verdicts, v) })} />
          ))}
        </View>
      </Card>

      {tags.length > 0 ? (
        <>
          <SectionHeader title="TAGS" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {tags.map((t) => (
              <Chip key={t.name} label={t.name} count={t.count} selected={filters.tags.includes(t.name)} onPress={() => set({ tags: toggle(filters.tags, t.name) })} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
