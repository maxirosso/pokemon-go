import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { IvBars } from '@/components/charts/Charts';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Form';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { CardSkeleton, EmptyState } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { ivPercent } from '@/engine/combat/cp';
import { normalizeName, speciesDisplayName } from '@/engine/reference/referenceData';
import { ROLE_LABEL, type PokemonAnalysis, type RoleId } from '@/engine/recommendations/types';
import { useAnalysis } from '@/store/analysis';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';
import { fmtInt, fmtLevel } from '@/utils/format';

const ROLES: RoleId[] = ['raid', 'gymAttack', 'gymDefense', 'great', 'ultra', 'master'];

export default function ComparePokemon() {
  const { c } = useTheme();
  const { a: aId, b: bId } = useLocalSearchParams<{ a?: string; b?: string }>();
  const pokemon = useData((s) => s.pokemon);
  const ref = useReference((s) => s.ref);
  const account = useAnalysis((s) => s.account);
  const [other, setOther] = useState<string | undefined>(bId);
  const [picking, setPicking] = useState(!bId);
  const [q, setQ] = useState('');
  const [aa, setAa] = useState<PokemonAnalysis | null>(null);
  const [bb, setBb] = useState<PokemonAnalysis | null>(null);

  const a = pokemon.find((p) => p.id === aId);
  const b = pokemon.find((p) => p.id === other);

  useEffect(() => {
    const t = setTimeout(() => {
      setAa(a ? useAnalysis.getState().analysisFor(a.id) : null);
      setBb(b ? useAnalysis.getState().analysisFor(b.id) : null);
    }, 0);
    return () => clearTimeout(t);
  }, [a, b, account]);

  const options = useMemo(() => {
    const norm = normalizeName(q);
    return pokemon
      .filter((p) => p.id !== aId)
      .filter((p) => {
        const s = ref.getSpecies(p.speciesId, p.form);
        return !norm || (s && normalizeName(speciesDisplayName(s)).includes(norm)) || (p.nickname ? normalizeName(p.nickname).includes(norm) : false);
      })
      .sort((x, y) => Number(y.speciesId === a?.speciesId) - Number(x.speciesId === a?.speciesId) || (y.cp ?? 0) - (x.cp ?? 0))
      .slice(0, 40);
  }, [pokemon, q, aId, a, ref]);

  if (!a) {
    return (
      <Screen title="Compare" showBack>
        <EmptyState title="Pokémon not found" />
      </Screen>
    );
  }

  const col = (p: typeof a, an: PokemonAnalysis | null) => {
    const s = ref.getSpecies(p.speciesId, p.form);
    return (
      <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
        <PokemonImage speciesId={p.speciesId} form={p.form} shiny={p.shiny} size={84} />
        <Text variant="h3" numberOfLines={1} align="center">{p.nickname ?? (s ? speciesDisplayName(s) : '?')}</Text>
        <Text variant="numMd">{p.cp ? `CP ${fmtInt(p.cp)}` : 'CP —'}</Text>
        <Text variant="numSm" color="secondary">{an?.knowledge.level != null ? `L${fmtLevel(an.knowledge.level)}` : 'level ?'} · {p.ivs ? `${Math.round(ivPercent(p.ivs))}%` : 'IV ?'}</Text>
      </View>
    );
  };

  return (
    <Screen title="Compare Pokémon" subtitle="SPECIMEN MATRIX" showBack>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {col(a, aa)}
          {b ? col(b, bb) : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Button label="Choose Pokémon" size="sm" fullWidth={false} onPress={() => setPicking(true)} /></View>}
        </View>
        {b ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><IvBars ivs={a.ivs} compact /></View>
            <View style={{ flex: 1 }}><IvBars ivs={b.ivs} compact /></View>
          </View>
        ) : null}
        {b ? <Button label="Change comparison" variant="ghost" size="sm" fullWidth={false} onPress={() => setPicking(true)} /> : null}
      </Card>

      {b ? (
        aa && bb ? (
          <>
            <SectionHeader title="ROLE BY ROLE" caption="Potential once developed (now in brackets) — higher wins" />
            <Card style={{ gap: 12 }}>
              {ROLES.map((r) => {
                const x = aa.ratings[r];
                const y = bb.ratings[r];
                const xp = x.potential;
                const yp = y.potential;
                const win = xp === null || yp === null ? null : Math.abs(xp - yp) < 2 ? 'tie' : xp > yp ? 'a' : 'b';
                return (
                  <View key={r} style={{ gap: 4 }}>
                    <Text variant="label" color="muted">{ROLE_LABEL[r].toUpperCase()}</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      {[ [x, 'a'], [y, 'b'] ].map(([rt, side]) => {
                        const rr = rt as typeof x;
                        const won = win === side;
                        return (
                          <View key={side as string} style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: won ? c.accentSoft : c.canvas, borderWidth: 1, borderColor: won ? c.accent : c.border, alignItems: 'center' }}>
                            <Text variant="numMd" color={won ? 'accent' : 'primary'}>{rr.potential ?? '—'}</Text>
                            <Text variant="caption" color="muted">{rr.now !== null ? `now ${rr.now}` : ''} {rr.tier ? `· ${rr.tier}` : ''}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </Card>
            <SectionHeader title="VERDICTS" />
            <Card style={{ gap: 12 }}>
              {[aa, bb].map((an, i) => (
                <View key={i} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <Pill label={i === 0 ? 'LEFT' : 'RIGHT'} />
                    <Text variant="bodyMedium">{an.verdict.headline}</Text>
                  </View>
                  <Text variant="small" color="secondary">{an.verdict.explanation}</Text>
                </View>
              ))}
            </Card>
            <Text variant="caption" color="muted">
              {aa.verdict.impact !== bb.verdict.impact
                ? `Higher priority investment: ${aa.verdict.impact > bb.verdict.impact ? (a.nickname ?? aa.species.name) : (b.nickname ?? bb.species.name)}.`
                : 'Neither stands out as the better investment.'}
            </Text>
          </>
        ) : (
          <CardSkeleton rows={6} />
        )
      ) : null}

      <Sheet visible={picking} onClose={() => (b ? setPicking(false) : router.back())} title="Compare with…" tall>
        <Field value={q} onChangeText={setQ} placeholder="Search your Pokémon" autoCapitalize="none" />
        {options.map((p) => {
          const s = ref.getSpecies(p.speciesId, p.form);
          return (
            <Card key={p.id} onPress={() => { setOther(p.id); setPicking(false); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <PokemonImage speciesId={p.speciesId} form={p.form} size={44} kind="sprite" />
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">{p.nickname ?? (s ? speciesDisplayName(s) : '?')}</Text>
                <Text variant="caption" color="muted">{p.cp ? `CP ${fmtInt(p.cp)}` : 'CP —'} · {p.ivs ? `${Math.round(ivPercent(p.ivs))}% IV` : 'IV ?'}</Text>
              </View>
              {p.speciesId === a.speciesId ? <Pill label="SAME SPECIES" tone="accent" /> : null}
            </Card>
          );
        })}
        {options.length === 0 ? <Text variant="small" color="secondary">No other Pokémon match.</Text> : null}
      </Sheet>
    </Screen>
  );
}
