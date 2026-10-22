import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Check, Lightbulb } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { Button } from '@/components/ui/Button';
import { Chip, Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { SpeciesList } from '@/components/pokemon/SpeciesList';
import { getRaidIndex } from '@/engine/raids/raidIndex';
import { POKEMON_TYPES, type GoSpecies, type PokemonType } from '@/engine/types';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';

type Own = 'all' | 'owned' | 'missing';

export default function PokedexIndex() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ filter?: string }>();
  const ref = useReference((s) => s.ref);
  const pokemon = useData((s) => s.pokemon);
  const [own, setOwn] = useState<Own>(params.filter === 'missing' ? 'missing' : 'all');
  const [gen, setGen] = useState<number | null>(null);
  const [type, setType] = useState<PokemonType | null>(null);
  const [suggest, setSuggest] = useState(false);
  const ownedIds = useMemo(() => new Set(pokemon.map((p) => p.speciesId)), [pokemon]);

  const filter = useCallback(
    (s: GoSpecies) => (own === 'all' || (own === 'owned') === ownedIds.has(s.speciesId)) && (gen === null || s.generation === gen) && (type === null || s.types.includes(type)),
    [own, gen, type, ownedIds],
  );
  const trailing = useCallback((s: GoSpecies) => (ownedIds.has(s.speciesId) ? <Pill label="OWNED" tone="success" icon={<Check size={10} color={c.success} />} /> : null), [ownedIds, c.success]);

  const suggestions = useMemo(() => {
    if (!suggest) return null;
    const idx = getRaidIndex(ref);
    const missing = (id: number) => !ownedIds.has(id);
    const raid: { s: GoSpecies; why: string }[] = [];
    const seenTypes = new Set<PokemonType>();
    for (const e of idx.entries) {
      const s = ref.getSpecies(e.speciesId, ref.getByKey(e.key)?.form ?? 'Normal');
      if (!s || s.rarity !== 'standard' || !missing(s.speciesId) || seenTypes.has(e.attackType) || s.isBaby) continue;
      seenTypes.add(e.attackType);
      raid.push({ s, why: `Strong ${e.attackType}-type raid attacker (${e.fast} + ${e.charged})` });
      if (raid.length >= 8) break;
    }
    const pvp = ref
      .topPvpMeta('great', 40)
      .map((m) => ({ s: ref.getSpecies(m.speciesId, m.form), m }))
      .filter((x): x is { s: GoSpecies; m: ReturnType<typeof ref.topPvpMeta>[number] } => !!x.s && missing(x.m.speciesId) && x.m.shadow === false)
      .slice(0, 6)
      .map(({ s, m }) => ({ s, why: `PvPoke Great League meta #${m.rank} (score ${m.score.toFixed(1)})` }));
    return { raid, pvp };
  }, [suggest, ref, ownedIds]);

  const header = (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        {(['all', 'owned', 'missing'] as Own[]).map((o) => (
          <Chip key={o} label={o === 'all' ? 'All' : o === 'owned' ? 'Owned' : 'Missing'} selected={own === o} onPress={() => setOwn(o)} />
        ))}
        <View style={{ flex: 1 }} />
        <Button label="Ideas" size="sm" variant="secondary" fullWidth={false} icon={<Lightbulb size={16} color={c.text} />} onPress={() => setSuggest(true)} />
      </View>
      <View style={{ height: 38 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
            <Chip key={g} label={`Gen ${g}`} tone="blue" selected={gen === g} onPress={() => setGen(gen === g ? null : g)} />
          ))}
        </ScrollView>
      </View>
      <View style={{ height: 38 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {POKEMON_TYPES.map((t) => (
            <Chip key={t} label={t} tone="purple" selected={type === t} onPress={() => setType(type === t ? null : t)} />
          ))}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <Screen title="Pokédex" subtitle={`${ownedIds.size} SPECIES OWNED`} showBack scroll={false}>
      <SpeciesList onSelect={(s) => router.push(`/pokedex/${s.speciesId}?form=${s.form}` as Href)} filter={filter} trailing={trailing} header={header} />
      <Sheet visible={suggest} onClose={() => setSuggest(false)} title="Useful species you don’t own" tall>
        <Text variant="caption" color="muted">
          Suggestions only — these are not in your collection. Raid picks are the strongest standard-rarity attacker per move type by the on-device model; PvP picks come from PvPoke’s Great League ranking.
        </Text>
        {suggestions ? (
          <>
            <Text variant="label" color="muted">RAID ATTACKERS</Text>
            {suggestions.raid.map(({ s, why }) => (
              <Card key={s.key} onPress={() => { setSuggest(false); router.push(`/pokedex/${s.speciesId}` as Href); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <PokemonImage speciesId={s.speciesId} form={s.form} size={44} kind="sprite" />
                <View style={{ flex: 1 }}><Text variant="bodyMedium">{speciesDisplayName(s)}</Text><Text variant="caption" color="muted">{why}</Text></View>
              </Card>
            ))}
            <Text variant="label" color="muted">GREAT LEAGUE CANDIDATES</Text>
            {suggestions.pvp.map(({ s, why }) => (
              <Card key={s.key} onPress={() => { setSuggest(false); router.push(`/pokedex/${s.speciesId}` as Href); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <PokemonImage speciesId={s.speciesId} form={s.form} size={44} kind="sprite" />
                <View style={{ flex: 1 }}><Text variant="bodyMedium">{speciesDisplayName(s)}</Text><Text variant="caption" color="muted">{why}</Text></View>
              </Card>
            ))}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
