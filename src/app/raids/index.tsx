import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { SpeciesList } from '@/components/pokemon/SpeciesList';
import { resolveKnowledge } from '@/engine/combat/knowledge';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import { NO_MODIFIERS, genericBoss, rankMovesets } from '@/engine/raids/raidModel';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';

function MovesetAudit({ pokemonId }: { pokemonId: string }) {
  const pokemon = useData((s) => s.pokemon.find((p) => p.id === pokemonId));
  const ref = useReference((s) => s.ref);
  const rows = useMemo(() => {
    if (!pokemon) return null;
    const species = ref.getSpecies(pokemon.speciesId, pokemon.form);
    if (!species) return null;
    const k = resolveKnowledge(ref, species, pokemon);
    if (k.candidates.length === 0) return { species, rows: [], note: 'Add CP, level or IVs to audit this moveset.' };
    const sorted = [...k.candidates].sort((a, b) => a.ivs.atk - b.ivs.atk);
    const rep = sorted[Math.floor(sorted.length / 2)];
    const options = rankMovesets(
      ref,
      { speciesKey: species.key, stats: species.stats, types: species.types, ivs: rep.ivs, level: Math.min(40, Math.max(rep.level, 30)), shadow: pokemon.shadow },
      species,
      genericBoss(ref),
      NO_MODIFIERS,
    );
    return { species, rows: options.slice(0, 8), note: null as string | null };
  }, [pokemon, ref]);
  if (!pokemon || !rows) return null;
  return (
    <Card style={{ gap: 10 }}>
      <Text variant="label" color="muted">
        MOVESET AUDIT · {speciesDisplayName(rows.species).toUpperCase()}
      </Text>
      {rows.note ? (
        <Text variant="small" color="secondary">
          {rows.note}
        </Text>
      ) : (
        <>
          {rows.rows.map((r, i) => {
            const isCurrent = r.fast === pokemon.fastMove && r.charged === pokemon.chargedMove1;
            return (
              <View key={`${r.fast}-${r.charged}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="numSm" color={i === 0 ? 'accent' : 'muted'} style={{ width: 22 }}>
                  {i + 1}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text variant="small">
                    {r.fast} + {r.charged}
                  </Text>
                  <Text variant="caption" color="muted">
                    DPS {r.dps.toFixed(1)} · TDO {Math.round(r.tdo)} · score {r.score.toFixed(1)}
                  </Text>
                </View>
                {r.elite ? <Pill label="ELITE" tone="warning" /> : null}
                {isCurrent ? <Pill label="EQUIPPED" tone="accent" /> : null}
              </View>
            );
          })}
          <Text variant="caption" color="muted">
            Ranked by the on-device raid model against a neutral reference boss (estimate, no dodging). Elite moves need an Elite TM or an event.
          </Text>
        </>
      )}
    </Card>
  );
}

export default function RaidsIndex() {
  const { pokemon } = useLocalSearchParams<{ pokemon?: string }>();
  const ref = useReference((s) => s.ref);
  const onSelect = (speciesId: number, form: string) => {
    const s = ref.getSpecies(speciesId, form);
    const tier = s?.rarity === 'legendary' || s?.rarity === 'mythical' ? '5' : '3';
    router.push(`/raids/boss?speciesId=${speciesId}&form=${form}&tier=${tier}` as Href);
  };
  return (
    <Screen title="Choose a raid boss" subtitle="RAID ASSISTANT" showBack scroll={false}>
      <SpeciesList
        onSelect={(s) => onSelect(s.speciesId, s.form)}
        header={pokemon ? <MovesetAudit pokemonId={pokemon} /> : <Text variant="caption" color="muted">Search any Pokémon — the live raid list is on the Battle tab. Active raids are never invented.</Text>}
      />
    </Screen>
  );
}
