import { router, type Href } from 'expo-router';
import { Bell, BookOpen, ChevronRight, ClipboardList, Cloud, Database, FileUp, Info, Languages, Package, Palette, Pencil, Tag, Users } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Segmented, SwitchRow } from '@/components/ui/Form';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { GOAL_LABEL } from '@/constants/goals';
import { APP_VERSION, BRAND } from '@/constants/brand';
import { useT } from '@/i18n';
import { useData } from '@/store/data';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme/useTheme';

function Link({ icon, title, subtitle, href }: { icon: React.ReactNode; title: string; subtitle?: string; href: string }) {
  const { c } = useTheme();
  return (
    <Card onPress={() => router.push(href as Href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium">{title}</Text>
        {subtitle ? <Text variant="caption" color="muted">{subtitle}</Text> : null}
      </View>
      <ChevronRight size={18} color={c.textMuted} />
    </Card>
  );
}

export default function Profile() {
  const { c } = useTheme();
  const t = useT();
  const trainer = useData((s) => s.trainer);
  const pokemon = useData((s) => s.pokemon);
  const plan = useData((s) => s.plan);
  const settings = useSettings();
  const ic = c.textSecondary;

  return (
    <Screen
      dock
      header={
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Text variant="micro" color="muted">GO COMPASS</Text>
          <Text variant="h1" accessibilityRole="header">{t('profile.title')}</Text>
        </View>
      }
    >
      <Card variant="elevated" style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="h1" color="onAccent">{(trainer?.nickname ?? '?').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="h2">{trainer?.nickname}</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Pill label={`LEVEL ${trainer?.trainerLevel}`} tone="accent" />
              {trainer?.playStyle ? <Pill label={trainer.playStyle.toUpperCase()} /> : null}
              <Pill label={`${pokemon.length} POKÉMON`} tone="blue" />
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit trainer" hitSlop={10} onPress={() => router.push('/settings/profile')}><Pencil size={18} color={c.textSecondary} /></Pressable>
        </View>
        {trainer?.goals.length ? (
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {trainer.goals.map((g) => (
              <Pill key={g.goal} label={`${GOAL_LABEL[g.goal]} · ${g.weight >= 0.9 ? 'HIGH' : g.weight >= 0.6 ? 'MED' : 'LOW'}`} tone="purple" />
            ))}
          </View>
        ) : (
          <Text variant="small" color="muted">No goals set — advice is balanced across raids and PvP.</Text>
        )}
      </Card>

      <SectionHeader title="TOOLS" />
      <Link icon={<Package size={18} color={ic} />} title="Resource bag" subtitle="Stardust, Candy, TMs, items" href="/resources" />
      <Link icon={<ClipboardList size={18} color={ic} />} title="Investment plan" subtitle={`${plan.filter((p) => p.status === 'planned').length} planned actions`} href="/plans" />
      <Link icon={<Users size={18} color={ic} />} title="Saved teams" href="/teams" />
      <Link icon={<BookOpen size={18} color={ic} />} title="Pokédex" subtitle="Browse every species with Pokémon GO stats" href="/pokedex" />
      <Link icon={<FileUp size={18} color={ic} />} title="Import" subtitle="Screenshots, CSV, JSON, backups" href="/import" />
      <Link icon={<Tag size={18} color={ic} />} title="Tags" href="/settings/tags" />

      <SectionHeader title={t('settings.theme').toUpperCase()} />
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Palette size={16} color={ic} />
          <Text variant="small" color="secondary">{t('settings.theme')}</Text>
        </View>
        <Segmented
          options={[
            { value: 'dark' as const, label: 'Dark' },
            { value: 'light' as const, label: 'Light' },
            { value: 'system' as const, label: 'System' },
          ]}
          value={settings.theme}
          onChange={(v) => settings.set({ theme: v })}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Languages size={16} color={ic} />
          <Text variant="small" color="secondary">{t('settings.language')}</Text>
        </View>
        <Segmented
          options={[
            { value: 'en' as const, label: 'English' },
            { value: 'es' as const, label: 'Español' },
          ]}
          value={settings.language}
          onChange={(v) => {
            settings.set({ language: v });
            void useData.getState().saveTrainer({ nickname: trainer?.nickname ?? 'Trainer', trainerLevel: trainer?.trainerLevel ?? 1, language: v });
          }}
        />
        <SwitchRow label="Haptic feedback" value={settings.hapticsEnabled} onChange={(v) => settings.set({ hapticsEnabled: v })} />
        <SwitchRow label="I have Candy XL (can power past level 40)" description="Sets the PvP ranking level cap to 50 instead of 40" value={settings.hasXlCandy} onChange={(v) => settings.set({ hasXlCandy: v })} />
      </Card>

      <SectionHeader title="SYSTEM" />
      <Link icon={<Bell size={18} color={ic} />} title="Notifications" subtitle="Local reminders — each category optional" href="/settings/notifications" />
      <Link icon={<Database size={18} color={ic} />} title="Backup, export & data" subtitle="Export, restore, reset" href="/settings/data" />
      <Link icon={<Cloud size={18} color={ic} />} title="Data sources & freshness" subtitle="Reference data version, refresh" href="/settings/reference" />
      <Link icon={<Cloud size={18} color={ic} />} title="AI coach & cloud sync" subtitle="Optional — everything works without it" href="/settings/cloud" />
      <Link icon={<Info size={18} color={ic} />} title="About, privacy & attribution" subtitle={`${BRAND.name} ${APP_VERSION}`} href="/settings/about" />
    </Screen>
  );
}
