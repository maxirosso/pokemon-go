import { router } from 'expo-router';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { GoalPicker } from '@/features/profile/GoalPicker';
import { OnboardingFrame } from '@/features/profile/OnboardingFrame';
import { useData } from '@/store/data';
import { useOnboarding } from '@/store/onboarding';
import { useSettings } from '@/store/settings';

export default function GoalsStep() {
  const draft = useOnboarding();
  const saveTrainer = useData((s) => s.saveTrainer);
  const language = useSettings((s) => s.language);
  const [saving, setSaving] = useState(false);

  const next = async () => {
    setSaving(true);
    try {
      await saveTrainer({
        nickname: draft.nickname.trim(),
        trainerLevel: draft.trainerLevel ?? 1,
        playStyle: draft.playStyle,
        goals: draft.goals,
        language,
      });
      router.push('/onboarding/collection');
    } catch {
      toast.error('Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingFrame
      step={3}
      title="What are you aiming for?"
      subtitle="Pick as many as you like and weight them. Recommendations are ranked by your goals — you can change this any time."
      footer={<Button label={draft.goals.length ? 'Continue' : 'Skip — balanced advice'} loading={saving} onPress={next} testID="goals-continue" />}
    >
      <GoalPicker value={draft.goals} onChange={(goals) => draft.set({ goals })} />
    </OnboardingFrame>
  );
}
