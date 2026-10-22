import { router, type Href } from 'expo-router';
import { ArrowDown, ArrowUp, Trash2, Users, X } from 'lucide-react-native';
import { Alert, Pressable, View } from 'react-native';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { EmptyState } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import type { SavedTeamRecord } from '@/engine/io/backup';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';
import { fmtInt } from '@/utils/format';

const MODE_LABEL: Record<SavedTeamRecord['mode'], string> = { raid: 'Raid', great: 'Great League', ultra: 'Ultra League', master: 'Master League', little: 'Little Cup' };

export default function Teams() {
  const { c } = useTheme();
  const teams = useData((s) => s.teams);
  const pokemon = useData((s) => s.pokemon);
  const saveTeam = useData((s) => s.saveTeam);
  const removeTeam = useData((s) => s.removeTeam);
  const ref = useReference((s) => s.ref);
  const byId = new Map(pokemon.map((p) => [p.id, p]));

  const move = async (t: SavedTeamRecord, from: number, to: number) => {
    if (to < 0 || to >= t.memberIds.length) return;
    const ids = [...t.memberIds];
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    await saveTeam({ id: t.id, name: t.name, mode: t.mode, bossKey: t.bossKey, memberIds: ids });
  };

  const removeMember = async (t: SavedTeamRecord, id: string) => saveTeam({ id: t.id, name: t.name, mode: t.mode, bossKey: t.bossKey, memberIds: t.memberIds.filter((m) => m !== id) });

  const confirmDelete = (t: SavedTeamRecord) =>
    Alert.alert(`Delete “${t.name}”?`, 'The team is removed; your Pokémon are not.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void removeTeam(t.id) },
    ]);

  return (
    <Screen title="Saved teams" subtitle="RAID & PVP" showBack>
      {teams.length === 0 ? (
        <Card>
          <EmptyState icon={<Users size={30} color={c.accent} />} title="No saved teams" body="Build a raid team from a boss page, or a PvP team from a league page, and save it here." actionLabel="Open the Battle tab" onAction={() => router.navigate('/(tabs)/battle')} />
        </Card>
      ) : (
        teams.map((t) => (
          <Card key={t.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text variant="h3">{t.name}</Text>
                <Text variant="caption" color="muted">{t.memberIds.length} Pokémon</Text>
              </View>
              <Pill label={MODE_LABEL[t.mode].toUpperCase()} tone={t.mode === 'raid' ? 'accent' : 'blue'} />
              <Pressable accessibilityLabel={`Delete team ${t.name}`} hitSlop={10} onPress={() => confirmDelete(t)}>
                <Trash2 size={18} color={c.danger} />
              </Pressable>
            </View>
            {t.memberIds.map((id, i) => {
              const p = byId.get(id);
              const s = p ? ref.getSpecies(p.speciesId, p.form) : undefined;
              if (!p || !s) return null;
              return (
                <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.canvas, borderRadius: 14, padding: 8 }}>
                  <Text variant="numSm" color="muted" style={{ width: 16 }}>{i + 1}</Text>
                  <Pressable accessibilityRole="button" onPress={() => router.push(`/pokemon/${id}` as Href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <PokemonImage speciesId={p.speciesId} form={p.form} shiny={p.shiny} size={40} kind="sprite" />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" numberOfLines={1}>{p.nickname ?? speciesDisplayName(s)}</Text>
                      <Text variant="caption" color="muted">{p.cp ? `CP ${fmtInt(p.cp)}` : 'CP —'}</Text>
                    </View>
                  </Pressable>
                  <Pressable accessibilityLabel="Move up" hitSlop={8} onPress={() => void move(t, i, i - 1)}><ArrowUp size={18} color={i === 0 ? c.elevatedHigh : c.textSecondary} /></Pressable>
                  <Pressable accessibilityLabel="Move down" hitSlop={8} onPress={() => void move(t, i, i + 1)}><ArrowDown size={18} color={i === t.memberIds.length - 1 ? c.elevatedHigh : c.textSecondary} /></Pressable>
                  <Pressable accessibilityLabel="Remove from team" hitSlop={8} onPress={() => void removeMember(t, id)}><X size={18} color={c.textMuted} /></Pressable>
                </View>
              );
            })}
            {t.mode === 'raid' && t.bossKey ? (
              <Button
                label="Open boss analysis"
                variant="secondary"
                size="sm"
                fullWidth={false}
                onPress={() => {
                  const [sid, form, tier] = t.bossKey?.split(':') ?? [];
                  router.push(`/raids/boss?speciesId=${sid}&form=${form}&tier=${tier}` as Href);
                }}
              />
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}
