import { router, type Href } from 'expo-router';
import { ChevronRight, Search, Shield, Swords, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { TypeRow } from '@/components/pokemon/Badges';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Form';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { TIER_LABELS } from '@/engine/raids/raidModel';
import { LEAGUES, type LeagueId } from '@/engine/types';
import { useT } from '@/i18n';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';

const LEAGUE_INFO: Record<LeagueId, { title: string; blurb: string; tone: 'blue' | 'purple' | 'accent' | 'warning' }> = {
  great: { title: 'Great League', blurb: '1,500 CP cap · IV ranks matter most', tone: 'blue' },
  ultra: { title: 'Ultra League', blurb: '2,500 CP cap · bulkier Pokémon', tone: 'purple' },
  master: { title: 'Master League', blurb: 'No cap · Level 50 and 15/15/15 matter', tone: 'accent' },
  little: { title: 'Little Cup', blurb: '500 CP cap · unevolved Pokémon only', tone: 'warning' },
};

const TIER_ORDER = ['mega_legendary', 'mega', '6', '5', 'ex', '4', '3', '2', '1'];

export default function Battle() {
  const { c } = useTheme();
  const t = useT();
  const ref = useReference((s) => s.ref);
  const refStatus = useReference((s) => s.status);
  const teams = useData((s) => s.teams);
  const [mode, setMode] = useState<'raids' | 'pvp'>('raids');
  const go = (href: string) => router.push(href as Href);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof ref.raidBosses>();
    for (const b of ref.raidBosses) m.set(b.tier, [...(m.get(b.tier) ?? []), b]);
    return TIER_ORDER.filter((tier) => m.has(tier)).map((tier) => ({ tier, bosses: m.get(tier) ?? [] }));
  }, [ref]);

  return (
    <Screen
      dock
      header={
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
          <View>
            <Text variant="micro" color="muted">
              GO COMPASS
            </Text>
            <Text variant="h1" accessibilityRole="header">
              {t('battle.title')}
            </Text>
          </View>
          <Segmented
            options={[
              { value: 'raids' as const, label: t('battle.raids') },
              { value: 'pvp' as const, label: t('battle.pvp') },
            ]}
            value={mode}
            onChange={setMode}
          />
        </View>
      }
    >
      {mode === 'raids' ? (
        <>
          <Card variant="glow" onPress={() => go('/raids')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Search size={22} color={c.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="h3">Pick any raid boss</Text>
              <Text variant="small" color="secondary">
                Search the Pokédex and get your best six counters from your own collection.
              </Text>
            </View>
            <ChevronRight size={18} color={c.textMuted} />
          </Card>

          <SectionHeader title="CURRENT RAID BOSSES" caption={`PoGoAPI · data from ${refStatus.dataTimestamp.slice(0, 10)}`} />
          {grouped.length === 0 ? (
            <Note>No current raid boss list is available. Pick a boss manually above — active raids are never invented.</Note>
          ) : (
            grouped.map(({ tier, bosses }) => (
              <View key={tier} style={{ gap: 8 }}>
                <Text variant="label" color="muted">
                  {(TIER_LABELS[tier] ?? tier).toUpperCase()}
                </Text>
                {bosses.map((b) => (
                  <Card key={`${tier}-${b.speciesId}-${b.form}`} onPress={() => go(`/raids/boss?speciesId=${b.speciesId}&form=${b.form}&tier=${tier}`)} padded={false}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
                      <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>
                        <PokemonImage speciesId={b.speciesId} form={b.form} size={52} kind="sprite" />
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text variant="h3">{b.name}</Text>
                        <TypeRow types={b.types} compact />
                      </View>
                      {b.possibleShiny ? <Pill label="SHINY" tone="warning" /> : null}
                      <ChevronRight size={18} color={c.textMuted} />
                    </View>
                  </Card>
                ))}
              </View>
            ))
          )}

          {teams.filter((tm) => tm.mode === 'raid').length > 0 ? (
            <>
              <SectionHeader title="SAVED RAID TEAMS" />
              {teams
                .filter((tm) => tm.mode === 'raid')
                .map((tm) => (
                  <Card key={tm.id} onPress={() => go('/teams')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Users size={20} color={c.accent} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium">{tm.name}</Text>
                      <Text variant="caption" color="muted">
                        {tm.memberIds.length}/6 Pokémon
                      </Text>
                    </View>
                    <ChevronRight size={18} color={c.textMuted} />
                  </Card>
                ))}
            </>
          ) : null}
          <Button label="Manage saved teams" variant="secondary" icon={<Users size={18} color={c.text} />} onPress={() => go('/teams')} />
        </>
      ) : (
        <>
          {(['great', 'ultra', 'master', 'little'] as LeagueId[]).map((l) => (
            <Card key={l} onPress={() => go(`/pvp/${l}`)} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>
                  <Shield size={22} color={l === 'great' ? c.blue : l === 'ultra' ? c.purple : l === 'master' ? c.accent : c.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">{LEAGUE_INFO[l].title}</Text>
                  <Text variant="small" color="secondary">
                    {LEAGUE_INFO[l].blurb}
                  </Text>
                </View>
                <Pill label={Number.isFinite(LEAGUES[l].cpCap) ? `${LEAGUES[l].cpCap} CP` : 'NO CAP'} tone={LEAGUE_INFO[l].tone} />
              </View>
            </Card>
          ))}
          <Note>
            PvP suitability combines the league CP cap, your IV stat-product rank and {ref.hasPvpMeta() ? 'PvPoke’s meta rankings' : 'a clearly-labelled local estimate'}. Rankings come from PvPoke (MIT) — see Settings → Data sources for the snapshot date.
          </Note>
          <Pressable accessibilityRole="button" onPress={() => go('/teams')}>
            <Text variant="small" color="blue" align="center">
              <Swords size={14} color={c.blue} /> View saved teams
            </Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}
