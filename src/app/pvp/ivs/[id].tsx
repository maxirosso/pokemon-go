import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { Segmented } from '@/components/ui/Form';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { EmptyState, Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { resolveKnowledge } from '@/engine/combat/knowledge';
import { rankIvs, assessLeague, leagueEligibility, type IvRankEntry } from '@/engine/pvp/pvp';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import { LEAGUES, type IVs, type LeagueId } from '@/engine/types';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme/useTheme';
import { fmtInt, fmtLevel } from '@/utils/format';

const ivStr = (i: IVs) => `${i.atk}/${i.def}/${i.sta}`;

function Row({ e, label, highlight, best }: { e: IvRankEntry; label: string; highlight?: boolean; best: IvRankEntry }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, backgroundColor: highlight ? c.accentSoft : 'transparent', borderRadius: 8, paddingHorizontal: 6 }}>
      <Text variant="micro" color="muted" style={{ width: 58 }} numberOfLines={1}>{label}</Text>
      <Text variant="numSm" style={{ width: 64 }}>{ivStr(e.ivs)}</Text>
      <Text variant="numSm" style={{ width: 40 }}>L{fmtLevel(e.level)}</Text>
      <Text variant="numSm" style={{ width: 44 }}>{fmtInt(e.cp)}</Text>
      <Text variant="numSm" style={{ flex: 1, textAlign: 'right' }} color={e.rank === 1 ? 'accent' : 'primary'}>
        #{e.rank} · {((e.product / best.product) * 100).toFixed(1)}%
      </Text>
    </View>
  );
}

export default function PvpIvAnalyzer() {
  const { id, league: leagueParam } = useLocalSearchParams<{ id: string; league?: string }>();
  const pokemon = useData((s) => s.pokemon.find((p) => p.id === id));
  const ref = useReference((s) => s.ref);
  const hasXl = useSettings((s) => s.hasXlCandy);
  const [league, setLeague] = useState<LeagueId>((['great', 'ultra', 'master', 'little'].includes(leagueParam ?? '') ? leagueParam : 'great') as LeagueId);
  const species = pokemon ? ref.getSpecies(pokemon.speciesId, pokemon.form) : undefined;
  const maxLevel = hasXl ? 50 : 40;

  const data = useMemo(() => {
    if (!pokemon || !species) return null;
    const cap = LEAGUES[league].cpCap;
    const ranking = rankIvs(ref, species, cap, maxLevel);
    const k = resolveKnowledge(ref, species, pokemon);
    const assess = assessLeague(ref, species, k, league, { shadow: pokemon.shadow, maxLevel });
    return { ranking, k, assess, elig: leagueEligibility(species, league), top: ranking.count ? ranking.entries.slice(0, 10) : [] };
  }, [pokemon, species, ref, league, maxLevel]);

  if (!pokemon || !species || !data) {
    return (
      <Screen title="IV analyzer" showBack>
        <EmptyState title="Pokémon not found" />
      </Screen>
    );
  }
  const { ranking, assess, elig, top, k } = data;
  const best = ranking.best;
  const mine = k.ivs ? ranking.lookup(k.ivs) : null;
  const perfect = ranking.lookup({ atk: 15, def: 15, sta: 15 });

  return (
    <Screen title="PvP IV analyzer" subtitle={`${speciesDisplayName(species).toUpperCase()}`} showBack>
      <Segmented
        options={[
          { value: 'great' as LeagueId, label: 'Great' },
          { value: 'ultra' as LeagueId, label: 'Ultra' },
          { value: 'master' as LeagueId, label: 'Master' },
          { value: 'little' as LeagueId, label: 'Little' },
        ]}
        value={league}
        onChange={setLeague}
      />
      <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <PokemonImage speciesId={pokemon.speciesId} form={pokemon.form} shiny={pokemon.shiny} size={76} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="h3">{pokemon.nickname ?? speciesDisplayName(species)}</Text>
          <Text variant="numSm" color="secondary">
            {k.ivs ? `IVs ${ivStr(k.ivs)}` : 'IVs unknown'} · {pokemon.cp ? `CP ${fmtInt(pokemon.cp)}` : 'CP —'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pill label={Number.isFinite(LEAGUES[league].cpCap) ? `${LEAGUES[league].cpCap} CP` : 'NO CAP'} tone="blue" />
            {assess.suitability !== null ? <Pill label={`SUITABILITY ${assess.suitability}`} tone="accent" /> : null}
          </View>
        </View>
      </Card>

      {!elig.eligible ? (
        <Note tone="warning">{elig.reason ?? 'Not eligible'}</Note>
      ) : !best ? (
        <Note tone="warning">This species cannot get under the {LEAGUES[league].cpCap} CP cap, even at level 1.</Note>
      ) : (
        <>
          <SectionHeader title="YOUR IV SPREAD VS THE BEST" caption={Number.isFinite(LEAGUES[league].cpCap) ? `Best level under the cap, max level ${maxLevel}` : `Level ${maxLevel}`} />
          <Card style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 6 }}>
              <Text variant="micro" color="muted" style={{ width: 58 }}> </Text>
              <Text variant="micro" color="muted" style={{ width: 64 }}>IVS</Text>
              <Text variant="micro" color="muted" style={{ width: 40 }}>LVL</Text>
              <Text variant="micro" color="muted" style={{ width: 44 }}>CP</Text>
              <Text variant="micro" color="muted" style={{ flex: 1, textAlign: 'right' }}>RANK · PRODUCT</Text>
            </View>
            {mine ? <Row e={mine} label="YOURS" best={best} highlight /> : null}
            <Row e={best} label="BEST (#1)" best={best} />
            {perfect ? <Row e={perfect} label="15/15/15" best={best} /> : null}
            {!mine && assess.rankRange ? (
              <Text variant="small" color="secondary" style={{ padding: 6 }}>
                IVs unknown — your rank would be between #{assess.rankRange.min} and #{assess.rankRange.max}. Enter the appraisal IVs for an exact rank.
              </Text>
            ) : null}
          </Card>
          {mine ? (
            <Card style={{ gap: 6 }}>
              <Text variant="label" color="muted">VERDICT</Text>
              <Text variant="small" color="secondary">
                {mine.rank === 1
                  ? 'This is the best possible IV spread for this league.'
                  : `${((mine.product / best.product) * 100).toFixed(1)}% of the best stat product (rank #${mine.rank}). A ${Math.max(0, 100 - (mine.product / best.product) * 100).toFixed(1)}% stat-product gap is ${mine.product / best.product > 0.985 ? 'negligible in practice' : mine.product / best.product > 0.96 ? 'small — still very usable' : 'noticeable in close matchups'}.`}
                {perfect && mine.rank > perfect.rank ? ` It also outranks a 15/15/15 (rank #${perfect.rank}).` : ''}
                {perfect && mine.rank < perfect.rank && best.ivs.atk < 15 ? ` A 15/15/15 would rank #${perfect.rank} — high Attack IVs cost bulk under a CP cap.` : ''}
              </Text>
            </Card>
          ) : null}
          <SectionHeader title="TOP 10 IV SPREADS" caption="Ties share a rank" />
          <Card style={{ gap: 0 }}>
            {top.map((e) => (
              <Row key={ivStr(e.ivs)} e={e} label={`#${e.rank}`} best={best} highlight={!!k.ivs && ivStr(e.ivs) === ivStr(k.ivs)} />
            ))}
          </Card>
          <Note>
            Stat product = Attack × Defense × HP at the best level under the cap. It ignores your moveset and the opponent, so it is combined with PvPoke’s species ranking for the suitability score. {assess.meta ? `PvPoke meta score for ${species.name}: ${assess.meta.score.toFixed(1)}.` : 'PvPoke does not rank this species in this league — the score shown elsewhere is a local estimate.'}
          </Note>
        </>
      )}
    </Screen>
  );
}
