import { router } from 'expo-router';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Field, NumberField } from '@/components/ui/Form';
import { Chip } from '@/components/ui/Pill';
import { Text } from '@/components/ui/Text';
import { PLAY_STYLES } from '@/constants/goals';
import { OnboardingFrame } from '@/features/profile/OnboardingFrame';
import { useOnboarding } from '@/store/onboarding';

export default function TrainerStep() {
  const draft = useOnboarding();
  const valid = draft.nickname.trim().length >= 2 && draft.trainerLevel !== null && draft.trainerLevel >= 1 && draft.trainerLevel <= 80;
  return (
    <OnboardingFrame
      step={2}
      title="Set up your trainer"
      subtitle="Your trainer level caps how high Pokémon can be powered up (level + 2), so it shapes every cost estimate."
      footer={<Button label="Continue" disabled={!valid} onPress={() => router.push('/onboarding/goals')} testID="trainer-continue" />}
    >
      <Field label="TRAINER NICKNAME" value={draft.nickname} onChangeText={(t) => draft.set({ nickname: t })} placeholder="e.g. Max" autoCapitalize="words" maxLength={24} returnKeyType="next" />
      <NumberField label="TRAINER LEVEL" value={draft.trainerLevel} onChange={(v) => draft.set({ trainerLevel: v })} min={1} max={80} placeholder="1 – 80" hint="Pokémon can be powered up to your level + 2 (max 50)." />
      <View style={{ gap: 8 }}>
        <Text variant="label" color="muted">
          MAIN PLAY STYLE (OPTIONAL)
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PLAY_STYLES.map((p) => (
            <Chip key={p} label={p} selected={draft.playStyle === p} onPress={() => draft.set({ playStyle: draft.playStyle === p ? null : p })} />
          ))}
        </View>
      </View>
    </OnboardingFrame>
  );
}
