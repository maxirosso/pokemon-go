import { router, type Href } from 'expo-router';
import { Bell, Check, Trash2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { Button } from '@/components/ui/Button';
import { NumberField, Segmented, SwitchRow } from '@/components/ui/Form';
import { Chip, Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { EmptyState, Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { VERDICT_LABEL, type VerdictAction } from '@/engine/recommendations/types';
import { buildBudgetPlans, comparePlans, type BudgetPlan } from '@/engine/recommendations/budget';
import { addPlanFromVerdict } from '@/features/plan/planActions';
import { requestNotificationPermission } from '@/services/notifications/notifications';
import { getDb } from '@/services/database/db';
import { planRepo, type PlanAction } from '@/services/database/repositories';
import { buildAnalysisContext, useAnalysis } from '@/store/analysis';
import { useData } from '@/store/data';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme/useTheme';
import { fmtInt } from '@/utils/format';

type Tab = 'queue' | 'budget' | 'ledger';

const isoInDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

function costLine(a: Pick<PlanAction, 'estimatedStardust' | 'estimatedCandy' | 'estimatedXl'>) {
  const p: string[] = [];
  if (a.estimatedStardust) p.push(`${fmtInt(a.estimatedStardust)} Stardust`);
  if (a.estimatedCandy) p.push(`${fmtInt(a.estimatedCandy)} Candy`);
  if (a.estimatedXl) p.push(`${fmtInt(a.estimatedXl)} Candy XL`);
  return p.length ? p.join(' + ') : 'No resources';
}

function PlanCard({ plan }: { plan: BudgetPlan }) {
  const { c } = useTheme();
  const account = useAnalysis((s) => s.account);
  const [adding, setAdding] = useState(false);
  const add = async () => {
    setAdding(true);
    try {
      for (const it of plan.items) await addPlanFromVerdict(it.action.analysis);
      toast.success(`Added ${plan.items.length} action(s) to your queue`);
    } finally {
      setAdding(false);
    }
  };
  return (
    <Card variant={plan.id === 'balanced' ? 'glow' : 'default'} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="h3">{plan.title}</Text>
        {plan.id === 'balanced' ? <Pill label="RECOMMENDED START" tone="accent" /> : null}
      </View>
      <Text variant="small" color="secondary">{plan.summary}</Text>
      {plan.items.map((it) => (
        <Pressable key={`${it.group}-${it.stopLevel ?? ''}`} accessibilityRole="button" onPress={() => router.push(`/pokemon/${it.action.id}` as Href)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.canvas, borderRadius: 14, padding: 10 }}>
          <PokemonImage speciesId={it.action.analysis.pokemon.speciesId} form={it.action.analysis.pokemon.form} size={40} kind="sprite" />
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium">{it.label}</Text>
            <Text variant="caption" color="muted">
              {fmtInt(it.stardust)} dust{it.candy ? ` · ${fmtInt(it.candy)} candy` : ''}{it.xlCandy ? ` · ${fmtInt(it.xlCandy)} XL` : ''} · impact +{it.gain.toFixed(0)}{it.partial ? ' (staged)' : ''}
            </Text>
          </View>
        </Pressable>
      ))}
      {plan.blockedByCandy.length > 0 ? (
        <Text variant="caption" color="warning">Skipped (not enough Candy): {plan.blockedByCandy.map((b) => b.label).join(', ')}</Text>
      ) : null}
      {plan.items.length > 0 ? <Button label="Add to my queue" variant="secondary" size="sm" loading={adding} fullWidth={false} onPress={() => void add()} /> : null}
      {account && plan.items.length === 0 ? null : null}
    </Card>
  );
}

export default function Plans() {
  const { c } = useTheme();
  const plan = useData((s) => s.plan);
  const resources = useData((s) => s.resources);
  const pokemon = useData((s) => s.pokemon);
  const reloadPlan = useData((s) => s.reloadPlan);
  const account = useAnalysis((s) => s.account);
  const remindersOn = useSettings((s) => s.notifications.planReminders);
  const setNotification = useSettings((s) => s.setNotification);
  const [tab, setTab] = useState<Tab>('queue');
  const dust = resources.find((r) => r.type === 'stardust')?.amount ?? null;
  const [budget, setBudget] = useState<number | null>(dust);
  const [enforceCandy, setEnforceCandy] = useState(true);
  const [plans, setPlans] = useState<BudgetPlan[] | null>(null);
  const [busy, setBusy] = useState(false);

  const planned = plan.filter((a) => a.status === 'planned');
  const done = plan.filter((a) => a.status === 'done');
  const totals = useMemo(
    () => ({
      dust: planned.reduce((s, a) => s + a.estimatedStardust, 0),
      candy: planned.reduce((s, a) => s + a.estimatedCandy, 0),
      xl: planned.reduce((s, a) => s + a.estimatedXl, 0),
    }),
    [planned],
  );
  const spent = done.reduce((s, a) => s + a.estimatedStardust, 0);
  const names = useMemo(() => new Map(pokemon.map((p) => [p.id, p])), [pokemon]);

  const run = () => {
    if (!account || budget === null) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const out = buildBudgetPlans(buildAnalysisContext(), account, { stardust: budget, enforceCandy });
        setPlans(out);
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  const setStatus = async (a: PlanAction, status: PlanAction['status']) => {
    await planRepo.setStatus(await getDb(), a.id, status);
    await reloadPlan();
    if (status === 'done') toast.success('Task completed');
  };
  const remove = (a: PlanAction) =>
    Alert.alert('Remove this task?', a.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await planRepo.remove(await getDb(), a.id); await reloadPlan(); } },
    ]);
  const remind = async (a: PlanAction, days: number | null) => {
    if (days !== null && !remindersOn) {
      const ok = await requestNotificationPermission();
      if (!ok) {
        toast.error('Notifications are blocked — enable them in system settings to get reminders.');
        return;
      }
      setNotification('planReminders', true);
    }
    const at = days === null ? null : isoInDays(days);
    await planRepo.setReminder(await getDb(), a.id, at);
    await reloadPlan();
    toast.success(days === null ? 'Reminder cleared' : `Reminder set for ${new Date(at as string).toISOString().slice(0, 10)}`);
  };

  return (
    <Screen title="Investment plan" subtitle="QUEUE · BUDGET · LEDGER" showBack>
      <Segmented
        options={[
          { value: 'queue' as Tab, label: `Queue (${planned.length})` },
          { value: 'budget' as Tab, label: 'Budget' },
          { value: 'ledger' as Tab, label: `Ledger (${done.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'queue' ? (
        <>
          <Card style={{ gap: 4 }}>
            <Text variant="label" color="muted">PLANNED COST</Text>
            <Text variant="numLg">{fmtInt(totals.dust)} <Text variant="small" color="muted">Stardust</Text></Text>
            <Text variant="small" color="secondary">
              {fmtInt(totals.candy)} Candy · {fmtInt(totals.xl)} Candy XL
              {dust !== null ? (totals.dust > dust ? ` · ${fmtInt(totals.dust - dust)} Stardust short of your balance` : ' · covered by your Stardust') : ' · enter Stardust to compare'}
            </Text>
          </Card>
          {planned.length === 0 ? (
            <Card>
              <EmptyState icon={<Check size={30} color={c.accent} />} title="Your queue is empty" body="Add actions from a Pokémon’s recommendation, the power-up or evolution calculators, or generate a plan from a budget." actionLabel="Plan with a budget" onAction={() => setTab('budget')} />
            </Card>
          ) : (
            planned.map((a) => {
              const p = a.pokemonId ? names.get(a.pokemonId) : undefined;
              return (
                <Card key={a.id} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    {p ? <PokemonImage speciesId={p.speciesId} form={p.form} size={44} kind="sprite" /> : null}
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        <Pill label={(VERDICT_LABEL[a.actionType as VerdictAction] ?? a.actionType).toUpperCase()} tone="accent" />
                        <Pill label={`PRIORITY ${a.priority}`} />
                        {a.reminderAt ? <Pill label={`REMIND ${a.reminderAt.slice(0, 10)}`} tone="blue" icon={<Bell size={10} color={c.blue} />} /> : null}
                      </View>
                      <Text variant="bodyMedium">{a.title}</Text>
                    </View>
                  </View>
                  <Text variant="numSm" color="secondary">{costLine(a)}</Text>
                  {a.note ? <Text variant="caption" color="muted">{a.note}</Text> : null}
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Text variant="caption" color="muted">Remind me</Text>
                    <Chip label="Tomorrow" onPress={() => void remind(a, 1)} />
                    <Chip label="3 days" onPress={() => void remind(a, 3)} />
                    <Chip label="1 week" onPress={() => void remind(a, 7)} />
                    {a.reminderAt ? <Chip label="Clear" onPress={() => void remind(a, null)} /> : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button label="Done" size="sm" fullWidth={false} icon={<Check size={16} color={c.accentOn} />} onPress={() => void setStatus(a, 'done')} />
                    <Button label="Skip" size="sm" variant="secondary" fullWidth={false} icon={<X size={16} color={c.text} />} onPress={() => void setStatus(a, 'skipped')} />
                    <Button label="Remove" size="sm" variant="destructive" fullWidth={false} icon={<Trash2 size={16} color={c.danger} />} onPress={() => remove(a)} />
                  </View>
                </Card>
              );
            })
          )}
          {!remindersOn ? <Note>Reminders are local notifications and only fire for dates you choose. Setting one asks for notification permission.</Note> : null}
        </>
      ) : null}

      {tab === 'budget' ? (
        <>
          <Text variant="small" color="secondary">
            Tell the planner how much Stardust you’re willing to spend. It compares investments from your actual collection using explicit constraints (Stardust, per-family Candy/XL) and an objective of goal-weighted impact.
          </Text>
          <NumberField label="STARDUST BUDGET" value={budget} onChange={setBudget} min={0} placeholder="e.g. 200000" hint={dust !== null ? `You have ${fmtInt(dust)} Stardust.` : 'Enter your Stardust in the bag to default this.'} />
          <SwitchRow label="Respect my Candy balances" description="Drops actions that need more Candy than you entered" value={enforceCandy} onChange={setEnforceCandy} />
          <Button label="Generate plans" loading={busy} disabled={!account || budget === null} onPress={run} />
          {!account ? <Note>The analysis is still running — plans need it to finish.</Note> : null}
          {plans ? (
            <>
              <Card variant="elevated"><Text variant="small">{comparePlans(plans)}</Text></Card>
              {plans.map((p) => <PlanCard key={p.id} plan={p} />)}
              <Note>Gains are the engine’s goal-weighted “impact” points; staged power-ups are pro-rated by CP-multiplier progress. No savings or ratings are invented beyond the engine’s own numbers.</Note>
            </>
          ) : null}
        </>
      ) : null}

      {tab === 'ledger' ? (
        <>
          <Card style={{ gap: 4 }}>
            <Text variant="label" color="muted">COMPLETED</Text>
            <Text variant="numLg">{done.length} tasks</Text>
            <Text variant="small" color="secondary">Estimated Stardust committed: {fmtInt(spent)}</Text>
          </Card>
          {done.length === 0 ? (
            <Card><Text variant="small" color="secondary">Completed tasks appear here.</Text></Card>
          ) : (
            done.map((a) => (
              <Card key={a.id} style={{ gap: 4 }}>
                <Text variant="bodyMedium">{a.title}</Text>
                <Text variant="caption" color="muted">{costLine(a)} · done {a.completedAt?.slice(0, 10)}</Text>
                <Button label="Undo" variant="ghost" size="sm" fullWidth={false} onPress={() => void setStatus(a, 'planned')} />
              </Card>
            ))
          )}
          <SectionHeader title="SKIPPED" />
          {plan.filter((a) => a.status === 'skipped').map((a) => (
            <Card key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="small" color="muted" style={{ flex: 1 }}>{a.title}</Text>
              <Button label="Restore" variant="ghost" size="sm" fullWidth={false} onPress={() => void setStatus(a, 'planned')} />
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
