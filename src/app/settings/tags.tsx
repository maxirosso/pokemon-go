import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Form';
import { Screen } from '@/components/ui/Screen';
import { EmptyState } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { getDb } from '@/services/database/db';
import { tagRepo } from '@/services/database/repositories';
import { useData } from '@/store/data';
import { useTheme } from '@/theme/useTheme';

const COLORS = ['#A7F36B', '#86A9FF', '#AA92FF', '#FFC66D', '#FF7784', '#57D7A1'];

export default function TagManager() {
  const { c } = useTheme();
  const tags = useData((s) => s.tags);
  const reloadTags = useData((s) => s.reloadTags);
  const reload = useData((s) => s.reload);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    await tagRepo.create(await getDb(), n, COLORS[tags.length % COLORS.length]);
    setName('');
    await reloadTags();
  };
  const rename = async (from: string) => {
    const to = draft.trim();
    if (!to || to === from) return setEditing(null);
    if (tags.some((t) => t.name === to)) {
      toast.error('A tag with that name already exists.');
      return;
    }
    await tagRepo.rename(await getDb(), from, to);
    setEditing(null);
    await reload();
  };
  const remove = (n: string, count: number) =>
    Alert.alert(`Delete tag “${n}”?`, count ? `It will be removed from ${count} Pokémon (the Pokémon are kept).` : 'No Pokémon use it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await tagRepo.remove(await getDb(), n); await reload(); } },
    ]);

  return (
    <Screen title="Tags" subtitle="TAXONOMY" showBack>
      <Card style={{ gap: 10 }}>
        <Field label="NEW TAG" value={name} onChangeText={setName} placeholder="e.g. keeper, trade, great-league" autoCapitalize="none" onSubmitEditing={() => void add()} returnKeyType="done" />
        <Button label="Create tag" disabled={!name.trim()} onPress={() => void add()} />
      </Card>
      {tags.length === 0 ? (
        <Card><EmptyState title="No tags yet" body="Tag Pokémon from their edit screen or by long-pressing in the collection." /></Card>
      ) : (
        tags.map((t) => (
          <Card key={t.name} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: t.color ?? c.textMuted }} />
              {editing === t.name ? (
                <View style={{ flex: 1 }}>
                  <Field value={draft} onChangeText={setDraft} autoCapitalize="none" onSubmitEditing={() => void rename(t.name)} autoFocus />
                </View>
              ) : (
                <Pressable style={{ flex: 1 }} onPress={() => { setEditing(t.name); setDraft(t.name); }}>
                  <Text variant="bodyMedium">{t.name}</Text>
                  <Text variant="caption" color="muted">{t.count} Pokémon · tap to rename</Text>
                </Pressable>
              )}
              <Pressable accessibilityLabel={`Delete tag ${t.name}`} hitSlop={10} onPress={() => remove(t.name, t.count)}><Trash2 size={18} color={c.danger} /></Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {COLORS.map((col) => (
                <Pressable key={col} accessibilityLabel={`Set colour ${col}`} onPress={async () => { await tagRepo.setColor(await getDb(), t.name, col); await reloadTags(); }} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: col, borderWidth: t.color === col ? 2 : 0, borderColor: c.text }} />
              ))}
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
