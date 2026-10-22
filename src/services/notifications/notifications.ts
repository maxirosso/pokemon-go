import { Platform } from 'react-native';
import type { NotificationPrefs } from '@/store/settings';
import type { PlanAction } from '@/services/database/repositories';

/**
 * Local notifications only (no push, no server). Categories can be disabled individually and nothing is
 * ever scheduled about live game events — the app cannot verify them offline.
 *
 * Anti-spam rules:
 *  - at most ONE collection reminder, 14 days after the last collection change (re-armed on every change)
 *  - plan reminders only for dates the user chose
 *  - a weekly goal check-in only when the user enabled it
 *  - a Stardust milestone notification fires once, when the user's own entered balance crosses their own target
 */

const PREFIX = 'gc.';
const CHANNEL_ID = 'gocompass-reminders';

type NotificationsModule = typeof import('expo-notifications');

async function load(): Promise<NotificationsModule | null> {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

let handlerSet = false;

async function setup(N: NotificationsModule) {
  if (!handlerSet) {
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    handlerSet = true;
  }
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminders',
      importance: N.AndroidImportance.DEFAULT,
      lightColor: '#A7F36B',
    });
  }
}

/** Ask for permission (call from a user gesture, e.g. enabling a toggle). Returns true when granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  const N = await load();
  if (!N) return false;
  try {
    await setup(N);
    const cur = await N.getPermissionsAsync();
    if (cur.granted) return true;
    const req = await N.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

async function cancelOurs(N: NotificationsModule) {
  const all = await N.getAllScheduledNotificationsAsync();
  await Promise.all(all.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => N.cancelScheduledNotificationAsync(n.identifier)));
}

export interface SyncInput {
  prefs: NotificationPrefs;
  plan: PlanAction[];
  pokemonCount: number;
}

export async function syncReminders({ prefs, plan, pokemonCount }: SyncInput): Promise<{ scheduled: number }> {
  const N = await load();
  if (!N) return { scheduled: 0 };
  try {
    await setup(N);
    await cancelOurs(N);
    const anyEnabled = prefs.collectionReminder || prefs.planReminders || prefs.goalCheckIns;
    if (!anyEnabled) return { scheduled: 0 };
    const perm = await N.getPermissionsAsync();
    if (!perm.granted) return { scheduled: 0 };
    let n = 0;
    const channelId = Platform.OS === 'android' ? CHANNEL_ID : undefined;

    if (prefs.collectionReminder && pokemonCount > 0) {
      await N.scheduleNotificationAsync({
        identifier: `${PREFIX}collection`,
        content: { title: 'Keep your collection fresh', body: 'It has been a while — add new Pokémon or update your Stardust so recommendations stay accurate.' },
        trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 14 * 24 * 3600, channelId },
      });
      n += 1;
    }
    if (prefs.planReminders) {
      for (const a of plan) {
        if (a.status !== 'planned' || !a.reminderAt) continue;
        const when = new Date(a.reminderAt);
        if (when.getTime() <= Date.now() + 60_000) continue;
        await N.scheduleNotificationAsync({
          identifier: `${PREFIX}plan.${a.id}`,
          content: { title: 'Planned upgrade', body: a.title },
          trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: when, channelId },
        });
        n += 1;
      }
    }
    if (prefs.goalCheckIns) {
      await N.scheduleNotificationAsync({
        identifier: `${PREFIX}goals`,
        content: { title: 'Weekly check-in', body: 'Review your roadmap — see which goals moved this week.' },
        trigger: { type: N.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 10, minute: 0, channelId },
      });
      n += 1;
    }
    return { scheduled: n };
  } catch {
    return { scheduled: 0 };
  }
}

/** Fire an immediate local notification (used for the user's own Stardust milestone). */
export async function notifyNow(title: string, body: string): Promise<void> {
  const N = await load();
  if (!N) return;
  try {
    await setup(N);
    const perm = await N.getPermissionsAsync();
    if (!perm.granted) return;
    await N.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch {
    // ignore
  }
}
