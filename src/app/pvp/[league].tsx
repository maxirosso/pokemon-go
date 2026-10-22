import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ChevronRight, Shield, Users } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { TypeRow } from '@/components/pokemon/Badges';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { EmptyState, Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { leagueRows } from '@/features/pvp/leagueCandidates';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import { LEAGUES, type LeagueId } from '@/engine/types';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme/useTheme';
import { fmtInt, fmtLevel } from '@/utils/format';

const TITLES: Record<LeagueId, string> = { great: 'Great League', ultra: 'Ultra League', master: 'Master League', little: 'Little Cup' };

export default function LeagueHub() {
  const { c } = useTheme();
  const { league: leagueParam } = useLocalSearchParams<{ league: string }>();
  const league = (['great', 'ultra', 'master', 'little'].includes(leagueParam) ? leagueParam : 'great') as LeagueId;
  const ref = useReference((s) => s.ref);
  const refStatus = useReference((s) => s.status);
  const pokemon = useData((s) => s.pokemon);
  const hasXl = useSettings((s) => s.hasXlCandy);
  const cap = LEAGUES[league].cpCap;

  const rows = useMemo(() => leagueRows(ref, pokemon, league, hasXl ? 50 : 40), [ref, pokemon, league, hasXl]);
  const ownedSpecies = useMemo(() => new Set(pokemon.map((p) => p.speciesId)), [pokemon]);
  const meta = useMemo(() => ref.topPvpMeta(league, 10), [ref, league]);
  const withIv = pokemon.filter((p) => p.ivs).length;

  const go = (href: string) => router.push(href as Href);

  return (
    <Screen title={TITLES[league]} subtitle={Number.isFinite(cap) ? `PVP · ${cap} CP CAP` : 'PVP · NO CP CAP'} showBack>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Pill label={Number.isFinite(cap) ? `CAP ${cap}` : 'UNCAPPED'} tone="blue" />
          <Pill label={hasXl ? 'LEVEL 50 ASSUMED' : 'LEVEL 40 MAX (NO XL)'} tone={hasXl ? 'neutral' : 'warning'} />
          {ref.hasPvpMeta() ? <Pill label={`PVPOKE · ${refStatus.pvpokeFetchedAt ? refStatus.pvpokeFetchedAt.slice(0, 10) : refStatus.dataTimestamp.slice(0, 10)}`} /> : <Pill label="LOCAL ESTIMATES" tone="warning" />}
        </View>
        <Text variant="small" color="secondary">
          {league === 'master'
            ? 'No CP cap: raw stats win, so Level 50 and high IVs matter most.'
            : league === 'little'
              ? 'Only Pokémon that can still evolve are allowed. Bulky babies and first stages shine.'
              : 'Pokémon are powered up until just under the cap. The IV spread with the best Attack×Defense×HP at that level ranks highest — often low Attack.'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Build a team" size="sm" fullWidth={false} icon={<Users size={16} color={c.accentOn} />} onPress={() => go(`/pvp/team?league=${league}`)} />
        </View>
      </Card>

      <SectionHeader title="YOUR BEST FOR THIS LEAGUE" caption={`${rows.length} rated · only Pokémon with IVs can be ranked (${withIv} of ${pokemon.length})`} />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Shield size={30} color={c.accent} />} title="No ranked Pokémon yet" body="Add IVs (from the appraisal) to your Pokémon to rank them for this league." actionLabel="Add Pokémon" onAction={() => go('/pokemon/add')} />
        </Card>
      ) : (
        rows.slice(0, 15).map((r, i) => {
          const a = r.assessment;
          return (
            <Card key={r.pokemon.id} onPress={() => go(`/pvp/ivs/${r.pokemon.id}?league=${league}`)} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text variant="numSm" color="accent">{i + 1}</Text>
                </View>
                <View style={{ width: 54, height: 54, borderRadius: 14, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>
                  <PokemonImage speciesId={r.pokemon.speciesId} form={r.pokemon.form} shiny={r.pokemon.shiny} size={50} kind="sprite" />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="h3" numberOfLines={1}>{r.pokemon.nickname ?? speciesDisplayName(r.species)}</Text>
                  <TypeRow types={r.species.types} compact />
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="numLg" style={{ fontSize: 22 }} color={r.suitability >= 78 ? 'accent' : r.suitability >= 62 ? 'blue' : 'secondary'}>{r.suitability}</Text>
                  <Text variant="micro" color="muted">{a.metaSource === 'pvpoke' ? 'PVPOKE' : 'ESTIMATE'}</Text>
                </View>
              </View>
              <Text variant="caption" color="muted">
                {a.entry
                  ? `IV rank #${a.entry.rank} of 4096 · ${a.percentOfBestProduct?.toFixed(1)}% stat product · best at L${fmtLevel(a.entry.level)} (CP ${fmtInt(a.entry.cp)})`
                  : a.rankRange
                    ? `IV rank #${a.rankRange.min}–#${a.rankRange.max} (IVs unknown)`
                    : ''}
                {r.powerUp ? ` · power up: ${fmtInt(r.powerUp.stardust)} dust + ${fmtInt(r.powerUp.candy)} candy${r.powerUp.xlCandy ? ` + ${fmtInt(r.powerUp.xlCandy)} XL` : ''}` : r.currentLevel === null ? ' · level unknown' : ' · already at league level'}
              </Text>
            </Card>
          );
        })
      )}

      {meta.length > 0 ? (
        <>
          <SectionHeader title="PROVIDER META (TOP 10)" caption="PvPoke rankings — species/forms, not your Pokémon" />
          <Card style={{ gap: 10 }}>
            {meta.map((m) => {
              const s = ref.getSpecies(m.speciesId, m.form);
              if (!s) return null;
              return (
                <View key={`${m.rank}-${m.speciesId}-${m.shadow}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text variant="numSm" color="muted" style={{ width: 24 }}>{m.rank}</Text>
                  <PokemonImage speciesId={m.speciesId} form={m.form} size={36} kind="sprite" />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium">{speciesDisplayName(s)}{m.shadow ? ' (Shadow)' : ''}</Text>
                    <Text variant="caption" color="muted" numberOfLines={1}>{m.moveset.map((x) => x.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ')).join(' · ')}</Text>
                  </View>
                  {ownedSpecies.has(m.speciesId) ? <Pill label="OWNED" tone="success" /> : null}
                  <Text variant="numSm">{m.score.toFixed(1)}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Open ${s.name} dossier`} hitSlop={8} onPress={() => go(`/pokedex/${m.speciesId}`)}><ChevronRight size={16} color={c.textMuted} /></Pressable>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}
      <Note>Scores are PvPoke’s 0–100 rankings for each species. Your Pokémon’s suitability also depends on its IV rank, so a high-ranked species with poor IVs scores lower.</Note>
    </Screen>
  );
}
