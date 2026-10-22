import { router, type Href } from 'expo-router';
import { Bell, Bot, ChevronRight, FlaskConical, Plus, Radar, ScanLine, Sparkles, Swords, TriangleAlert } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { RadialGauge } from '@/components/charts/Charts';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { VerdictPill } from '@/components/pokemon/Badges';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { IconButton, Screen, SectionHeader } from '@/components/ui/Screen';
import { CardSkeleton, EmptyState, Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { summarizeCollection } from '@/features/collection/summary';
import { useT } from '@/i18n';
import { describeFreshness } from '@/services/reference/referenceService';
import { useAnalysis } from '@/store/analysis';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';
import { fmtCompact, fmtInt } from '@/utils/format';

function greetingKey(): 'home.greeting.morning' | 'home.greeting.afternoon' | 'home.greeting.evening' {
  const h = new Date().getHours();
  return h < 12 ? 'home.greeting.morning' : h < 18 ? 'home.greeting.afternoon' : 'home.greeting.evening';
}

function Tile({ label, value, onPress, tone }: { label: string; value: string; onPress?: () => void; tone?: 'accent' | 'warning' | 'purple' | 'danger' | 'blue' }) {
  return (
    <Card onPress={onPress} style={{ flexBasis: '31%', flexGrow: 1, paddingVertical: 12, paddingHorizontal: 12, gap: 2, borderRadius: 18 }} accessibilityLabel={`${label}: ${value}`}>
      <Text variant="micro" color="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="numLg" color={tone ?? 'primary'} style={{ fontSize: 24 }}>
        {value}
      </Text>
    </Card>
  );
}

export default function Home() {
  const { c } = useTheme();
  const t = useT();
  const trainer = useData((s) => s.trainer);
  const pokemon = useData((s) => s.pokemon);
  const resources = useData((s) => s.resources);
  const ref = useReference((s) => s.ref);
  const refStatus = useReference((s) => s.status);
  const account = useAnalysis((s) => s.account);
  const running = useAnalysis((s) => s.running);
  const summary = useMemo(() => summarizeCollection(pokemon, ref), [pokemon, ref]);
  const stardust = resources.find((r) => r.type === 'stardust')?.amount ?? null;
  const freshness = describeFreshness(refStatus);
  const go = (href: string) => router.push(href as Href);

  const readinessValues = account
    ? [
        { key: 'RAID', v: account.raidReadiness?.score ?? null },
        { key: 'GREAT', v: account.pvpReadiness.great?.score ?? null },
        { key: 'ULTRA', v: account.pvpReadiness.ultra?.score ?? null },
        { key: 'MASTER', v: account.pvpReadiness.master?.score ?? null },
      ]
    : [];
  const known = readinessValues.filter((r) => r.v !== null) as { key: string; v: number }[];
  const overall = known.length ? Math.round(known.reduce((s, r) => s + r.v, 0) / known.length) : null;
  const top = account?.priorities[0];

  const demoCount = summary.demo;

  return (
    <Screen
      dock
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border }}>
            <Radar size={20} color={c.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="micro" color="muted">
              GO COMPASS
            </Text>
            <Text variant="h3">{t('nav.home')}</Text>
          </View>
          <IconButton label="Notifications settings" onPress={() => go('/settings/notifications')}>
            <Bell size={18} color={c.textSecondary} />
          </IconButton>
          <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.navigate('/(tabs)/profile')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="h3" color="onAccent">
              {(trainer?.nickname ?? '?').slice(0, 1).toUpperCase()}
            </Text>
          </Pressable>
        </View>
      }
    >
      <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 6 }}>
        <Text variant="small" color="secondary">
          {t(greetingKey())},
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Text variant="h1" numberOfLines={1} style={{ flexShrink: 1 }}>
            Trainer {trainer?.nickname}
          </Text>
          <Pill label={`LVL ${trainer?.trainerLevel ?? '—'}`} tone="accent" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Pill label={`${fmtInt(summary.total)} POKÉMON`} />
          <Pill label={stardust === null ? 'STARDUST: ENTER IN BAG' : `${fmtCompact(stardust)} STARDUST`} tone={stardust === null ? 'warning' : 'blue'} />
          {trainer?.goals.length ? <Pill label={`GOAL: ${trainer.goals[0].goal.replace('_', ' ').toUpperCase()}`} tone="purple" /> : null}
        </View>
      </Animated.View>

      {demoCount > 0 ? (
        <Card variant="warning" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <FlaskConical size={18} color={c.warning} />
          <View style={{ flex: 1 }}>
            <Text variant="small" color="warning">
              You are viewing {demoCount} demo Pokémon — not your real collection.
            </Text>
          </View>
          <Button label="Manage" size="sm" variant="secondary" fullWidth={false} onPress={() => go('/settings/data')} />
        </Card>
      ) : null}

      {summary.total === 0 ? (
        <Card>
          <EmptyState
            icon={<Plus size={30} color={c.accent} />}
            title={t('home.emptyTitle')}
            body={t('home.emptyBody')}
            actionLabel={t('home.addFirst')}
            onAction={() => go('/pokemon/add')}
            secondaryLabel="Import screenshots or a file"
            onSecondary={() => go('/import')}
          />
        </Card>
      ) : (
        <>
          <Card variant="elevated" style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="label" color="muted">
                {t('home.readiness')}
              </Text>
              <Pill label="CALCULATED ON DEVICE" />
            </View>
            {overall !== null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                <RadialGauge value={overall} size={104} label={`Readiness ${overall} of 100`} color={overall >= 75 ? c.accent : overall >= 50 ? c.blue : c.warning}>
                  <Text variant="numLg" style={{ fontSize: 26 }}>
                    {overall}
                  </Text>
                </RadialGauge>
                <View style={{ flex: 1, gap: 6 }}>
                  {readinessValues.map((r) => (
                    <View key={r.key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="micro" color="muted">
                        {r.key}
                      </Text>
                      <Text variant="numSm" color={r.v === null ? 'muted' : 'primary'}>
                        {r.v === null ? '—' : r.v}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : running && !account ? (
              <CardSkeleton rows={2} />
            ) : (
              <Text variant="small" color="secondary">
                {t('home.readinessEmpty')} {account ? `(${account.dataQuality.rated} of ${account.dataQuality.total} rated so far)` : ''}
              </Text>
            )}
            <Text variant="caption" color="muted">
              Readiness = average “as-is” score of your best attackers (raids: top 6, PvP: top 3 per league). Hidden until enough Pokémon have data.
            </Text>
          </Card>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Tile label={t('home.summary.total').toUpperCase()} value={fmtInt(summary.total)} onPress={() => router.navigate('/(tabs)/collection')} />
            <Tile label={t('home.summary.species').toUpperCase()} value={fmtInt(summary.uniqueSpecies)} onPress={() => go('/pokedex')} />
            <Tile label={t('home.summary.perfect').toUpperCase()} value={fmtInt(summary.perfect)} tone="accent" onPress={() => go('/(tabs)/collection?q=4*')} />
            <Tile label={t('home.summary.shiny').toUpperCase()} value={fmtInt(summary.shiny)} tone="warning" onPress={() => go('/(tabs)/collection?q=shiny')} />
            <Tile label={t('home.summary.legendary').toUpperCase()} value={fmtInt(summary.legendary)} tone="purple" onPress={() => go('/(tabs)/collection?q=legendary')} />
            <Tile label={t('home.summary.mythical').toUpperCase()} value={fmtInt(summary.mythical)} tone="purple" onPress={() => go('/(tabs)/collection?q=mythical')} />
            <Tile label={t('home.summary.shadow').toUpperCase()} value={fmtInt(summary.shadow)} tone="danger" onPress={() => go('/(tabs)/collection?q=shadow')} />
            <Tile label={t('home.summary.lucky').toUpperCase()} value={fmtInt(summary.lucky)} tone="warning" onPress={() => go('/(tabs)/collection?q=lucky')} />
            <Tile label={t('home.summary.battleReady').toUpperCase()} value={account ? fmtInt(account.battleReady) : '…'} tone="blue" />
            <Tile label={t('home.summary.investable').toUpperCase()} value={account ? fmtInt(account.investable) : '…'} tone="accent" onPress={() => router.navigate('/(tabs)/advisor')} />
            <Tile label="FAVORITES" value={fmtInt(summary.favorites)} onPress={() => go('/(tabs)/collection?q=favorite')} />
            <Tile label="NEED DETAILS" value={fmtInt(summary.needDetails)} tone={summary.needDetails ? 'warning' : undefined} onPress={() => go('/(tabs)/collection?q=ivunknown,cpunknown')} />
          </View>

          <SectionHeader title={t('home.nextMove').toUpperCase()} right={<Pill label="AI-FREE · DETERMINISTIC" tone="accent" />} />
          {top ? (
            <Animated.View entering={FadeInDown.duration(260)}>
              <Card variant="glow" style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <VerdictPill action={top.action.verdict.action} label={top.action.verdict.headline} />
                    <Text variant="h2" numberOfLines={3}>
                      {top.title}
                    </Text>
                    <Text variant="small" color="secondary" numberOfLines={4}>
                      {top.action.verdict.explanation}
                    </Text>
                  </View>
                  <View style={{ width: 92, height: 92, borderRadius: 18, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>
                    <PokemonImage speciesId={top.action.analysis.pokemon.speciesId} form={top.action.analysis.pokemon.form} shiny={top.action.analysis.pokemon.shiny} size={84} />
                  </View>
                </View>
                <View style={{ backgroundColor: c.canvas, borderRadius: 14, padding: 12, gap: 2 }}>
                  <Text variant="micro" color="muted">
                    COST MATRIX
                  </Text>
                  <Text variant="numSm">{top.resources}</Text>
                </View>
                <Button
                  label={top.action.verdict.action === 'EVOLVE' ? 'Open evolution plan' : top.action.verdict.action === 'POWER_UP' || top.action.verdict.action === 'SAVE_FOR_PVP' ? 'Open power-up plan' : 'View recommendation'}
                  iconRight={<ChevronRight size={18} color={c.accentOn} />}
                  onPress={() =>
                    go(
                      top.action.verdict.action === 'EVOLVE'
                        ? `/pokemon/evolution/${top.action.id}`
                        : top.action.verdict.action === 'POWER_UP' || top.action.verdict.action === 'SAVE_FOR_PVP'
                          ? `/pokemon/powerup/${top.action.id}`
                          : `/pokemon/${top.action.id}`,
                    )
                  }
                />
              </Card>
            </Animated.View>
          ) : running && !account ? (
            <CardSkeleton rows={4} />
          ) : (
            <Card>
              <Text variant="small" color="secondary">
                {summary.needDetails > 0
                  ? 'No investment stands out yet. Add CP and IVs to your Pokémon — the advisor needs them to rank what to do next.'
                  : 'Nothing urgent: your collection has no standout upgrades right now. Check the Advisor for long-term ideas.'}
              </Text>
            </Card>
          )}

          {account && account.priorities.length > 1 ? (
            <>
              <SectionHeader title={t('home.priorities').toUpperCase()} caption="Ranked by goal-weighted impact" />
              <View style={{ gap: 8 }}>
                {account.priorities.slice(1).map((p) => (
                  <Card key={p.action.id} onPress={() => go(`/pokemon/${p.action.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Text variant="numSm" color="accent">
                        {p.rank}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyMedium" numberOfLines={2}>
                        {p.title}
                      </Text>
                      <Text variant="caption" color="muted" numberOfLines={2}>
                        {p.why}
                      </Text>
                      <Text variant="numSm" color="secondary" numberOfLines={1}>
                        {p.resources}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={c.textMuted} />
                  </Card>
                ))}
              </View>
            </>
          ) : null}

          {account && account.insights.length > 0 ? (
            <>
              <SectionHeader title={t('home.insights').toUpperCase()} right={<Text variant="caption" color="muted">{account.insights.length} items</Text>} />
              <View style={{ gap: 8 }}>
                {account.insights.slice(0, 5).map((i) => (
                  <Card key={i.id} onPress={() => go(i.href)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    {i.severity === 'warning' ? <TriangleAlert size={18} color={c.warning} /> : <Sparkles size={18} color={i.severity === 'opportunity' ? c.accent : c.blue} />}
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" numberOfLines={2}>
                        {i.title}
                      </Text>
                      <Text variant="caption" color="muted" numberOfLines={2}>
                        {i.body}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={c.textMuted} />
                  </Card>
                ))}
              </View>
            </>
          ) : null}

          <SectionHeader title="SHORTCUTS" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button label="Ask AI coach" size="sm" variant="secondary" fullWidth={false} icon={<Bot size={16} color={c.text} />} onPress={() => go('/assistant')} />
            <Button label="Raid counters" size="sm" variant="secondary" fullWidth={false} icon={<Swords size={16} color={c.text} />} onPress={() => go('/raids')} />
            <Button label="Add Pokémon" size="sm" variant="secondary" fullWidth={false} icon={<Plus size={16} color={c.text} />} onPress={() => go('/pokemon/add')} />
            <Button label="Scan screenshots" size="sm" variant="secondary" fullWidth={false} icon={<ScanLine size={16} color={c.text} />} onPress={() => go('/import')} />
          </View>
        </>
      )}

      <Note tone={freshness.severity === 'warn' ? 'warning' : 'info'}>{freshness.label} Recommendations are computed on your device from this data.</Note>
      {pokemon.length > 0 && !account && !running ? (
        <Pressable onPress={() => void useAnalysis.getState().run()}>
          <Text variant="small" color="blue" align="center">
            Run analysis
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

