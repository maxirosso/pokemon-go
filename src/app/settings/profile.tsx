import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Field, NumberField } from '@/components/ui/Form';
import { Chip } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { PLAY_STYLES } from '@/constants/goals';
import { GoalPicker } from '@/features/profile/GoalPicker';
import type { GoalWeight } from '@/engine/types';
import { useData } from '@/store/data';

export default function EditProfile() {
  const trainer = useData((s) => s.trainer);
  const saveTrainer = useData((s) => s.saveTrainer);
  const [nickname, setNickname] = useState(trainer?.nickname ?? '');
  const [level, setLevel] = useState<number | null>(trainer?.trainerLevel ?? null);
  const [style, setStyle] = useState<string | null>(trainer?.playStyle ?? null);
  const [goals, setGoals] = useState<GoalWeight[]>(trainer?.goals ?? []);
  const valid = nickname.trim().length >= 2 && level !== null && level >= 1 && level <= 80;

  return (
    <Screen
      title="Edit trainer"
      showBack
      footer={
        <Button
          label="Save"
          disabled={!valid}
          onPress={async () => {
            await saveTrainer({ nickname: nickname.trim(), trainerLevel: level ?? 1, playStyle: style, goals });
            toast.success('Profile updated — recommendations will refresh');
            router.back();
          }}
        />
      }
    >
      <Field label="NICKNAME" value={nickname} onChangeText={setNickname} maxLength={24} autoCapitalize="words" />
      <NumberField label="TRAINER LEVEL" value={level} onChange={setLevel} min={1} max={80} hint="Caps power-ups at level + 2 (max 50)." />
      <View style={{ gap: 8 }}>
        <Text variant="label" color="muted">PLAY STYLE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PLAY_STYLES.map((p) => (
            <Chip key={p} label={p} selected={style === p} onPress={() => setStyle(style === p ? null : p)} />
          ))}
        </View>
      </View>
      <SectionHeader title="GOALS" caption="Recommendations are ranked by these" />
      <GoalPicker value={goals} onChange={setGoals} />
    </Screen>
  );
}
