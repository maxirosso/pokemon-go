import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'dark' | 'light' | 'system';
export type Language = 'en' | 'es';
export type BattleMode = 'raid' | 'great' | 'ultra' | 'master';

export interface NotificationPrefs {
  /** Reminder to update the collection after a few quiet weeks. */
  collectionReminder: boolean;
  /** Reminders attached to investment plan actions. */
  planReminders: boolean;
  /** Stardust/Candy milestones the user entered themselves. */
  resourceMilestones: boolean;
  /** Saved-goal check-ins. */
  goalCheckIns: boolean;
}

export interface SettingsState {
  theme: ThemePreference;
  language: Language;
  hapticsEnabled: boolean;
  reducedMotion: 'system' | 'on' | 'off';
  notifications: NotificationPrefs;
  preferredModes: BattleMode[];
  aiEnabled: boolean;
  /** Opt-in: allow sending a screenshot to the Gemini backend for analysis (explicit consent). */
  aiScreenshotConsent: boolean;
  cloudSyncEnabled: boolean;
  /** Stardust milestone entered by the user (for the resource milestone notification). */
  stardustMilestone: number | null;
  hasSeenAiNotice: boolean;
  /** Assume the user can power past level 40 (they own Candy XL). Affects PvP ranking level cap. */
  hasXlCandy: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'setNotification'>>) => void;
  setNotification: (key: keyof NotificationPrefs, value: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      language: 'en',
      hapticsEnabled: true,
      reducedMotion: 'system',
      notifications: { collectionReminder: false, planReminders: false, resourceMilestones: false, goalCheckIns: false },
      preferredModes: ['raid', 'great'],
      aiEnabled: true,
      aiScreenshotConsent: false,
      cloudSyncEnabled: false,
      stardustMilestone: null,
      hasSeenAiNotice: false,
      hasXlCandy: true,
      set: (patch) => set(patch),
      setNotification: (key, value) => set((s) => ({ notifications: { ...s.notifications, [key]: value } })),
    }),
    { name: 'gocompass.settings.v1', storage: createJSONStorage(() => AsyncStorage), version: 1 },
  ),
);
