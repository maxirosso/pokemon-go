import { useLocalSearchParams } from 'expo-router';
import { Minus, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { KeyValue } from '@/components/pokemon/Analysis';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { Button } from '@/components/ui/Button';
import { NumberField, SwitchRow } from '@/components/ui/Form';
import { Chip, Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { EmptyState, Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { maxLevelForTrainer } from '@/engine/combat/cp';
import { resolveKnowledge } from '@/engine/combat/knowledge';
import { levelForTargetCp, maxAffordableLevel, powerUpOutcome } from '@/engine/powerup/powerUp';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import { addCustomPlanAction } from '@/features/plan/planActions';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';
import { fmtInt, fmtLevel } from '@/utils/format';

type Target = 'level' | 'great' | 'ultra' | 'max' | 'budget';

export default function PowerUpCalculator() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pokemon = useData((s) => s.pokemon.find((p) => p.id === id));
  const trainer = useData((s) => s.trainer);
  const resources = useData((s) => s.resources);
  const ref = useReference((s) => s.ref);
  const species = pokemon ? ref.getSpecies(pokemon.speciesId, pokemon.form) : undefined;
  const [target, setTarget] = useState<Target>('level');
  const [targetLevel, setTargetLevel] = useState(40);
  const [bestBuddy, setBestBuddy] = useState(false);
  const [budget, setBudget] = useState({ stardust: null as number | null, candy: null as number | null, xl: null as number | null });
  const [whatIfLevel, setWhatIfLevel] = useState<number | null>(null);

  const bal = useMemo(() => {
    const get = (t: string, scope: string | null) => resources.find((r) => r.type === t && r.scope === scope)?.amount ?? null;
    return {
      dust: get('stardust', null),
      candy: species ? get('candy', String(species.familyId)) : null,
      xl: species ? get('candy_xl', String(species.familyId)) : null,
      rare: get('rare_candy', null) ?? 0,
      rareXl: get('rare_candy_xl', null) ?? 0,
    };
  }, [resources, species]);

  const calc = useMemo(() => {
    if (!pokemon || !species) return null;
    const k = resolveKnowledge(ref, species, pokemon);
    const ivs = k.ivs;
    const cap = maxLevelForTrainer(trainer?.trainerLevel ?? 40, bestBuddy);
    const level = whatIfLevel ?? k.level;
    if (!ivs || level === null) return { k, ivs, level, cap, outcome: null, resolved: null as number | null };
    const mods = { shadow: pokemon.shadow, purified: pokemon.purified, lucky: pokemon.lucky };
    let resolved: number | null = null;
    switch (target) {
      case 'level':
        resolved = Math.min(targetLevel, cap, 51);
        break;
      case 'great':
        resolved = levelForTargetCp(ref.cpm, species.stats, ivs, 1500, cap);
        break;
      case 'ultra':
        resolved = levelForTargetCp(ref.cpm, species.stats, ivs, 2500, cap);
        break;
      case 'max':
        resolved = cap;
        break;
      case 'budget':
        resolved = maxAffordableLevel(
          ref,
          level,
          { stardust: budget.stardust ?? Infinity, candy: budget.candy ?? Infinity, xlCandy: budget.xl ?? Infinity },
          cap,
          mods,
        );
        break;
    }
    if (resolved === null || resolved <= level) return { k, ivs, level, cap, outcome: null, resolved };
    return { k, ivs, level, cap, outcome: powerUpOutcome(ref, species.stats, ivs, level, resolved, mods), resolved };
  }, [pokemon, species, ref, trainer, bestBuddy, target, targetLevel, budget, whatIfLevel]);

  if (!pokemon || !species || !calc) {
    return (
      <Screen title="Power-up" showBack>
        <EmptyState title="Pokémon not found" />
      </Screen>
    );
  }
  const { k, ivs, level, cap, outcome, resolved } = calc;
  const cost = outcome?.cost;
  const affordDust = cost && bal.dust !== null ? bal.dust >= cost.stardust : null;
  const affordCandy = cost && bal.candy !== null ? bal.candy + bal.rare >= cost.candy : null;
  const affordXl = cost && cost.xlCandy > 0 ? (bal.xl !== null ? bal.xl + bal.rareXl >= cost.xlCandy : null) : true;

  const Stepper = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
      <Pressable accessibilityLabel="Lower target level" onPress={() => setTargetLevel((l) => Math.max(1, l - 0.5))} onLongPress={() => setTargetLevel((l) => Math.max(1, l - 5))} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.elevatedHigh, alignItems: 'center', justifyContent: 'center' }}>
        <Minus size={20} color={c.text} />
      </Pressable>
      <View style={{ alignItems: 'center', minWidth: 90 }}>
        <Text variant="micro" color="muted">TARGET LEVEL</Text>
        <Text variant="numLg">{fmtLevel(targetLevel)}</Text>
      </View>
      <Pressable accessibilityLabel="Raise target level" onPress={() => setTargetLevel((l) => Math.min(51, l + 0.5))} onLongPress={() => setTargetLevel((l) => Math.min(51, l + 5))} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.elevatedHigh, alignItems: 'center', justifyContent: 'center' }}>
        <Plus size={20} color={c.text} />
      </Pressable>
    </View>
  );

  return (
    <Screen title="Power-up calculator" subtitle={speciesDisplayName(species).toUpperCase()} showBack>
      <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <PokemonImage speciesId={pokemon.speciesId} form={pokemon.form} shiny={pokemon.shiny} size={76} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="h3">{pokemon.nickname ?? speciesDisplayName(species)}</Text>
          <Text variant="numSm" color="secondary">
            {ivs ? `IVs ${ivs.atk}/${ivs.def}/${ivs.sta}` : 'IVs unknown'} · {level !== null ? `L${fmtLevel(level)}` : 'level unknown'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {pokemon.shadow ? <Pill label="SHADOW +20% COST" tone="danger" /> : null}
            {pokemon.purified ? <Pill label="PURIFIED −10%" tone="blue" /> : null}
            {pokemon.lucky ? <Pill label="LUCKY −50% DUST" tone="warning" /> : null}
          </View>
        </View>
      </Card>

      {!ivs || level === null ? (
        <>
          <Note tone="warning">
            {!ivs ? 'IVs are unknown, so CP after power-up cannot be computed exactly. ' : ''}
            {level === null ? `Level is unknown${k.levelOptions.length ? ` (could be ${k.levelOptions.join(' or ')})` : ''}. ` : ''}
            Enter them on the Pokémon, or try a what-if level below.
          </Note>
          <NumberField label="WHAT-IF CURRENT LEVEL" value={whatIfLevel} onChange={setWhatIfLevel} min={1} max={51} allowDecimal hint="Only for this calculation — nothing is saved." />
          {!ivs ? <Text variant="small" color="secondary">Add IVs to see CP and stat changes.</Text> : null}
        </>
      ) : null}

      <SectionHeader title="TARGET" caption={`Your trainer level caps power-ups at level ${cap}`} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="Specific level" selected={target === 'level'} onPress={() => setTarget('level')} />
        <Chip label="Great League cap" selected={target === 'great'} onPress={() => setTarget('great')} />
        <Chip label="Ultra League cap" selected={target === 'ultra'} onPress={() => setTarget('ultra')} />
        <Chip label="Maximum" selected={target === 'max'} onPress={() => setTarget('max')} />
        <Chip label="Budget" selected={target === 'budget'} onPress={() => setTarget('budget')} />
      </View>
      <Card style={{ gap: 12 }}>
        {target === 'level' ? Stepper : null}
        {target === 'budget' ? (
          <View style={{ gap: 10 }}>
            <NumberField label="STARDUST TO SPEND" value={budget.stardust} onChange={(v) => setBudget((b) => ({ ...b, stardust: v }))} min={0} placeholder={bal.dust !== null ? `You have ${fmtInt(bal.dust)}` : 'e.g. 100000'} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><NumberField label="CANDY" value={budget.candy} onChange={(v) => setBudget((b) => ({ ...b, candy: v }))} min={0} /></View>
              <View style={{ flex: 1 }}><NumberField label="CANDY XL" value={budget.xl} onChange={(v) => setBudget((b) => ({ ...b, xl: v }))} min={0} /></View>
            </View>
            <Text variant="caption" color="muted">Leave candy fields empty to ignore that limit.</Text>
          </View>
        ) : null}
        <SwitchRow label="Best Buddy bonus" description="Best Buddy raises the level cap by 1" value={bestBuddy} onChange={setBestBuddy} />
        <Text variant="caption" color="muted">
          Target resolves to {resolved === null ? 'an unreachable level (already above the cap?)' : `level ${fmtLevel(resolved)}`}.
          {resolved !== null && ref.cpm.isExtrapolated(resolved) ? ' Levels above 45 use extrapolated CP multipliers (matches provider max-CP values).' : ''}
        </Text>
      </Card>

      {outcome && cost && resolved !== null && level !== null ? (
        <>
          <SectionHeader title="RESULT" />
          <Card variant="glow" style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={{ alignItems: 'center' }}>
                <Text variant="micro" color="muted">CP NOW</Text>
                <Text variant="numLg">{fmtInt(outcome.cpBefore)}</Text>
                <Text variant="caption" color="muted">L{fmtLevel(level)}</Text>
              </View>
              <Text variant="numLg" color="accent">→</Text>
              <View style={{ alignItems: 'center' }}>
                <Text variant="micro" color="muted">CP AFTER</Text>
                <Text variant="numLg" color="accent">{fmtInt(outcome.cpAfter)}</Text>
                <Text variant="caption" color="muted">L{fmtLevel(resolved)}</Text>
              </View>
            </View>
            <View style={{ backgroundColor: c.canvas, borderRadius: 14, padding: 12, gap: 2 }}>
              <KeyValue label="Stardust" value={fmtInt(cost.stardust)} tone={affordDust === null ? undefined : affordDust ? 'success' : 'danger'} />
              <KeyValue label={`${species.name} Candy`} value={fmtInt(cost.candy)} tone={affordCandy === null ? undefined : affordCandy ? 'success' : 'danger'} />
              <KeyValue label="Candy XL" value={fmtInt(cost.xlCandy)} tone={affordXl === null ? undefined : affordXl ? 'success' : 'danger'} />
              <KeyValue label="Power-up steps" value={String(cost.steps)} />
              {cost.incomplete ? <Text variant="caption" color="warning">Some levels are missing from the cost table — the total is incomplete.</Text> : null}
              <KeyValue label="Your balances" value={`${bal.dust === null ? '—' : fmtInt(bal.dust)} dust / ${bal.candy === null ? '—' : fmtInt(bal.candy)} candy`} />
            </View>
            <View style={{ gap: 2 }}>
              <KeyValue label="Attack stat" value={`${outcome.atkBefore.toFixed(1)} → ${outcome.atkAfter.toFixed(1)}`} />
              <KeyValue label="Defense stat" value={`${outcome.defBefore.toFixed(1)} → ${outcome.defAfter.toFixed(1)}`} />
              <KeyValue label="HP" value={`${outcome.hpBefore} → ${outcome.hpAfter}`} />
              <KeyValue label="Efficiency" value={outcome.cpPer10kStardust === null ? '—' : `${outcome.cpPer10kStardust.toFixed(0)} CP per 10k Stardust`} />
            </View>
            <Button
              label="Add to investment plan"
              variant="secondary"
              onPress={async () => {
                await addCustomPlanAction({
                  pokemonId: pokemon.id,
                  actionType: 'POWER_UP',
                  title: `Power up ${species.name} to L${fmtLevel(resolved)}`,
                  targetLevel: resolved,
                  stardust: cost.stardust,
                  candy: cost.candy,
                  xl: cost.xlCandy,
                  priority: 3,
                });
                toast.success('Added to your plan');
              }}
            />
          </Card>
        </>
      ) : ivs && level !== null ? (
        <Note>{resolved !== null && resolved <= level ? `Already at or above the target (level ${fmtLevel(level)}).` : 'Nothing to calculate for this target.'}</Note>
      ) : null}
      <Note>Costs come from the provider’s power-up table (Shadow +20%, Purified −10%, Lucky −50% Stardust are applied per step and rounded — approximations of the in-game rounding).</Note>
    </Screen>
  );
}
