import { router, useLocalSearchParams, type Href } from 'expo-router';
import { AlertTriangle, ChevronRight, Save } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { TypeBadge, TypeRow } from '@/components/pokemon/Badges';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Form';
import { Chip, Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { CardSkeleton, EmptyState, Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { defensiveMatchups } from '@/engine/combat/typeChart';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import { getRaidIndex } from '@/engine/raids/raidIndex';
import { TIER_LABELS, bossTierConfig, type MegaBoost, type RaidModifiers } from '@/engine/raids/raidModel';
import { buildRaidTeam, raidVerdict, type RaidTeamResult } from '@/engine/raids/teamBuilder';
import { useScores } from '@/features/collection/useScores';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';
import { fmtInt } from '@/utils/format';

const WEATHERS = ['Clear', 'Fog', 'Overcast', 'Partly Cloudy', 'Rainy', 'Snow', 'Windy'];
const FRIENDSHIPS = ['Good Friend', 'Great Friend', 'Ultra Friend', 'Best Friend'];
const TIERS = ['1', '3', '4', '5', 'mega', 'mega_legendary', '6'];

export default function RaidBossAnalysis() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ speciesId: string; form?: string; tier?: string }>();
  const ref = useReference((s) => s.ref);
  const pokemon = useData((s) => s.pokemon);
  const saveTeam = useData((s) => s.saveTeam);
  const scores = useScores();
  const species = ref.getSpecies(Number(params.speciesId), params.form ?? 'Normal');
  const [tier, setTier] = useState(params.tier ?? '5');
  const [weather, setWeather] = useState<string | null>(null);
  const [friendship, setFriendship] = useState<string | null>(null);
  const [mega, setMega] = useState<MegaBoost>('none');
  const [result, setResult] = useState<RaidTeamResult | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const mods: RaidModifiers = useMemo(() => ({ weather, friendship, mega }), [weather, friendship, mega]);
  const matchups = useMemo(() => (species ? defensiveMatchups(ref.typeChart, species.types) : null), [species, ref]);
  const listedBoss = useMemo(() => ref.raidBosses.find((b) => b.speciesId === species?.speciesId && b.form === species?.form), [ref, species]);
  const boosted = listedBoss?.boostedWeather ?? [];

  useEffect(() => {
    if (!species) return undefined;
    const id = setTimeout(() => setResult(buildRaidTeam(ref, pokemon, species, tier, { mods })), 30);
    return () => clearTimeout(id);
  }, [species, ref, pokemon, tier, mods]);

  if (!species) {
    return (
      <Screen title="Raid boss" showBack>
        <EmptyState icon={<AlertTriangle size={30} color={c.warning} />} title="Boss not found" />
      </Screen>
    );
  }

  const cfg = bossTierConfig(tier);
  const verdict = result ? raidVerdict(result) : null;
  const index = getRaidIndex(ref);
  const weaknessTypes = matchups?.weaknesses.map((w) => w.type) ?? [];
  // species NOT in the collection that hit the boss's weaknesses — suggestions only, never presented as owned
  const ownedIds = new Set(pokemon.map((p) => p.speciesId));
  const wishlist = index.entries
    .filter((e) => weaknessTypes.includes(e.attackType) && !ownedIds.has(e.speciesId) && ref.getSpecies(e.speciesId)?.rarity === 'standard')
    .slice(0, 5);

  const save = async () => {
    if (!result) return;
    const name = teamName.trim() || `${species.name} counters`;
    await saveTeam({ name, mode: 'raid', bossKey: `${species.speciesId}:${species.form}:${tier}`, memberIds: result.members.map((m) => m.pokemon.id) });
    toast.success(`Saved “${name}”`);
    setSaveOpen(false);
  };

  return (
    <Screen
      title={`${speciesDisplayName(species)} raid`}
      subtitle="RAID COUNTER COMMAND"
      showBack
      footer={result && result.members.length > 0 ? <Button label="Save this team" icon={<Save size={18} color={c.accentOn} />} onPress={() => setSaveOpen(true)} /> : undefined}
    >
      <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View style={{ width: 96, height: 96, borderRadius: 22, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>
          <PokemonImage speciesId={species.speciesId} form={species.form} size={88} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text variant="h2">{speciesDisplayName(species)}</Text>
          <TypeRow types={species.types} />
          <Text variant="caption" color="muted">
            {TIER_LABELS[tier] ?? tier} · {fmtInt(cfg.hp)} HP · {cfg.timeLimitSec}s
            {listedBoss ? ` · CP ${fmtInt(listedBoss.cpMin)}–${fmtInt(listedBoss.cpMax)} when caught` : ''}
          </Text>
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text variant="label" color="muted">
          WEAK TO
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {matchups?.weaknesses.map((w) => (
            <View key={w.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TypeBadge type={w.type} />
              <Text variant="numSm" color="danger">
                ×{w.multiplier.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
        <Text variant="label" color="muted">
          RESISTS
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {matchups?.resistances.map((w) => (
            <TypeBadge key={w.type} type={w.type} compact />
          ))}
        </View>
      </Card>

      <SectionHeader title="BATTLE CONDITIONS" caption="Changes the damage model" />
      <Card style={{ gap: 12 }}>
        <Text variant="small" color="secondary">
          Raid tier
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TIERS.map((t) => (
            <Chip key={t} label={TIER_LABELS[t] ?? t} selected={tier === t} onPress={() => setTier(t)} />
          ))}
        </View>
        <Text variant="small" color="secondary">
          Weather{boosted.length ? ` (boss boosted in: ${boosted.join(', ')})` : ''}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="None" selected={weather === null} onPress={() => setWeather(null)} />
          {WEATHERS.map((w) => (
            <Chip key={w} label={w} tone={boosted.includes(w) ? 'warning' : 'accent'} selected={weather === w} onPress={() => setWeather(weather === w ? null : w)} />
          ))}
        </View>
        <Text variant="small" color="secondary">
          Friendship attack bonus
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="None" selected={friendship === null} onPress={() => setFriendship(null)} />
          {FRIENDSHIPS.map((f) => (
            <Chip key={f} label={f.replace(' Friend', '')} selected={friendship === f} onPress={() => setFriendship(friendship === f ? null : f)} />
          ))}
        </View>
        <Text variant="small" color="secondary">
          Mega boost in the lobby
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="None" selected={mega === 'none'} onPress={() => setMega('none')} />
          <Chip label="+10% (other type)" selected={mega === 'general'} onPress={() => setMega('general')} />
          <Chip label="+30% (same type)" selected={mega === 'type'} onPress={() => setMega('type')} />
        </View>
      </Card>

      <SectionHeader title="YOUR BEST SIX" caption="From your actual collection — Pokémon without CP/level/IVs can't be scored" />
      {!result ? (
        <CardSkeleton rows={6} />
      ) : !result || result.members.length === 0 ? (
        <Card>
          <EmptyState
            icon={<AlertTriangle size={30} color={c.warning} />}
            title="No scoreable counters"
            body={pokemon.length === 0 ? 'Add Pokémon to your collection first.' : `${result?.needsData.length ?? 0} Pokémon need CP, level or IVs before they can be scored.`}
            actionLabel="Add Pokémon"
            onAction={() => router.push('/pokemon/add')}
          />
        </Card>
      ) : (
        <>
          {verdict ? (
            <Card variant={verdict.level === 'strong' ? 'glow' : verdict.level === 'difficult' ? 'warning' : 'default'} style={{ gap: 6 }}>
              <Text variant="h3">{verdict.headline}</Text>
              {verdict.details.map((d, i) => (
                <Text key={i} variant="small" color="secondary">
                  {d}
                </Text>
              ))}
              <Text variant="caption" color="muted">
                {result.estimate.caveats.join(' ')}
              </Text>
            </Card>
          ) : null}
          {result.members.map((m, i) => {
            const sc = scores?.get(m.pokemon.id)?.verdict;
            return (
              <Card key={m.pokemon.id} onPress={() => router.push(`/pokemon/${m.pokemon.id}` as Href)} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text variant="numSm" color="accent">
                      {i + 1}
                    </Text>
                  </View>
                  <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>
                    <PokemonImage speciesId={m.pokemon.speciesId} form={m.pokemon.form} shiny={m.pokemon.shiny} size={52} kind="sprite" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="h3" numberOfLines={1}>
                      {speciesDisplayName(m.species)}
                    </Text>
                    <Text variant="numSm" color="secondary">
                      {m.cp ? `CP ${fmtInt(m.cp)}` : 'CP —'} · score {m.score.toFixed(1)}
                      {m.scoreRange ? ` (${m.scoreRange.low.toFixed(0)}–${m.scoreRange.high.toFixed(0)})` : ''}
                    </Text>
                  </View>
                  <Pill label={m.effectiveness > 1.01 ? `×${m.effectiveness.toFixed(2)} SE` : m.effectiveness < 0.99 ? `×${m.effectiveness.toFixed(2)} RESIST` : 'NEUTRAL'} tone={m.effectiveness > 1.01 ? 'success' : m.effectiveness < 0.99 ? 'danger' : 'neutral'} />
                </View>
                <View style={{ gap: 2 }}>
                  <Text variant="small">
                    {m.currentMovesAssumed ? 'Assumed' : 'Current'}: {m.current?.fast} + {m.current?.charged}{' '}
                    <Text variant="caption" color="muted">
                      · DPS {m.current?.dps.toFixed(1)} · TDO {Math.round(m.current?.tdo ?? 0)}
                    </Text>
                  </Text>
                  {m.best && (m.best.fast !== m.current?.fast || m.best.charged !== m.current?.charged) ? (
                    <Text variant="small" color={m.moveChangeRecommended ? 'success' : 'muted'}>
                      Best: {m.best.fast} + {m.best.charged}
                      {m.best.elite ? ' ★ elite' : ''}
                      {m.moveChangeRecommended ? ` — change moves (+${Math.round(m.moveChangeGain * 100)}%)` : ''}
                    </Text>
                  ) : null}
                  {m.notes.map((n, j) => (
                    <Text key={j} variant="caption" color="muted">
                      {n}
                    </Text>
                  ))}
                  {sc && sc.impact > 0 && (sc.action === 'POWER_UP' || sc.action === 'EVOLVE' || sc.action === 'CHANGE_MOVES') ? (
                    <Text variant="caption" color="accent">
                      Worth investing: {sc.headline.toLowerCase()} ({sc.expectedBenefit})
                    </Text>
                  ) : null}
                </View>
              </Card>
            );
          })}
          <Card style={{ gap: 4 }}>
            <Text variant="label" color="muted">
              TEAM ESTIMATE (ONE TRAINER)
            </Text>
            <Text variant="numLg">{Math.round(result.estimate.bossHpFraction * 100)}% of boss HP</Text>
            <Text variant="small" color="secondary">
              Model suggests ~{result.estimate.trainersNeeded} trainer{result.estimate.trainersNeeded > 1 ? 's' : ''} with similar teams. Total DPS ≈ {result.estimate.totalDps.toFixed(0)} while counters survive.
            </Text>
          </Card>
          {result.coverageGaps.length > 0 ? (
            <Note tone="warning">Your team lacks strong {result.coverageGaps.join(' / ')} damage — those are this boss’s weaknesses.</Note>
          ) : null}
          {result.needsData.length > 0 ? (
            <Note>{result.needsData.length} Pokémon were skipped because they have no CP/level/IVs. Add details to include them.</Note>
          ) : null}
        </>
      )}

      {wishlist.length > 0 ? (
        <>
          <SectionHeader title="NOT IN YOUR COLLECTION" caption="Strong species for this boss — suggestions to catch/build, not counters you own" />
          <Card style={{ gap: 10 }}>
            {wishlist.map((e) => (
              <View key={e.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <PokemonImage speciesId={e.speciesId} size={40} kind="sprite" />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">{e.name}</Text>
                  <Text variant="caption" color="muted">
                    {e.fast} + {e.charged}
                    {e.elite ? ' ★' : ''} · {e.attackType}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Open ${e.name} dossier`} hitSlop={8} onPress={() => router.push(`/pokedex/${e.speciesId}` as Href)}><ChevronRight size={16} color={c.textMuted} /></Pressable>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Sheet visible={saveOpen} onClose={() => setSaveOpen(false)} title="Save raid team" footer={<Button label="Save" onPress={() => void save()} />}>
        <Field label="TEAM NAME" value={teamName} onChangeText={setTeamName} placeholder={`${species.name} counters`} />
      </Sheet>
    </Screen>
  );
}

