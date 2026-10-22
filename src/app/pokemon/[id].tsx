import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Calculator, Calendar, ChevronRight, GitBranch, Heart, Pencil, Plus, Scale, Share2, Shield, Sparkles, Swords, Trash2, Ghost, Star, Info } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LevelArc, StatBar, IvBars } from '@/components/charts/Charts';
import { KeyValue, RatingRow, CostMatrix } from '@/components/pokemon/Analysis';
import { TypeBadge, TypeRow, VerdictPill } from '@/components/pokemon/Badges';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { IconButton, Screen, SectionHeader } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { CardSkeleton, EmptyState, Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useSpeciesInfo } from '@/hooks/useSpeciesInfo';
import { calcCp, calcHp, ivPercent, ivStars, ivTotal, overallAppraisal } from '@/engine/combat/cp';
import { defensiveMatchups } from '@/engine/combat/typeChart';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import { ROLE_LABEL, VERDICT_LABEL, type PokemonAnalysis } from '@/engine/recommendations/types';
import { typeColors } from '@/theme/tokens';
import { addPlanFromVerdict } from '@/features/plan/planActions';
import { TeamPickerSheet } from '@/features/teams/TeamPickerSheet';
import { useAnalysis } from '@/store/analysis';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme/useTheme';
import { fmtDate, fmtInt, fmtLevel } from '@/utils/format';

export default function PokemonDetail() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pokemon = useData((s) => s.pokemon.find((p) => p.id === id));
  const lang = useSettings((s) => s.language);
  const ref = useReference((s) => s.ref);
  const account = useAnalysis((s) => s.account);
  const toggleFavorite = useData((s) => s.toggleFavorite);
  const deletePokemon = useData((s) => s.deletePokemon);
  const restorePokemon = useData((s) => s.restorePokemon);
  const [analysis, setAnalysis] = useState<PokemonAnalysis | null>(null);
  const [menu, setMenu] = useState(false);
  const [team, setTeam] = useState<null | 'raid' | 'great'>(null);
  const [showWhy, setShowWhy] = useState(false);
  const species = pokemon ? ref.getSpecies(pokemon.speciesId, pokemon.form) : undefined;
  const info = useSpeciesInfo(pokemon?.speciesId);

  useEffect(() => {
    if (!pokemon) return undefined;
    // compute after first paint; the previous analysis stays visible while it refreshes
    const t = setTimeout(() => setAnalysis(useAnalysis.getState().analysisFor(pokemon.id)), 0);
    return () => clearTimeout(t);
  }, [pokemon, account, ref]);

  const matchups = useMemo(() => (species ? defensiveMatchups(ref.typeChart, species.types) : null), [species, ref]);

  if (!pokemon || !species) {
    return (
      <Screen title="Pokémon" showBack>
        <EmptyState icon={<Info size={30} color={c.accent} />} title="Pokémon not found" body="It may have been deleted." actionLabel="Back to collection" onAction={() => router.replace('/(tabs)/collection')} />
      </Screen>
    );
  }

  const name = pokemon.nickname ?? speciesDisplayName(species);
  const v = analysis?.verdict;
  const k = analysis?.knowledge;
  const level = k?.level ?? pokemon.level;
  const typeColor = typeColors[species.types[0]];
  const iv = pokemon.ivs ? ivPercent(pokemon.ivs) : null;

  const maxCpAt = (lvl: number) => {
    if (pokemon.ivs) return `${fmtInt(calcCp(species.stats, pokemon.ivs, ref.cpm.get(lvl)))}`;
    const lo = calcCp(species.stats, { atk: 0, def: 0, sta: 0 }, ref.cpm.get(lvl));
    const hi = calcCp(species.stats, { atk: 15, def: 15, sta: 15 }, ref.cpm.get(lvl));
    return `${fmtInt(lo)}–${fmtInt(hi)}`;
  };

  const share = async () => {
    const Sharing = await import('expo-sharing');
    const text = `${name} · CP ${pokemon.cp ?? '?'} · ${iv === null ? 'IV ?' : `${pokemon.ivs?.atk}/${pokemon.ivs?.def}/${pokemon.ivs?.sta}`}`;
    toast.info(text);
    void Sharing;
  };

  const confirmDelete = () => {
    Alert.alert(`Delete ${name}?`, 'This removes it from your collection. You can undo right after.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePokemon(pokemon.id);
          router.back();
          toast.info(`${name} deleted`, { actionLabel: 'Undo', onAction: () => void restorePokemon(pokemon.id) });
        },
      },
    ]);
  };

  const go = (href: string) => router.push(href as Href);

  const primaryCta = () => {
    if (!v) return null;
    if (v.action === 'EVOLVE' || v.action === 'WAIT_FOR_EVENT') return { label: 'Open evolution advisor', href: `/pokemon/evolution/${pokemon.id}`, icon: <GitBranch size={18} color={c.accentOn} /> };
    if (v.action === 'POWER_UP' || v.action === 'SAVE_FOR_PVP') return { label: 'Open power-up calculator', href: `/pokemon/powerup/${pokemon.id}`, icon: <Calculator size={18} color={c.accentOn} /> };
    if (v.action === 'MORE_INFO') return { label: 'Add missing details', href: `/pokemon/add?editId=${pokemon.id}`, icon: <Pencil size={18} color={c.accentOn} /> };
    return null;
  };
  const cta = primaryCta();

  return (
    <Screen
      title={name}
      subtitle={`#${String(species.speciesId).padStart(4, '0')} · SPECIMEN TELEMETRY`}
      showBack
      headerRight={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton label={pokemon.favorite ? 'Remove favorite' : 'Add favorite'} onPress={() => void toggleFavorite(pokemon.id)}>
            <Heart size={18} color={pokemon.favorite ? c.danger : c.textSecondary} fill={pokemon.favorite ? c.danger : 'transparent'} />
          </IconButton>
          <IconButton label="More actions" onPress={() => setMenu(true)}>
            <Text variant="h3">⋯</Text>
          </IconButton>
        </View>
      }
    >
      {/* ---- hero ---- */}
      <Animated.View entering={FadeInDown.duration(260)}>
        <Card padded={false} style={{ backgroundColor: `${typeColor}14` }}>
          <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 18, gap: 6 }}>
            <View style={{ width: 290, height: 214, alignItems: 'center' }}>
              {level !== null ? <LevelArc level={level} width={290} /> : null}
              <View style={{ position: 'absolute', top: level !== null ? 22 : 8 }}>
                <PokemonImage speciesId={pokemon.speciesId} form={pokemon.form} shiny={pokemon.shiny} size={178} accessibilityLabel={`${name} artwork`} />
              </View>
            </View>
            {level !== null ? <View style={{ alignItems: 'center' }}><Pill label={`LEVEL ${fmtLevel(level)} / 50`} tone="neutral" /></View> : null}
            <Text variant="micro" color="muted">
              COMBAT POWER
            </Text>
            <Text variant="display" color={pokemon.cp ? 'accent' : 'muted'} style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 44 }}>
              {pokemon.cp ? fmtInt(pokemon.cp) : '—'}
            </Text>
            <Text variant="h1" align="center">
              {speciesDisplayName(species)}
            </Text>
            <TypeRow types={species.types} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 }}>
              {pokemon.shiny ? <Pill label="SHINY" tone="warning" icon={<Sparkles size={12} color={c.warning} />} /> : null}
              {pokemon.shadow ? <Pill label="SHADOW" tone="danger" icon={<Ghost size={12} color={c.danger} />} /> : null}
              {pokemon.purified ? <Pill label="PURIFIED" tone="blue" /> : null}
              {pokemon.lucky ? <Pill label="LUCKY" tone="warning" icon={<Star size={12} color={c.warning} />} /> : null}
              {species.rarity !== 'standard' ? <Pill label={species.rarity.replace('-', ' ').toUpperCase()} tone="purple" /> : null}
              {pokemon.source === 'demo' ? <Pill label="DEMO DATA" tone="warning" /> : null}
              {pokemon.tags.filter((t) => t !== 'demo').map((t) => <Pill key={t} label={t} />)}
            </View>
          </View>
        </Card>
      </Animated.View>

      {/* ---- verdict ---- */}
      {!analysis ? (
        <CardSkeleton rows={4} />
      ) : v && analysis ? (
        <Animated.View entering={FadeInDown.delay(60).duration(260)}>
          <Card variant={v.impact > 0 && v.priority <= 2 ? 'glow' : 'default'} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="label" color="accent">
                TACTICAL ASSESSMENT
              </Text>
              {v.impact > 0 ? <Pill label={`PRIORITY ${v.priority}`} tone={v.priority <= 2 ? 'accent' : 'neutral'} /> : null}
            </View>
            <Text variant="h2">{v.headline}</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <VerdictPill action={v.action} label={VERDICT_LABEL[v.action].toUpperCase()} />
              <Pill label={v.when === 'now' ? 'DO IT NOW' : v.when === 'later' ? 'DO IT LATER' : v.when === 'never' ? 'NO ACTION NEEDED' : 'NEEDS DATA'} tone={v.when === 'now' ? 'accent' : 'neutral'} />
              <Pill label={`CONFIDENCE: ${v.confidence.toUpperCase()}`} tone={v.confidence === 'high' ? 'success' : v.confidence === 'medium' ? 'blue' : 'warning'} />
            </View>
            <Text variant="body" color="secondary">
              {v.explanation}
            </Text>
            {v.expectedBenefit ? (
              <View style={{ gap: 2 }}>
                <Text variant="micro" color="muted">
                  EXPECTED BENEFIT
                </Text>
                <Text variant="bodyMedium">{v.expectedBenefit}</Text>
              </View>
            ) : null}
            <CostMatrix cost={v.cost} affordable={v.affordable} />
            {v.alternative ? (
              <View style={{ gap: 2 }}>
                <Text variant="micro" color="muted">
                  ALTERNATIVE
                </Text>
                <Text variant="small" color="secondary">
                  {v.alternative}
                </Text>
              </View>
            ) : null}
            {cta ? <Button label={cta.label} icon={cta.icon} iconRight={<ChevronRight size={18} color={c.accentOn} />} onPress={() => go(cta.href)} /> : null}
            {v.impact > 0 ? (
              <Button
                label="Add to investment plan"
                variant="secondary"
                icon={<Plus size={18} color={c.text} />}
                onPress={async () => {
                  await addPlanFromVerdict(analysis);
                  toast.success('Added to your investment plan', { actionLabel: 'View', onAction: () => go('/plans') });
                }}
              />
            ) : null}
            <Text variant="caption" color="muted">
              Computed on your device from {analysis.datasetVersion}. {k?.note ?? ''}
            </Text>
          </Card>

          {analysis.evidence.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Button label={showWhy ? 'Hide the evidence' : 'Why? Show the evidence'} variant="ghost" size="sm" fullWidth={false} onPress={() => setShowWhy((s) => !s)} />
              {showWhy ? (
                <Card style={{ gap: 8, marginTop: 6 }}>
                  {analysis.evidence.map((e, i) => (
                    <Text key={i} variant="small" color="secondary">
                      • {e}
                    </Text>
                  ))}
                </Card>
              ) : null}
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      {/* ---- role ratings ---- */}
      <SectionHeader title="ROLE-SPECIFIC RATINGS" caption="Never one global score — each role is evaluated on its own mechanics" />
      <Card style={{ gap: 16 }}>
        {analysis ? (
          <>
            <RatingRow rating={analysis.ratings.raid} />
            <RatingRow rating={analysis.ratings.gymAttack} />
            <RatingRow rating={analysis.ratings.gymDefense} />
            <RatingRow rating={analysis.ratings.great} />
            <RatingRow rating={analysis.ratings.ultra} />
            <RatingRow rating={analysis.ratings.master} />
            <View style={{ gap: 4 }}>
              <KeyValue label="General usefulness" value={analysis.bestInLine?.value != null ? `${analysis.bestInLine.value}/100 (${ROLE_LABEL[analysis.bestInLine.bestRole ?? 'raid']})` : 'needs data'} />
              <KeyValue label="Investment efficiency" value={v && v.impact > 0 ? `${v.efficiency} pts per 50k Stardust` : '—'} />
            </View>
            <Text variant="caption" color="muted">
              Bar = potential once developed; marker = how strong it is right now. MODEL = on-device simulation, PVPOKE = provider meta ranking, ESTIMATE = local heuristic.
            </Text>
          </>
        ) : (
          <CardSkeleton rows={5} />
        )}
      </Card>

      {/* ---- IVs ---- */}
      <SectionHeader title="INDIVIDUAL VALUES" />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="small" color="secondary">
            {pokemon.ivs ? `${overallAppraisal(pokemon.ivs).replace('-', ' ')} · ${ivStars(pokemon.ivs)}★ · total ${ivTotal(pokemon.ivs)}/45` : 'IVs unknown'}
          </Text>
          <Pill label={iv === null ? 'UNKNOWN' : iv === 100 ? '100% FLAWLESS' : `${iv.toFixed(1)}%`} tone={iv === 100 ? 'accent' : 'neutral'} />
        </View>
        <IvBars ivs={pokemon.ivs} />
        {pokemon.hp ? (
          <KeyValue label="HP" value={`${pokemon.hp}`} />
        ) : null}
        <Text variant="caption" color="muted">
          IV percentage is only stat luck. A 100% Pokémon of a weak species is still weak — see the role ratings above.
        </Text>
        {!pokemon.ivs ? <Button label="Enter IVs" variant="secondary" size="sm" fullWidth={false} onPress={() => go(`/pokemon/add?editId=${pokemon.id}`)} /> : null}
      </Card>

      {/* ---- stats ---- */}
      <SectionHeader title="POKÉMON GO STATS" caption="Base stats from the Pokémon GO dataset (not main-series)" />
      <Card style={{ gap: 10 }}>
        <StatBar label="ATK" value={species.stats.atk} max={350} color={c.danger} />
        <StatBar label="DEF" value={species.stats.def} max={350} color={c.blue} />
        <StatBar label="STA" value={species.stats.sta} max={500} color={c.success} />
        <View style={{ height: 6 }} />
        <KeyValue label="CP at level 40" value={maxCpAt(40)} />
        <KeyValue label="CP at level 50" value={maxCpAt(50)} />
        <KeyValue label="Current HP" value={pokemon.hp ? String(pokemon.hp) : pokemon.ivs && level !== null ? `${calcHp(species.stats.sta, pokemon.ivs.sta, ref.cpm.get(level))} (computed)` : '—'} />
        <KeyValue label="Level" value={level !== null ? `${fmtLevel(level)}${k?.status === 'exact' && pokemon.level === null ? ' (derived)' : ''}` : k?.levelOptions.length ? `one of ${k.levelOptions.join(', ')}` : 'unknown'} />
        <KeyValue label="Generation" value={`Gen ${species.generation}`} />
        <KeyValue label="Candy family" value={ref.getSpecies(species.familyId)?.name ?? '—'} />
      </Card>

      {matchups ? (
        <Card style={{ gap: 10 }}>
          <Text variant="label" color="muted">
            WEAKNESSES
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {matchups.weaknesses.map((w) => (
              <View key={w.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TypeBadge type={w.type} compact />
                <Text variant="numSm" color="danger">
                  ×{w.multiplier.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="label" color="muted">
            RESISTANCES
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {matchups.resistances.map((w) => (
              <View key={w.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TypeBadge type={w.type} compact />
                <Text variant="numSm" color="success">
                  ×{w.multiplier.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {/* ---- moves ---- */}
      <SectionHeader title="EQUIPPED MOVESET" />
      <Card style={{ gap: 10 }}>
        {[
          { label: 'Fast', name: pokemon.fastMove, kind: 'fast' as const },
          { label: 'Charged 1', name: pokemon.chargedMove1, kind: 'charged' as const },
          { label: 'Charged 2', name: pokemon.chargedMove2, kind: 'charged' as const },
        ].map((m) => {
          const fm = m.name ? (m.kind === 'fast' ? ref.fastMove(m.name) : ref.chargedMove(m.name)) : undefined;
          const pool = ref.movePool(species.speciesId, species.form);
          const elite = !!m.name && !!pool && (pool.eliteFast.includes(m.name) || pool.eliteCharged.includes(m.name));
          return (
            <View key={m.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fm ? typeColors[fm.type] : c.elevatedHigh }} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" color={m.name ? 'primary' : 'muted'}>
                  {m.name ?? `${m.label}: not entered`}
                </Text>
                {fm ? (
                  <Text variant="caption" color="muted">
                    {fm.type} · {fm.power} PWR · {m.kind === 'fast' ? `${fm.energy} EPT-energy · ${(('durationMs' in fm ? fm.durationMs : 0) / 1000).toFixed(1)}s` : `${(fm as { energy: number }).energy} energy`}
                  </Text>
                ) : null}
              </View>
              {elite ? <Pill label="ELITE" tone="warning" /> : null}
            </View>
          );
        })}
        {analysis && analysis.line[0] && analysis.ratings.raid.detail ? (
          <Button label="Audit moveset in raid analysis" variant="ghost" size="sm" fullWidth={false} icon={<Swords size={16} color={c.textSecondary} />} onPress={() => go(`/raids?pokemon=${pokemon.id}`)} />
        ) : null}
      </Card>

      {/* ---- evolution ---- */}
      {!species.isFinalStage || species.stage > 0 ? (
        <>
          <SectionHeader title="EVOLUTION FAMILY" />
          <Card onPress={() => go(`/pokemon/evolution/${pokemon.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <GitBranch size={20} color={c.accent} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium">Open the evolution advisor</Text>
              <Text variant="caption" color="muted">
                Candy costs, requirements and the exact CP after evolving.
              </Text>
            </View>
            <ChevronRight size={18} color={c.textMuted} />
          </Card>
        </>
      ) : null}

      {analysis && analysis.betterOwned.length > 0 ? (
        <>
          <SectionHeader title="BETTER OPTIONS YOU ALREADY OWN" />
          <View style={{ gap: 8 }}>
            {analysis.betterOwned.map((b) => (
              <Card key={b.pokemon.id} onPress={() => go(`/pokemon/${b.pokemon.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <PokemonImage speciesId={b.pokemon.speciesId} form={b.pokemon.form} shiny={b.pokemon.shiny} size={48} kind="sprite" />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">{speciesDisplayName(b.species)}</Text>
                  <Text variant="caption" color="muted">
                    CP {b.pokemon.cp ?? '—'} · scores {b.score}/100 in this role
                  </Text>
                </View>
                <ChevronRight size={18} color={c.textMuted} />
              </Card>
            ))}
          </View>
        </>
      ) : null}

      {info.data?.description[lang] ?? info.data?.description.en ? (
        <>
          <SectionHeader title="POKÉDEX ENTRY" caption="PokéAPI (main-series flavour text)" />
          <Card style={{ gap: 6 }}>
            {info.data?.genus[lang] ?? info.data?.genus.en ? (
              <Text variant="micro" color="muted">
                {(info.data?.genus[lang] ?? info.data?.genus.en ?? '').toUpperCase()}
              </Text>
            ) : null}
            <Text variant="small" color="secondary">
              {info.data?.description[lang] ?? info.data?.description.en}
            </Text>
          </Card>
        </>
      ) : null}

      <Card style={{ gap: 4 }}>
        <KeyValue label="Added" value={fmtDate(pokemon.createdAt)} />
        <KeyValue label="Source" value={pokemon.source} />
        {pokemon.dateCaught ? <KeyValue label="Caught" value={fmtDate(pokemon.dateCaught)} /> : null}
        {pokemon.notes ? <KeyValue label="Notes" value={pokemon.notes} /> : null}
      </Card>

      {/* ---- action sheet ---- */}
      <Sheet visible={menu} onClose={() => setMenu(false)} title="Actions">
        <View style={{ gap: 8 }}>
          {[
            { label: 'Calculate power-up', icon: <Calculator size={18} color={c.text} />, run: () => go(`/pokemon/powerup/${pokemon.id}`) },
            { label: 'Calculate evolution', icon: <GitBranch size={18} color={c.text} />, run: () => go(`/pokemon/evolution/${pokemon.id}`) },
            { label: 'Compare with another Pokémon', icon: <Scale size={18} color={c.text} />, run: () => go(`/pokemon/compare?a=${pokemon.id}`) },
            { label: 'Add to raid team', icon: <Swords size={18} color={c.text} />, run: () => setTeam('raid') },
            { label: 'Add to PvP team', icon: <Shield size={18} color={c.text} />, run: () => setTeam('great') },
            { label: 'PvP IV analysis', icon: <Info size={18} color={c.text} />, run: () => go(`/pvp/ivs/${pokemon.id}`) },
            { label: 'Add a plan reminder', icon: <Calendar size={18} color={c.text} />, run: () => go('/plans') },
            { label: 'Edit details', icon: <Pencil size={18} color={c.text} />, run: () => go(`/pokemon/add?editId=${pokemon.id}`) },
            { label: 'Share summary', icon: <Share2 size={18} color={c.text} />, run: () => void share() },
            { label: 'Delete', icon: <Trash2 size={18} color={c.danger} />, run: confirmDelete, danger: true },
          ].map((a) => (
            <Button
              key={a.label}
              label={a.label}
              variant={a.danger ? 'destructive' : 'secondary'}
              icon={a.icon}
              onPress={() => {
                setMenu(false);
                setTimeout(a.run, 220);
              }}
            />
          ))}
        </View>
      </Sheet>
      {team ? <TeamPickerSheet visible onClose={() => setTeam(null)} pokemonId={pokemon.id} mode={team} /> : null}
      <Note>Recommendations are computed on your device from real Pokémon GO mechanics and third-party datasets ({analysis?.datasetVersion ?? 'loading'}). They are guidance, not guarantees.</Note>
    </Screen>
  );
}
