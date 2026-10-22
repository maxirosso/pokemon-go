import { create } from 'zustand';
import type { GoalWeight } from '@/engine/types';

interface OnboardingDraft {
  nickname: string;
  trainerLevel: number | null;
  playStyle: string | null;
  goals: GoalWeight[];
  set: (p: Partial<Omit<OnboardingDraft, 'set'>>) => void;
}

export const useOnboarding = create<OnboardingDraft>((set) => ({
  nickname: '',
  trainerLevel: null,
  playStyle: null,
  goals: [],
  set: (p) => set(p),
}));
