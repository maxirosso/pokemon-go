import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { SpeciesList } from '@/components/pokemon/SpeciesList';
import { Button } from '@/components/ui/Button';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { ResourceHint, ResourceInput } from '@/features/resources/ResourceRow';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';

/** Resource inventory ("bag"): Stardust, Candy per family, XL, TMs, evolution items. All manual — the app never reads the game. */
export default function Resources() {
  const { c } = useTheme();
  const ref = useReference((s) => s.ref);
  const pokemon = useData((s) => s.pokemon);
  const resources = useData((s) => s.resources);
  const [pickFamily, setPickFamily] = useState(false);
  const [extraFamilies, setExtraFamilies] = useState<number[]>([]);

  const families = useMemo(() => {
    const ids = new Set<number>(extraFamilies);
    for (const p of pokemon) {
      const s = ref.getSpecies(p.speciesId, p.form);
      if (s) ids.add(s.familyId);
    }
    for (const r of resources) if ((r.type === 'candy' || r.type === 'candy_xl') && r.scope) ids.add(Number(r.scope));
    return [...ids].sort((a, b) => a - b).map((id) => ({ id, root: ref.getSpecies(id) })).filter((f) => !!f.root);
  }, [pokemon, resources, extraFamilies, ref]);

  const items = useMemo(() => {
    const set = new Set<string>();
    for (const s of ref.listSpecies()) for (const e of ref.evolutionsFrom(s.key)) if (e.item) set.add(e.item);
    return [...set].sort();
  }, [ref]);

  return (
    <Screen title="Resource bag" subtitle="STARDUST · CANDY · ITEMS" showBack>
      <Text variant="small" color="secondary">
        Enter what you have so the advisor can tell you what you can afford today. Everything is private and stays on this device.
      </Text>
      <ResourceHint />

      <SectionHeader title="CURRENCY" />
      <Card style={{ gap: 12 }}>
        <ResourceInput label="STARDUST" type="stardust" placeholder="e.g. 1425000" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><ResourceInput label="RARE CANDY" type="rare_candy" /></View>
          <View style={{ flex: 1 }}><ResourceInput label="RARE CANDY XL" type="rare_candy_xl" /></View>
        </View>
      </Card>

      <SectionHeader title="TECHNICAL MACHINES" />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><ResourceInput label="FAST TM" type="fast_tm" /></View>
          <View style={{ flex: 1 }}><ResourceInput label="CHARGED TM" type="charged_tm" /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><ResourceInput label="ELITE FAST TM" type="elite_fast_tm" /></View>
          <View style={{ flex: 1 }}><ResourceInput label="ELITE CHARGED TM" type="elite_charged_tm" /></View>
        </View>
      </Card>

      <SectionHeader title="CANDY BY FAMILY" caption="Families from your collection are listed automatically" />
      <View style={{ gap: 10 }}>
        {families.length === 0 ? (
          <Card><Text variant="small" color="secondary">Add Pokémon or a family below to enter its Candy.</Text></Card>
        ) : (
          families.map((f) => (
            <Card key={f.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <PokemonImage speciesId={f.id} size={40} kind="sprite" />
                <Text variant="h3">{f.root?.name} family</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><ResourceInput label="CANDY" type="candy" scope={String(f.id)} /></View>
                <View style={{ flex: 1 }}><ResourceInput label="CANDY XL" type="candy_xl" scope={String(f.id)} /></View>
              </View>
              <ResourceInput label="MEGA ENERGY" type="mega_energy" scope={String(f.id)} />
            </Card>
          ))
        )}
        <Button label="Add another family" variant="secondary" icon={<Plus size={18} color={c.text} />} onPress={() => setPickFamily(true)} />
      </View>

      <SectionHeader title="EVOLUTION ITEMS" caption="From the provider's evolution requirements" />
      <Card style={{ gap: 12 }}>
        {items.map((name) => (
          <ResourceInput key={name} label={name.toUpperCase()} type="item" scope={name} />
        ))}
      </Card>

      <Sheet visible={pickFamily} onClose={() => setPickFamily(false)} title="Add a Candy family" tall>
        <View style={{ height: 520 }}>
          <SpeciesList
            filter={(s) => s.stage === 0}
            onSelect={(s) => {
              setExtraFamilies((x) => [...x, s.familyId]);
              setPickFamily(false);
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
