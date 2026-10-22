import { useLocalSearchParams, router, type Href } from 'expo-router';
import { Plus, Save, Wand2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { TypeBadge, TypeRow } from '@/components/pokemon/Badges';
import { Button } from '@/components/ui/Button';
import { Field, Segmented } from '@/components/ui/Form';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { CardSkeleton, Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import { analyzeTeam, buildCandidate, buildMetaThreats, suggestTeam, type PvpCandidate, type TeamAnalysis } from '@/engine/pvp/team';
import { LEAGUES, type LeagueId } from '@/engine/types';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme/useTheme';
import { fmtInt } from '@/utils/format';

const ROLE_NAMES = ['Lead', 'Safe switch', 'Closer'];

function cellColor(rating: number, c: ReturnType<typeof useTheme>['c']) {
  if (rating >= 600) return c.success;
  if (rating >= 500) return c.accent;
  if (rating >= 400) return c.warning;
  return c.danger;
}

export default function PvpTeamBuilder() {
  const { c } = useTheme();
  const { league: leagueParam } = useLocalSearchParams<{ league?: string }>();
  const [league, setLeague] = useState<LeagueId>((['great', 'ultra', 'master', 'little'].includes(leagueParam ?? '') ? leagueParam : 'great') as LeagueId);
  const ref = useReference((s) => s.ref);
  const pokemon = useData((s) => s.pokemon);
  const saveTeam = useData((s) => s.saveTeam);
  const hasXl = useSettings((s) => s.hasXlCandy);
  const maxLevel = hasXl ? 50 : 40;
  const [members, setMembers] = useState<PvpCandidate[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [analysis, setAnalysis] = useState<TeamAnalysis | null>(null);
  const [missing, setMissing] = useState<TeamAnalysis['gaps']>([]);

  const threats = useMemo(() => buildMetaThreats(ref, league, 12), [ref, league]);
  const candidates = useMemo(
    () => pokemon.map((p) => buildCandidate(ref, p, league, maxLevel)).filter((x): x is PvpCandidate => !!x).sort((a, b) => a.rank - b.rank),
    [ref, pokemon, league, maxLevel],
  );

  const reanalyze = (next: PvpCandidate[]) => {
    setMembers(next);
    setAnalysis(next.length ? analyzeTeam(ref, next, threats) : null);
    setMissing([]);
  };

  const suggest = () => {
    setBusy(true);
    setTimeout(() => {
      try {
        const s = suggestTeam(ref, pokemon, league, { maxLevel, threatCount: 12, candidateLimit: 14 });
        if (!s) {
          toast.info('Not enough rated Pokémon (they need IVs and a moveset) to build a team.');
          return;
        }
        setMembers(s.analysis.members);
        setAnalysis(s.analysis);
        setMissing(s.missingCoverage);
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const save = async () => {
    const n = name.trim() || `${league[0].toUpperCase()}${league.slice(1)} team`;
    await saveTeam({ name: n, mode: league, bossKey: null, memberIds: members.map((m) => m.pokemon.id) });
    toast.success(`Saved “${n}”`);
    setSaveOpen(false);
  };

  return (
    <Screen
      title="PvP team builder"
      subtitle={Number.isFinite(LEAGUES[league].cpCap) ? `${LEAGUES[league].cpCap} CP CAP` : 'NO CAP'}
      showBack
      footer={members.length > 0 ? <Button label="Save team" icon={<Save size={18} color={c.accentOn} />} onPress={() => setSaveOpen(true)} /> : undefined}
    >
      <Segmented
        options={[
          { value: 'great' as LeagueId, label: 'Great' },
          { value: 'ultra' as LeagueId, label: 'Ultra' },
          { value: 'master' as LeagueId, label: 'Master' },
          { value: 'little' as LeagueId, label: 'Little' },
        ]}
        value={league}
        onChange={(l) => {
          setLeague(l);
          setMembers([]);
          setAnalysis(null);
        }}
      />
      <Button label="Suggest the best team from my collection" icon={<Wand2 size={18} color={c.accentOn} />} loading={busy} onPress={suggest} />

      <SectionHeader title="YOUR TEAM" caption={`${candidates.length} Pokémon can be ranked for this league`} />
      <View style={{ gap: 8 }}>
        {[0, 1, 2].map((i) => {
          const m = members[i];
          return m ? (
            <Card key={m.pokemon.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 54, height: 54, borderRadius: 14, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>
                  <PokemonImage speciesId={m.pokemon.speciesId} form={m.pokemon.form} shiny={m.pokemon.shiny} size={50} kind="sprite" />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <Text variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{speciesDisplayName(m.species)}</Text>
                    {analysis?.roles ? <Pill label={ROLE_NAMES[[analysis.roles.lead, analysis.roles.safeSwitch, analysis.roles.closer].indexOf(i)] ?? ''} tone="blue" /> : null}
                  </View>
                  <TypeRow types={m.species.types} compact />
                  <Text variant="caption" color="muted">
                    IV rank #{m.rank} · L{m.level} CP {fmtInt(m.cp)} · {m.fighter.fast.name} + {m.fighter.charged.map((x) => x.name).join(', ')}{m.movesAssumed ? ' (provider moveset assumed)' : ''}
                  </Text>
                  {m.powerUp ? <Text variant="caption" color="warning">Needs power-up: {fmtInt(m.powerUp.stardust)} dust + {fmtInt(m.powerUp.candy)} candy{m.powerUp.xlCandy ? ` + ${fmtInt(m.powerUp.xlCandy)} XL` : ''}</Text> : null}
                </View>
                <Pressable accessibilityLabel={`Remove ${m.species.name}`} hitSlop={10} onPress={() => reanalyze(members.filter((x) => x.pokemon.id !== m.pokemon.id))}>
                  <X size={18} color={c.textMuted} />
                </Pressable>
              </View>
            </Card>
          ) : (
            <Card key={i} onPress={() => setPicking(true)} style={{ borderStyle: 'dashed', alignItems: 'center', padding: 18, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Plus size={18} color={c.textMuted} />
              <Text variant="small" color="muted">Add Pokémon (slot {i + 1})</Text>
            </Card>
          );
        })}
      </View>

      {busy ? <CardSkeleton rows={5} /> : null}

      {analysis ? (
        <>
          <SectionHeader title="MATCHUPS VS THE META" caption="1v1 simulation averaged over 0/1/2 shields — an estimate, not a tournament-grade sim" />
          <Card style={{ gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 70 }}>
                  {analysis.threats.map((t) => (
                    <View key={t.species.key + t.shadow} style={{ width: 44, alignItems: 'center' }}>
                      <PokemonImage speciesId={t.species.speciesId} form={t.species.form} size={30} kind="sprite" />
                      <Text variant="micro" color="muted" style={{ fontSize: 8 }} numberOfLines={1}>{t.species.name.slice(0, 7)}</Text>
                    </View>
                  ))}
                </View>
                {analysis.members.map((m, mi) => (
                  <View key={m.pokemon.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text variant="micro" color="muted" style={{ width: 64 }} numberOfLines={1}>{m.species.name}</Text>
                    {analysis.matrix[mi].map((cell, ti) => (
                      <View key={ti} style={{ width: 44, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: `${cellColor(cell.rating, c)}33`, borderWidth: 1, borderColor: cellColor(cell.rating, c) }}>
                        <Text variant="numSm" style={{ fontSize: 11 }}>{cell.rating}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
            <Text variant="caption" color="muted">≥500 = favourable. Coverage score (best member per threat): {analysis.coverageScore.toFixed(0)} / 1000.</Text>
          </Card>

          {analysis.sharedWeaknesses.length > 0 ? (
            <Card variant="warning" style={{ gap: 8 }}>
              <Text variant="label" color="warning">SHARED WEAKNESSES</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {analysis.sharedWeaknesses.map((w) => (
                  <View key={w.type} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                    <TypeBadge type={w.type} />
                    <Text variant="numSm" color="warning">×{w.members} members</Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : (
            <Note>No shared weaknesses: no type hits two of your three Pokémon super-effectively.</Note>
          )}

          <SectionHeader title="COVERAGE GAPS" caption="Threats none of your members beats on average" />
          {analysis.gaps.length === 0 ? (
            <Card><Text variant="small" color="success">Every top-{analysis.threats.length} threat is covered by at least one member.</Text></Card>
          ) : (
            <Card style={{ gap: 8 }}>
              {analysis.gaps.map((g) => (
                <Pressable key={g.species.key + g.shadow} onPress={() => router.push(`/pokedex/${g.species.speciesId}` as Href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <PokemonImage speciesId={g.species.speciesId} form={g.species.form} size={36} kind="sprite" />
                  <Text variant="small" style={{ flex: 1 }}>{speciesDisplayName(g.species)}{g.shadow ? ' (Shadow)' : ''} <Text variant="caption" color="muted">· meta #{g.rank}</Text></Text>
                </Pressable>
              ))}
              <Text variant="caption" color="muted">These are meta threats, not Pokémon you own. Use them to decide who to catch or build — they are never placed in your team automatically.</Text>
            </Card>
          )}
          {missing.length > 0 ? null : null}
        </>
      ) : members.length === 0 && candidates.length === 0 ? (
        <Note>None of your Pokémon can be ranked for this league yet — they need IVs and either their moves or a PvPoke-ranked moveset.</Note>
      ) : null}

      <Sheet visible={picking} onClose={() => setPicking(false)} title="Choose from your collection" tall>
        {candidates.length === 0 ? (
          <Text variant="small" color="secondary">No rankable Pokémon. Add IVs to your Pokémon.</Text>
        ) : (
          candidates.slice(0, 60).map((cand) => (
            <Card
              key={cand.pokemon.id}
              onPress={() => {
                if (members.some((m) => m.pokemon.id === cand.pokemon.id)) return;
                if (members.length >= 3) {
                  toast.error('A team has 3 Pokémon. Remove one first.');
                  return;
                }
                reanalyze([...members, cand]);
                setPicking(false);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <PokemonImage speciesId={cand.pokemon.speciesId} form={cand.pokemon.form} size={44} kind="sprite" />
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">{speciesDisplayName(cand.species)}</Text>
                <Text variant="caption" color="muted">IV rank #{cand.rank} · L{cand.level} CP {fmtInt(cand.cp)}</Text>
              </View>
            </Card>
          ))
        )}
      </Sheet>
      <Sheet visible={saveOpen} onClose={() => setSaveOpen(false)} title="Save PvP team" footer={<Button label="Save" onPress={() => void save()} />}>
        <Field label="TEAM NAME" value={name} onChangeText={setName} placeholder="e.g. Great League squad" />
      </Sheet>
    </Screen>
  );
}
