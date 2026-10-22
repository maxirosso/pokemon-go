import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { KeyValue, RatingRow } from '@/components/pokemon/Analysis';
import { TierBadge, TypeRow } from '@/components/pokemon/Badges';
import { EvolutionTree } from '@/components/pokemon/EvolutionTree';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { Button } from '@/components/ui/Button';
import { SwitchRow } from '@/components/ui/Form';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { EmptyState, Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { resolveKnowledge } from '@/engine/combat/knowledge';
import { buildEvolutionTree, estimateEvolvedStats, planEvolutions } from '@/engine/evolution/evolution';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import { ROLE_LABEL } from '@/engine/recommendations/types';
import { addCustomPlanAction } from '@/features/plan/planActions';
import { useAnalysis } from '@/store/analysis';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';
import { fmtInt } from '@/utils/format';

export default function EvolutionAdvisor() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pokemon = useData((s) => s.pokemon.find((p) => p.id === id));
  const resources = useData((s) => s.resources);
  const ref = useReference((s) => s.ref);
  const account = useAnalysis((s) => s.account);
  const [traded, setTraded] = useState(false);
  const species = pokemon ? ref.getSpecies(pokemon.speciesId, pokemon.form) : undefined;

  const view = useMemo(() => {
    if (!pokemon || !species) return null;
    const k = resolveKnowledge(ref, species, pokemon);
    const candy = resources.find((r) => r.type === 'candy' && r.scope === String(species.familyId))?.amount ?? null;
    const rare = resources.find((r) => r.type === 'rare_candy')?.amount ?? 0;
    const stock = (name: string) => resources.find((r) => r.type === 'item' && r.scope === name)?.amount ?? null;
    const plans = planEvolutions(ref, species, candy === null ? null : candy + rare, stock, { traded });
    const analysis = account?.analyses.find((a) => a.pokemon.id === pokemon.id) ?? useAnalysis.getState().analysisFor(pokemon.id);
    return { k, candy, plans, analysis, tree: buildEvolutionTree(ref, species.key), megas: ref.megaFormsOf(species.speciesId) };
  }, [pokemon, species, ref, resources, traded, account]);

  if (!pokemon || !species || !view) {
    return (
      <Screen title="Evolution" showBack>
        <EmptyState title="Pokémon not found" />
      </Screen>
    );
  }
  const { k, candy, plans, analysis, tree, megas } = view;
  const recommendedKey = analysis?.verdict.action === 'EVOLVE' || analysis?.verdict.action === 'WAIT_FOR_EVENT' ? analysis.verdict.targetSpeciesKey : null;

  return (
    <Screen title={`${speciesDisplayName(species)} family`} subtitle="EVOLUTION MATRIX" showBack>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <PokemonImage speciesId={pokemon.speciesId} form={pokemon.form} shiny={pokemon.shiny} size={80} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="h3">{pokemon.nickname ?? speciesDisplayName(species)}</Text>
          <Text variant="numSm" color="secondary">
            {pokemon.cp ? `CP ${fmtInt(pokemon.cp)}` : 'CP —'} · {k.ivs ? `${k.ivs.atk}/${k.ivs.def}/${k.ivs.sta}` : 'IVs unknown'} · {k.level !== null ? `L${k.level}` : 'level unknown'}
          </Text>
          <Text variant="caption" color="muted">
            {species.name} Candy: {candy === null ? 'not entered' : fmtInt(candy)}
          </Text>
        </View>
      </Card>

      {tree ? (
        <>
          <SectionHeader title="FAMILY TREE" caption="Requirements and Candy costs from provider data" />
          <Card>
            <EvolutionTree root={tree} highlightKey={species.key} onPress={(key) => {
              const s = ref.getByKey(key);
              if (s) router.push(`/pokedex/${s.speciesId}` as Href);
            }} />
          </Card>
        </>
      ) : null}

      <SwitchRow label="Obtained by trade" description="Some species (e.g. Kadabra, Machoke) evolve for free when traded" value={traded} onChange={setTraded} />

      <SectionHeader title="EVOLUTION OPTIONS" caption="CP/HP are computed with your level and IVs — shown as a range when those are unknown" />
      {plans.length === 0 ? (
        <Card>
          <EmptyState title={`${species.name} is fully evolved`} body="No further evolutions exist for this form in the Pokémon GO dataset." />
        </Card>
      ) : (
        plans.map((p) => {
          const est = estimateEvolvedStats(ref, p.target, k);
          const line = analysis?.line.find((l) => l.species.key === p.target.key);
          const isRec = recommendedKey === p.target.key;
          return (
            <Card key={p.target.key} variant={isRec ? 'glow' : 'default'} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <PokemonImage speciesId={p.target.speciesId} form={p.target.form} size={72} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Text variant="h3">{speciesDisplayName(p.target)}</Text>
                    {isRec ? <Pill label="RECOMMENDED" tone="accent" /> : null}
                  </View>
                  <TypeRow types={p.target.types} compact />
                  <Text variant="caption" color="muted">
                    Base ATK {p.target.stats.atk} · DEF {p.target.stats.def} · STA {p.target.stats.sta}
                    {p.target.stats.atk !== species.stats.atk ? ` (ATK ${p.target.stats.atk - species.stats.atk >= 0 ? '+' : ''}${p.target.stats.atk - species.stats.atk})` : ''}
                  </Text>
                </View>
              </View>
              <View style={{ backgroundColor: c.canvas, borderRadius: 14, padding: 12, gap: 2 }}>
                <KeyValue label="Candy cost" value={`${fmtInt(p.candyCost)}${traded && p.edge.noCandyIfTraded ? ' (traded)' : ''}`} tone={p.candyCost === 0 ? 'success' : undefined} />
                <KeyValue label="Candy status" value={candy === null ? 'enter Candy in the bag' : p.affordable ? 'enough' : `${fmtInt(p.candyShort)} short`} tone={candy === null ? undefined : p.affordable ? 'success' : 'danger'} />
                <KeyValue label="CP after evolving" value={est ? (est.exact ? fmtInt(est.cp.min) : `${fmtInt(est.cp.min)}–${fmtInt(est.cp.max)}`) : 'needs CP/level/IVs'} />
                <KeyValue label="HP after evolving" value={est ? (est.exact ? fmtInt(est.hp.min) : `${fmtInt(est.hp.min)}–${fmtInt(est.hp.max)}`) : '—'} />
                {p.conditions.map((cd, i) => (
                  <KeyValue key={i} label="Requirement" value={cd} tone="warning" />
                ))}
              </View>
              {line ? (
                <View style={{ gap: 10 }}>
                  <Text variant="label" color="muted">
                    AFTER EVOLVING — SAME IVS (POTENTIAL)
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {(['raid', 'great', 'ultra', 'master'] as const).map((r) => (
                      <View key={r} style={{ alignItems: 'center', gap: 4 }}>
                        <Text variant="micro" color="muted">{ROLE_LABEL[r].replace(' attacker', '').replace(' League', '')}</Text>
                        <TierBadge tier={line.ratings[r].tier} label={line.ratings[r].potential === null ? '—' : `${line.ratings[r].tier} ${line.ratings[r].potential}`} />
                      </View>
                    ))}
                  </View>
                  <RatingRow rating={line.ratings.raid} />
                </View>
              ) : (
                <Text variant="caption" color="muted">Add IVs/CP to see how strong this evolution would be.</Text>
              )}
              <Button
                label="Add to investment plan"
                variant="secondary"
                size="sm"
                fullWidth={false}
                onPress={async () => {
                  await addCustomPlanAction({
                    pokemonId: pokemon.id,
                    actionType: 'EVOLVE',
                    title: `Evolve ${species.name} → ${p.target.name}`,
                    targetSpeciesKey: p.target.key,
                    candy: p.candyCost,
                    priority: isRec ? 1 : 3,
                    note: p.conditions.join(', ') || null,
                  });
                  toast.success('Added to your plan');
                }}
              />
            </Card>
          );
        })
      )}

      {megas.length > 0 ? (
        <>
          <SectionHeader title="MEGA EVOLUTION" caption="Temporary — needs Mega Energy" />
          <Card style={{ gap: 8 }}>
            {megas.map((m) => (
              <View key={m.name} style={{ gap: 2 }}>
                <Text variant="bodyMedium">{m.name}</Text>
                <Text variant="caption" color="muted">
                  First Mega: {m.energyFirst} energy · later: {m.energyRepeat} energy · base ATK {m.stats.atk} / DEF {m.stats.def} / STA {m.stats.sta}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
      {pokemon.shadow ? <Note>Shadow Pokémon keep their Shadow status when evolving and cost 20% more Stardust/Candy to power up.</Note> : null}
      <Note>Best-move and event availability are not predicted — check the in-game event calendar. Evolution requirements come from PoGoAPI and may change with updates.</Note>
    </Screen>
  );
}
