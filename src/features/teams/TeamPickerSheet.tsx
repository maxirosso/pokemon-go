import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Form';
import { Sheet } from '@/components/ui/Sheet';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import type { SavedTeamRecord } from '@/engine/io/backup';
import { useData } from '@/store/data';

export const TEAM_CAPACITY: Record<SavedTeamRecord['mode'], number> = { raid: 6, great: 3, ultra: 3, master: 3, little: 3 };

/** Add a Pokémon to a saved raid/PvP team, or start a new team with it. */
export function TeamPickerSheet({
  visible,
  onClose,
  pokemonId,
  mode,
  bossKey = null,
}: {
  visible: boolean;
  onClose: () => void;
  pokemonId: string;
  mode: SavedTeamRecord['mode'];
  bossKey?: string | null;
}) {
  const teams = useData((s) => s.teams).filter((t) => (mode === 'raid' ? t.mode === 'raid' : t.mode !== 'raid'));
  const saveTeam = useData((s) => s.saveTeam);
  const [name, setName] = useState('');
  const cap = TEAM_CAPACITY[mode];

  const add = async (t: SavedTeamRecord) => {
    if (t.memberIds.includes(pokemonId)) {
      toast.info('Already in that team');
      return;
    }
    if (t.memberIds.length >= TEAM_CAPACITY[t.mode]) {
      toast.error(`“${t.name}” is full (${TEAM_CAPACITY[t.mode]} slots).`);
      return;
    }
    await saveTeam({ id: t.id, name: t.name, mode: t.mode, bossKey: t.bossKey, memberIds: [...t.memberIds, pokemonId] });
    toast.success(`Added to ${t.name}`);
    onClose();
  };

  const create = async () => {
    const n = name.trim() || (mode === 'raid' ? 'New raid team' : 'New PvP team');
    await saveTeam({ name: n, mode, bossKey, memberIds: [pokemonId] });
    toast.success(`Created “${n}”`);
    setName('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={mode === 'raid' ? 'Add to raid team' : 'Add to PvP team'}>
      {teams.length > 0 ? (
        <View style={{ gap: 8 }}>
          {teams.map((t) => (
            <Card key={t.id} onPress={() => void add(t)} style={{ gap: 2 }}>
              <Text variant="bodyMedium">{t.name}</Text>
              <Text variant="caption" color="muted">
                {t.memberIds.length}/{TEAM_CAPACITY[t.mode]} members · {t.mode === 'raid' ? 'Raid' : `${t.mode[0].toUpperCase()}${t.mode.slice(1)} League`}
              </Text>
            </Card>
          ))}
        </View>
      ) : (
        <Text variant="small" color="secondary">
          No saved teams yet. Create one — up to {cap} Pokémon.
        </Text>
      )}
      <Field label="NEW TEAM NAME" value={name} onChangeText={setName} placeholder={mode === 'raid' ? 'e.g. Mewtwo counters' : 'e.g. Great League squad'} />
      <Button label="Create team with this Pokémon" onPress={() => void create()} />
    </Sheet>
  );
}
