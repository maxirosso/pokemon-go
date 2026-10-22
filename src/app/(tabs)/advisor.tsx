import { router, type Href } from 'expo-router';
import { Bot, Check, ChevronRight, ClipboardList, Package, Sparkles } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { CostMatrix } from '@/components/pokemon/Analysis';
import { VerdictPill } from '@/components/pokemon/Badges';
import { TypeCoverageGrid } from '@/components/pokemon/TypeCoverageGrid';
import { Button } from '@/components/ui/Button';
import { ProgressBar, Segmented } from '@/components/ui/Form';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { CardSkeleton, EmptyState, Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { addPlanFromVerdict } from '@/features/plan/planActions';
import { useT } from '@/i18n';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import type { AccountAction } from '@/engine/recommendations/account';
import { getDb } from '@/services/database/db';
import { planRepo } from '@/services/database/repositories';
import { useAnalysis } from '@/store/analysis';
import { useData } from '@/store/data';
import { useTheme } from '@/theme/useTheme';
import { fmtCompact } from '@/utils/format';

type Horizon = 'today' | 'thisWeek' | 'longTerm';

function TaskCard({ a, done, onToggle }: { a: AccountAction; done: boolean; onToggle: () => void }) {
  const { c } = useTheme();
  const v = a.verdict;
  return (
    <Card style={{ gap: 10, opacity: done ? 0.55 : 1 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          aria-checked={done}
          accessibilityLabel={`Mark ${speciesDisplayName(a.analysis.species)} task ${done ? 'not done' : 'done'}`}
          onPress={onToggle}
          style={{ width: 26, height: 26, borderRadius: 9, borderWidth: 1.5, borderColor: done ? c.accent : c.borderStrong, backgroundColor: done ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}
        >
          {done ? <Check size={16} color={c.accentOn} strokeWidth={3} /> : null}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/pokemon/${a.id}` as Href)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flex: 1 }}>
          <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>
            <PokemonImage speciesId={a.analysis.pokemon.speciesId} form={a.analysis.pokemon.form} shiny={a.analysis.pokemon.shiny} size={48} kind="sprite" />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <VerdictPill action={v.action} />
              <Pill label={`PRIORITY ${v.priority}`} tone={v.priority <= 2 ? 'accent' : 'neutral'} />
            </View>
            <Text variant="h3" numberOfLines={1} style={{ textDecorationLine: done ? 'line-through' : 'none' }}>
              {speciesDisplayName(a.analysis.species)}
            </Text>
          </View>
          <ChevronRight size={18} color={c.textMuted} />
        </Pressable>
      </View>
      <Text variant="small" color="secondary">
        {v.expectedBenefit || v.headline}
      </Text>
      <CostMatrix cost={v.cost} affordable={v.affordable} />
    </Card>
  );
}

export default function Advisor() {
  const { c } = useTheme();
  const t = useT();
  const account = useAnalysis((s) => s.account);
  const running = useAnalysis((s) => s.running);
  const progress = useAnalysis((s) => s.progress);
  const pokemon = useData((s) => s.pokemon);
  const resources = useData((s) => s.resources);
  const plan = useData((s) => s.plan);
  const [horizon, setHorizon] = useState<Horizon>('today');
  const go = (href: string) => router.push(href as Href);

  const dust = resources.find((r) => r.type === 'stardust')?.amount ?? null;
  const rare = resources.find((r) => r.type === 'rare_candy')?.amount ?? null;
  const rareXl = resources.find((r) => r.type === 'rare_candy_xl')?.amount ?? null;

  const done = useMemo(() => {
    const s = new Set<string>();
    for (const p of plan) if (p.status === 'done' && p.pokemonId) s.add(`${p.pokemonId}|${p.actionType}`);
    return s;
  }, [plan]);

  const toggleDone = async (a: AccountAction) => {
    const key = `${a.id}|${a.verdict.action}`;
    const db = await getDb();
    const existing = plan.find((p) => p.pokemonId === a.id && p.actionType === a.verdict.action);
    if (existing) {
      await planRepo.setStatus(db, existing.id, existing.status === 'done' ? 'planned' : 'done');
      await useData.getState().reloadPlan();
    } else {
      await addPlanFromVerdict(a.analysis);
      const created = (await planRepo.list(db)).find((p) => p.pokemonId === a.id && p.actionType === a.verdict.action);
      if (created) await planRepo.setStatus(db, created.id, 'done');
      await useData.getState().reloadPlan();
    }
    toast.success(done.has(key) ? 'Marked as not done' : 'Task completed — nice!');
  };

  const list: AccountAction[] = account ? account.roadmap[horizon] : [];

  return (
    <Screen
      dock
      header={
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 2 }}>
          <Text variant="micro" color="accent">
            AUTONOMOUS · ON-DEVICE
          </Text>
          <Text variant="h1" accessibilityRole="header">
            {t('advisor.title')}
          </Text>
          <Text variant="small" color="secondary">
            Algorithmic ROI and account progression — deterministic, explainable.
          </Text>
        </View>
      }
    >
      {pokemon.length === 0 ? (
        <Card>
          <EmptyState icon={<Sparkles size={30} color={c.accent} />} title="Nothing to advise on yet" body="Add or import some Pokémon and the advisor will rank what to do next." actionLabel="Add Pokémon" onAction={() => go('/pokemon/add')} secondaryLabel="Import" onSecondary={() => go('/import')} />
        </Card>
      ) : (
        <>
          <Card variant="elevated" style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="label" color="muted">
                YOUR RESOURCES
              </Text>
              <Pressable accessibilityRole="button" onPress={() => go('/resources')}>
                <Text variant="small" color="blue">
                  Edit bag
                </Text>
              </Pressable>
            </View>
            <Text variant="numLg" color={dust === null ? 'muted' : 'primary'}>
              {dust === null ? 'Stardust not entered' : dust.toLocaleString('en-US')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, backgroundColor: c.canvas, borderRadius: 14, padding: 12 }}>
                <Text variant="micro" color="muted">
                  RARE CANDY
                </Text>
                <Text variant="numMd">{rare === null ? '—' : rare}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: c.canvas, borderRadius: 14, padding: 12 }}>
                <Text variant="micro" color="muted">
                  RARE CANDY XL
                </Text>
                <Text variant="numMd">{rareXl === null ? '—' : rareXl}</Text>
              </View>
            </View>
            {dust === null ? <Note>Enter your Stardust and Candy so every recommendation can say whether you can afford it today.</Note> : null}
          </Card>

          {running && !account ? (
            <Card style={{ gap: 8 }}>
              <Text variant="small" color="secondary">
                Analysing your collection… {Math.round(progress * 100)}%
              </Text>
              <ProgressBar value={progress} />
            </Card>
          ) : null}

          {account ? (
            <>
              <SectionHeader title="ROADMAP" caption="Every task explains its value and shows its cost" />
              <Segmented
                options={[
                  { value: 'today' as Horizon, label: `Today (${account.roadmap.today.length})` },
                  { value: 'thisWeek' as Horizon, label: `This week (${account.roadmap.thisWeek.length})` },
                  { value: 'longTerm' as Horizon, label: `Long term (${account.roadmap.longTerm.length})` },
                ]}
                value={horizon}
                onChange={setHorizon}
              />
              {list.length === 0 ? (
                <Card>
                  <Text variant="small" color="secondary">
                    {horizon === 'today'
                      ? account.actions.length === 0
                        ? 'No actions right now — add CP/IVs or Stardust to unlock recommendations.'
                        : 'Nothing is affordable and worthwhile today. Check “This week” and “Long term”, or save Stardust.'
                      : 'Nothing here yet.'}
                  </Text>
                </Card>
              ) : (
                <View style={{ gap: 10 }}>
                  {list.map((a) => (
                    <Animated.View key={a.id} entering={FadeInDown.duration(220)}>
                      <TaskCard a={a} done={done.has(`${a.id}|${a.verdict.action}`)} onToggle={() => void toggleDone(a)} />
                    </Animated.View>
                  ))}
                </View>
              )}

              <SectionHeader title="PRIORITY INVESTMENT QUEUE" caption="Ranked by goal-weighted impact" />
              {account.priorities.length === 0 ? (
                <Card>
                  <Text variant="small" color="secondary">
                    No investments stand out. That is a valid answer — Stardust you don’t spend is Stardust you keep.
                  </Text>
                </Card>
              ) : (
                account.priorities.map((p) => (
                  <Card key={p.action.id} onPress={() => go(`/pokemon/${p.action.id}`)} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <Pill label={`PRIORITY ${p.rank}`} tone={p.rank <= 2 ? 'accent' : 'neutral'} />
                      <VerdictPill action={p.action.verdict.action} />
                    </View>
                    <Text variant="h3">{p.title}</Text>
                    <Text variant="small" color="secondary">{p.why}</Text>
                    <Text variant="numSm" color="muted">{p.resources}</Text>
                  </Card>
                ))
              )}
              <Button label="Plan with a budget" variant="secondary" icon={<ClipboardList size={18} color={c.text} />} onPress={() => go('/plans')} />

              <SectionHeader title="RAID TYPE COVERAGE" caption="Best owned attacker per move type (current score)" />
              <Card style={{ gap: 10 }}>
                <TypeCoverageGrid coverage={account.coverage} onPress={(e) => e.best && go(`/pokemon/${e.best.pokemon.id}`)} />
                {account.dataQuality.rated < 8 ? (
                  <Note>Coverage verdicts appear once at least 8 Pokémon have enough data ({account.dataQuality.rated} so far).</Note>
                ) : account.missingTypes.length || account.weakTypes.length ? (
                  <Text variant="small" color="secondary">
                    {account.missingTypes.length ? `No attacker for: ${account.missingTypes.join(', ')}. ` : ''}
                    {account.weakTypes.length ? `Weakest coverage: ${account.weakTypes.slice(0, 4).join(', ')}.` : ''}
                  </Text>
                ) : (
                  <Text variant="small" color="success">
                    Every type has a solid attacker.
                  </Text>
                )}
              </Card>

              <SectionHeader title="ACCOUNT DIAGNOSIS" />
              <View style={{ gap: 8 }}>
                {account.insights.length === 0 ? (
                  <Card>
                    <Text variant="small" color="secondary">No issues found.</Text>
                  </Card>
                ) : (
                  account.insights.map((i) => (
                    <Card key={i.id} onPress={() => go(i.href)} style={{ gap: 2 }}>
                      <Text variant="bodyMedium">{i.title}</Text>
                      <Text variant="caption" color="muted">{i.body}</Text>
                    </Card>
                  ))
                )}
                {account.underdeveloped.length > 0 ? (
                  <Note>Underdeveloped high-value Pokémon: {account.underdeveloped.slice(0, 4).map((a) => speciesDisplayName(a.species)).join(', ')}.</Note>
                ) : null}
                {account.redundant.length > 0 ? (
                  <Note>Redundant investments to avoid: {account.redundant.slice(0, 4).map((a) => speciesDisplayName(a.species)).join(', ')} (you own stronger alternatives).</Note>
                ) : null}
                {account.unusedHighIv.length > 0 ? (
                  <Note>High-IV but low-value Pokémon (don’t spend Stardust yet): {account.unusedHighIv.slice(0, 4).map((a) => speciesDisplayName(a.species)).join(', ')}.</Note>
                ) : null}
              </View>

              <SectionHeader title="GOAL PROGRESS" caption="Only shown when there is enough data — never fabricated" />
              <Card style={{ gap: 14 }}>
                {account.goalProgress.map((g) => (
                  <View key={g.goal} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="bodyMedium">{g.label}</Text>
                      <Text variant="numSm" color={g.progress === null ? 'muted' : 'primary'}>
                        {g.progress === null ? '—' : `${g.progress}%`}
                      </Text>
                    </View>
                    <ProgressBar value={(g.progress ?? 0) / 100} tone="blue" label={g.label} />
                    <Text variant="caption" color="muted">{g.detail}</Text>
                  </View>
                ))}
              </Card>
              <Note>Dataset: {account.datasetVersion}. Resources: {dust === null ? 'not entered' : fmtCompact(dust) + ' Stardust'}.</Note>
            </>
          ) : running ? (
            <CardSkeleton rows={5} />
          ) : null}

          <Button label={t('advisor.askAi')} icon={<Bot size={18} color={c.accentOn} />} onPress={() => go('/assistant')} />
          <Button label="Open resource bag" variant="secondary" icon={<Package size={18} color={c.text} />} onPress={() => go('/resources')} />
        </>
      )}
    </Screen>
  );
}
