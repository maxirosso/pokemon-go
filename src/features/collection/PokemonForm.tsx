import { Star } from 'lucide-react-native';
import { useDeferredValue, useMemo, useState } from 'react';
import { View } from 'react-native';
import { IvBars } from '@/components/charts/Charts';
import { Button } from '@/components/ui/Button';
import { Field, NumberField, Segmented, SwitchRow } from '@/components/ui/Form';
import { Chip } from '@/components/ui/Pill';
import { SectionHeader } from '@/components/ui/Screen';
import { StepSlider } from '@/components/ui/Sheet';
import { Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { estimateLevel, ivPercent, ivTotal, solveIvCandidates, summarizeCandidates } from '@/engine/combat/cp';
import { formLabel } from '@/engine/reference/referenceData';
import type { GoSpecies, SizeVariant } from '@/engine/types';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';
import type { FormErrors, FormState } from './formModel';

const SIZES: SizeVariant[] = ['XXS', 'XS', 'M', 'XL', 'XXL'];

function NewTagField({ onAdd }: { onAdd: (tag: string) => void }) {
  const [text, setText] = useState('');
  const commit = () => {
    const tag = text.trim();
    if (tag) onAdd(tag);
    setText('');
  };
  return <Field value={text} onChangeText={setText} placeholder="New tag — type and press return" autoCapitalize="none" returnKeyType="done" onSubmitEditing={commit} onBlur={commit} />;
}

export function PokemonForm({
  species,
  value,
  onChange,
  errors,
}: {
  species: GoSpecies;
  value: FormState;
  onChange: (patch: Partial<FormState>) => void;
  errors: FormErrors;
}) {
  const { c } = useTheme();
  const ref = useReference((s) => s.ref);
  const existingTags = useData((s) => s.tags);
  const pool = ref.movePool(species.speciesId, species.form);
  const forms = ref.formsOf(species.speciesId);
  const ivsSet = value.atk !== null && value.def !== null && value.sta !== null;
  const ivs = ivsSet ? { atk: value.atk as number, def: value.def as number, sta: value.sta as number } : null;

  // Deferred inputs keep typing responsive while the (cheap but not free) level/IV maths recompute.
  const dCp = useDeferredValue(value.cp);
  const dHp = useDeferredValue(value.hp);
  const dLevel = useDeferredValue(value.level);
  const dIvs = useDeferredValue(ivs);

  const hint = useMemo(() => {
    if (dCp === null) return null;
    if (dIvs) {
      const est = estimateLevel(ref.cpm, species.stats, { level: dLevel, cp: dCp, hp: dHp, ivs: dIvs });
      return { kind: 'level' as const, est };
    }
    const cands = solveIvCandidates(ref.cpm, species.stats, dCp, dHp, dLevel !== null ? { levels: [dLevel] } : {});
    return { kind: 'ivs' as const, summary: summarizeCandidates(cands) };
  }, [ref, species, dCp, dHp, dLevel, dIvs]);

  const toggle = <K extends 'shiny' | 'shadow' | 'purified' | 'lucky' | 'favorite' | 'dynamax'>(k: K) => (v: boolean) => {
    const patch: Partial<FormState> = { [k]: v };
    if (k === 'shadow' && v) patch.purified = false;
    if (k === 'purified' && v) patch.shadow = false;
    onChange(patch);
  };

  const moveChip = (name: string, selected: boolean, elite: boolean, onPress: () => void) => (
    <Chip key={name} label={`${name}${elite ? ' ★' : ''}`} selected={selected} tone={elite ? 'warning' : 'accent'} onPress={onPress} />
  );

  return (
    <View style={{ gap: 16 }}>
      {forms.length > 1 ? (
        <Card style={{ gap: 8 }}>
          <Text variant="label" color="muted">
            FORM
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {forms.map((f) => (
              <Chip key={f.key} label={formLabel(f.form) || 'Normal'} selected={value.form === f.form} onPress={() => onChange({ form: f.form, fastMove: null, chargedMove1: null, chargedMove2: null })} />
            ))}
          </View>
        </Card>
      ) : null}

      <SectionHeader title="COMBAT STATS" caption="All optional — add what you know" />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <NumberField label="CP" value={value.cp} onChange={(v) => onChange({ cp: v })} min={10} max={99999} placeholder="e.g. 842" emitOutOfRange />
          </View>
          <View style={{ flex: 1 }}>
            <NumberField label="HP" value={value.hp} onChange={(v) => onChange({ hp: v })} min={1} max={9999} placeholder="e.g. 120" emitOutOfRange />
          </View>
          <View style={{ flex: 1 }}>
            <NumberField label="LEVEL" value={value.level} onChange={(v) => onChange({ level: v })} min={1} max={51} allowDecimal placeholder="1–51" emitOutOfRange />
          </View>
        </View>
        {errors.cp || errors.hp || errors.level ? (
          <Text variant="caption" color="danger">
            {errors.cp ?? errors.hp ?? errors.level}
          </Text>
        ) : null}
        {hint?.kind === 'level' && hint.est.status !== 'known' ? (
          hint.est.status === 'unique' ? (
            <Note>
              Level {hint.est.level} fits this CP and these IVs.{' '}
              <Text variant="small" color="blue" onPress={() => onChange({ level: (hint.est as { level: number }).level })} style={{ textDecorationLine: 'underline' }}>
                Use it
              </Text>
            </Note>
          ) : hint.est.status === 'ambiguous' ? (
            <Note>
              Level could be {hint.est.levels.join(' or ')} — enter the HP (or the level) to narrow it down. Nothing is assumed.
            </Note>
          ) : hint.est.status === 'impossible' ? (
            <Note tone="warning">This CP is not possible for these IVs at any level — check for a typo.</Note>
          ) : null
        ) : null}
        {hint?.kind === 'ivs' ? (
          hint.summary ? (
            <Note>
              IVs unknown: {hint.summary.count} IV/level combinations fit this CP{dHp !== null ? ' and HP' : ''} (IV between {Math.round(hint.summary.minPercent)}% and {Math.round(hint.summary.maxPercent)}%). Add the appraisal IVs for exact advice.
            </Note>
          ) : (
            <Note tone="warning">This CP/HP does not match any IV/level for {species.name} — check for a typo.</Note>
          )
        ) : null}
      </Card>

      <SectionHeader title="INDIVIDUAL VALUES (IV)" caption="Leave unset if you don't know them — they are never guessed" />
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="small" color="secondary">
            {ivs ? `Total ${ivTotal(ivs)}/45` : 'Not set'}
          </Text>
          <Text variant="numMd" color={ivs && ivPercent(ivs) === 100 ? 'accent' : 'primary'}>
            {ivs ? `${ivPercent(ivs).toFixed(1)}%` : '—'}
          </Text>
        </View>
        {(
          [
            ['atk', 'ATTACK', c.danger],
            ['def', 'DEFENSE', c.blue],
            ['sta', 'HP', c.success],
          ] as const
        ).map(([k, label, color]) => (
          <View key={k}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="micro" color="muted">
                {label}
              </Text>
              <Text variant="numSm" color={value[k] === null ? 'muted' : 'primary'}>
                {value[k] === null ? 'tap to set' : `${value[k]} / 15`}
              </Text>
            </View>
            <StepSlider label={`${label} IV`} value={value[k] ?? 0} muted={value[k] === null} color={color} onChange={(v) => onChange({ [k]: v })} />
          </View>
        ))}
        {errors.ivs ? (
          <Text variant="caption" color="danger">
            {errors.ivs}
          </Text>
        ) : null}
        <IvBars ivs={ivs} compact />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <Button label="Clear (unknown)" size="sm" variant="secondary" fullWidth={false} onPress={() => onChange({ atk: null, def: null, sta: null })} />
          <Text variant="caption" color="muted" style={{ flex: 1 }}>
            IV % shows stat luck only — it is not how useful the Pokémon is.
          </Text>
        </View>
      </Card>

      <SectionHeader title="MOVES" caption={pool ? 'From the current Pokémon GO move pool · ★ = Elite/legacy' : 'No move data for this species'} />
      {pool ? (
        <Card style={{ gap: 12 }}>
          <Text variant="small" color="secondary">
            Fast move
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[...pool.fast.map((m) => ({ m, e: false })), ...pool.eliteFast.map((m) => ({ m, e: true }))].map(({ m, e }) =>
              moveChip(m, value.fastMove === m, e, () => onChange({ fastMove: value.fastMove === m ? null : m })),
            )}
          </View>
          <Text variant="small" color="secondary">
            Charged move (used in raids)
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[...pool.charged.map((m) => ({ m, e: false })), ...pool.eliteCharged.map((m) => ({ m, e: true }))].map(({ m, e }) =>
              moveChip(m, value.chargedMove1 === m, e, () => onChange({ chargedMove1: value.chargedMove1 === m ? null : m })),
            )}
          </View>
          <Text variant="small" color="secondary">
            Second charged move (PvP)
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[...pool.charged.map((m) => ({ m, e: false })), ...pool.eliteCharged.map((m) => ({ m, e: true }))]
              .filter(({ m }) => m !== value.chargedMove1)
              .map(({ m, e }) => moveChip(m, value.chargedMove2 === m, e, () => onChange({ chargedMove2: value.chargedMove2 === m ? null : m })))}
          </View>
        </Card>
      ) : null}

      <SectionHeader title="STATUS" />
      <Card style={{ gap: 2 }}>
        <SwitchRow label="Shiny" value={value.shiny} onChange={toggle('shiny')} />
        <SwitchRow label="Shadow" description="Shadow Pokémon: +20% attack, −17% defense" value={value.shadow} onChange={toggle('shadow')} disabled={!species.shadowAvailable && !value.shadow} />
        <SwitchRow label="Purified" value={value.purified} onChange={toggle('purified')} />
        <SwitchRow label="Lucky" value={value.lucky} onChange={toggle('lucky')} />
        <SwitchRow label="Favorite" value={value.favorite} onChange={toggle('favorite')} />
        <SwitchRow label="Dynamax / Gigantamax eligible" value={value.dynamax} onChange={toggle('dynamax')} />
        {errors.purified ? (
          <Text variant="caption" color="danger">
            {errors.purified}
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="DETAILS" />
      <Card style={{ gap: 14 }}>
        <Field label="NICKNAME" value={value.nickname} onChangeText={(t) => onChange({ nickname: t })} placeholder="Optional" maxLength={24} />
        <View style={{ gap: 6 }}>
          <Text variant="label" color="muted">
            GENDER
          </Text>
          <Segmented
            options={[
              { value: 'unknown', label: 'Unknown' },
              { value: 'male', label: '♂ Male' },
              { value: 'female', label: '♀ Female' },
            ]}
            value={value.gender}
            onChange={(g) => onChange({ gender: g })}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text variant="label" color="muted">
            SIZE
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {SIZES.map((s) => (
              <Chip key={s} label={s} selected={value.size === s} onPress={() => onChange({ size: value.size === s ? null : s })} />
            ))}
          </View>
        </View>
        <Field label="DATE CAUGHT" value={value.dateCaught} onChangeText={(t) => onChange({ dateCaught: t })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" error={errors.dateCaught ?? null} />
        <View style={{ gap: 6 }}>
          <Text variant="label" color="muted">
            TAGS
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {existingTags.map((t) => (
              <Chip key={t.name} label={t.name} selected={value.tags.includes(t.name)} onPress={() => onChange({ tags: value.tags.includes(t.name) ? value.tags.filter((x) => x !== t.name) : [...value.tags, t.name] })} icon={value.tags.includes(t.name) ? <Star size={12} color={c.accent} /> : undefined} />
            ))}
          </View>
          <NewTagField onAdd={(tag) => (!value.tags.includes(tag) ? onChange({ tags: [...value.tags, tag] }) : undefined)} />
        </View>
        <Field label="NOTES" value={value.notes} onChangeText={(t) => onChange({ notes: t })} placeholder="Anything worth remembering" multiline numberOfLines={3} />
      </Card>
    </View>
  );
}
