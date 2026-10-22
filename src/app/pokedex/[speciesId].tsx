import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Check, Plus } from 'lucide-react-native';
import { useMemo } from 'react';
import { View } from 'react-native';
import { KeyValue } from '@/components/pokemon/Analysis';
import { TypeBadge, TypeRow } from '@/components/pokemon/Badges';
import { EvolutionTree } from '@/components/pokemon/EvolutionTree';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { StatBar } from '@/components/charts/Charts';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { EmptyState, Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { useSpeciesInfo } from '@/hooks/useSpeciesInfo';
import { defensiveMatchups } from '@/engine/combat/typeChart';
import { buildEvolutionTree } from '@/engine/evolution/evolution';
import { rankIvs } from '@/engine/pvp/pvp';
import { getRaidIndex } from '@/engine/raids/raidIndex';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import { LEAGUES, type LeagueId } from '@/engine/types';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme/useTheme';
import { fmtInt } from '@/utils/format';

export default function SpeciesDossier() {
  const { c } = useTheme();
  const { speciesId, form } = useLocalSearchParams<{ speciesId: string; form?: string }>();
  const ref = useReference((s) => s.ref);
  const lang = useSettings((s) => s.language);
  const pokemon = useData((s) => s.pokemon);
  const id = Number(speciesId);
  const species = ref.getSpecies(id, form ?? 'Normal');
  const info = useSpeciesInfo(id);
  const owned = pokemon.filter((p) => p.speciesId === id);

  const data = useMemo(() => {
    if (!species) return null;
    const idx = getRaidIndex(ref);
    const forms = ref.formsOf(id);
    const leagues = (['great', 'ultra', 'master'] as LeagueId[]).map((l) => {
      const r = rankIvs(ref, species, LEAGUES[l].cpCap, 50);
      const meta = ref.getPvpMeta(l, id, species.form, false);
      return { l, best: r.best, meta };
    });
    return { raid: idx.byKey.get(species.key), raidRank: idx.rankOf(species.key), forms, leagues, tree: buildEvolutionTree(ref, species.key), megas: ref.megaFormsOf(id), matchups: defensiveMatchups(ref.typeChart, species.types), pool: ref.movePool(id, species.form) };
  }, [ref, species, id]);

  if (!species || !data) {
    return (
      <Screen title="Pokédex" showBack>
        <EmptyState title="Species not found" />
      </Screen>
    );
  }
  const desc = info.data?.description[lang] ?? info.data?.description.en;
  const genus = info.data?.genus[lang] ?? info.data?.genus.en;

  return (
    <Screen title={speciesDisplayName(species)} subtitle={`#${String(id).padStart(4, '0')} · SPECIES DOSSIER`} showBack footer={<Button label={owned.length ? 'Add another to my collection' : 'Add to my collection'} icon={<Plus size={18} color={c.accentOn} />} onPress={() => router.push(`/pokemon/add?speciesId=${id}&form=${species.form}` as Href)} />}>
      <Card style={{ alignItems: 'center', gap: 8 }}>
        <PokemonImage speciesId={id} form={species.form} size={200} />
        <Text variant="h1">{speciesDisplayName(species)}</Text>
        {genus ? <Text variant="micro" color="muted">{genus.toUpperCase()}</Text> : null}
        <TypeRow types={species.types} />
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {owned.length > 0 ? <Pill label={`OWNED ×${owned.length}`} tone="success" icon={<Check size={10} color={c.success} />} /> : <Pill label="NOT OWNED" />}
          {species.rarity !== 'standard' ? <Pill label={species.rarity.replace('-', ' ').toUpperCase()} tone="purple" /> : null}
          {species.shinyAvailable ? <Pill label="SHINY AVAILABLE" tone="warning" /> : null}
          {species.shadowAvailable ? <Pill label="SHADOW AVAILABLE" tone="danger" /> : null}
          {data.megas.length ? <Pill label="MEGA ELIGIBLE" tone="accent" /> : null}
          <Pill label={`GEN ${species.generation}`} tone="blue" />
        </View>
        {desc ? <Text variant="small" color="secondary" align="center">{desc}</Text> : null}
      </Card>

      {data.forms.length > 1 ? (
        <Card style={{ gap: 8 }}>
          <Text variant="label" color="muted">FORMS</Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {data.forms.map((f) => (
              <Pill key={f.key} label={speciesDisplayName(f).toUpperCase()} tone={f.key === species.key ? 'accent' : 'neutral'} />
            ))}
          </View>
        </Card>
      ) : null}

      <SectionHeader title="POKÉMON GO STATS" caption="Base stats, not main-series" />
      <Card style={{ gap: 10 }}>
        <StatBar label="ATK" value={species.stats.atk} max={350} color={c.danger} />
        <StatBar label="DEF" value={species.stats.def} max={350} color={c.blue} />
        <StatBar label="STA" value={species.stats.sta} max={500} color={c.success} />
      </Card>

      <Card style={{ gap: 10 }}>
        <Text variant="label" color="muted">WEAKNESSES</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {data.matchups.weaknesses.map((w) => (
            <View key={w.type} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              <TypeBadge type={w.type} compact />
              <Text variant="numSm" color="danger">×{w.multiplier.toFixed(2)}</Text>
            </View>
          ))}
        </View>
        <Text variant="label" color="muted">RESISTANCES</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {data.matchups.resistances.map((w) => <TypeBadge key={w.type} type={w.type} compact />)}
        </View>
      </Card>

      <SectionHeader title="RAID POTENTIAL" caption="On-device damage model (estimate) — 15/15/15, level 40" />
      <Card style={{ gap: 4 }}>
        {data.raid ? (
          <>
            <KeyValue label="Best moveset" value={`${data.raid.fast} + ${data.raid.charged}${data.raid.elite ? ' ★' : ''}`} />
            <KeyValue label="Overall rank" value={`#${data.raidRank?.overall} of ${data.raidRank?.overallTotal}`} />
            <KeyValue label={`${data.raid.attackType}-move attackers`} value={`#${data.raidRank?.type} of ${data.raidRank?.typeTotal}`} />
            <KeyValue label="DPS / TDO" value={`${data.raid.dps.toFixed(1)} / ${Math.round(data.raid.tdo)}`} />
          </>
        ) : (
          <Text variant="small" color="secondary">No move data for this species.</Text>
        )}
      </Card>

      <SectionHeader title="PVP POTENTIAL" caption="Best IV spread per league + PvPoke meta score" />
      <Card style={{ gap: 6 }}>
        {data.leagues.map(({ l, best, meta }) => (
          <View key={l} style={{ gap: 2 }}>
            <Text variant="bodyMedium">{l[0].toUpperCase() + l.slice(1)} League</Text>
            <Text variant="caption" color="muted">
              {best ? `Best IVs ${best.ivs.atk}/${best.ivs.def}/${best.ivs.sta} at L${best.level} (CP ${fmtInt(best.cp)})` : 'Cannot reach this league'}
              {meta ? ` · PvPoke score ${meta.score.toFixed(1)} (#${meta.rank} of ${meta.total})` : ' · not ranked by PvPoke'}
            </Text>
          </View>
        ))}
      </Card>

      {data.tree && (data.tree.children.length > 0 || species.stage > 0) ? (
        <>
          <SectionHeader title="EVOLUTION TREE" />
          <Card><EvolutionTree root={data.tree} highlightKey={species.key} onPress={(key) => { const s = ref.getByKey(key); if (s) router.push(`/pokedex/${s.speciesId}?form=${s.form}` as Href); }} /></Card>
        </>
      ) : null}

      {data.megas.length > 0 ? (
        <Card style={{ gap: 6 }}>
          <Text variant="label" color="muted">MEGA EVOLUTIONS</Text>
          {data.megas.map((m) => (
            <Text key={m.name} variant="small" color="secondary">{m.name} — {m.energyFirst}/{m.energyRepeat} Mega Energy · ATK {m.stats.atk} DEF {m.stats.def} STA {m.stats.sta}</Text>
          ))}
        </Card>
      ) : null}

      {data.pool ? (
        <>
          <SectionHeader title="MOVES" caption="Current pool · ★ = Elite/legacy" />
          <Card style={{ gap: 6 }}>
            <Text variant="small" color="secondary">Fast: {[...data.pool.fast, ...data.pool.eliteFast.map((m) => `${m} ★`)].join(', ') || '—'}</Text>
            <Text variant="small" color="secondary">Charged: {[...data.pool.charged, ...data.pool.eliteCharged.map((m) => `${m} ★`)].join(', ') || '—'}</Text>
          </Card>
        </>
      ) : null}

      {owned.length > 0 ? (
        <>
          <SectionHeader title="YOUR SPECIMENS" />
          {owned.slice(0, 8).map((p) => (
            <Card key={p.id} onPress={() => router.push(`/pokemon/${p.id}` as Href)} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodyMedium">{p.nickname ?? species.name}</Text>
              <Text variant="numSm" color="secondary">{p.cp ? `CP ${fmtInt(p.cp)}` : 'CP —'} · {p.ivs ? `${p.ivs.atk}/${p.ivs.def}/${p.ivs.sta}` : 'IV ?'}</Text>
            </Card>
          ))}
        </>
      ) : null}
      <Note>Species text from PokéAPI (main-series). Stats, moves, evolutions and rankings are Pokémon GO data from PoGoAPI and PvPoke.</Note>
    </Screen>
  );
}
