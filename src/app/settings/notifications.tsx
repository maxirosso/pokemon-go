import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { NumberField, SwitchRow } from '@/components/ui/Form';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { notifyNow, requestNotificationPermission } from '@/services/notifications/notifications';
import { useData } from '@/store/data';
import { useSettings, type NotificationPrefs } from '@/store/settings';

const ROWS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: 'collectionReminder', label: 'Collection reminder', description: 'One nudge after 14 quiet days to update your Pokémon and Stardust.' },
  { key: 'planReminders', label: 'Investment plan reminders', description: 'Only for reminder dates you set on plan tasks.' },
  { key: 'goalCheckIns', label: 'Weekly goal check-in', description: 'Sunday 10:00 — a nudge to review your roadmap.' },
  { key: 'resourceMilestones', label: 'Stardust milestone', description: 'When the Stardust you enter reaches your own target.' },
];

export default function NotificationSettings() {
  const prefs = useSettings((s) => s.notifications);
  const setNotification = useSettings((s) => s.setNotification);
  const milestone = useSettings((s) => s.stardustMilestone);
  const set = useSettings((s) => s.set);
  const stardust = useData((s) => s.resources.find((r) => r.type === 'stardust')?.amount ?? null);
  const [denied, setDenied] = useState(false);

  const toggle = async (key: keyof NotificationPrefs, on: boolean) => {
    if (on) {
      const ok = await requestNotificationPermission();
      if (!ok) {
        setDenied(true);
        toast.error('Notifications are blocked for this app. Enable them in your system settings.');
        return;
      }
    }
    setDenied(false);
    setNotification(key, on);
  };

  return (
    <Screen title="Notifications" subtitle="LOCAL REMINDERS ONLY" showBack>
      <Note>
        GO Compass never sends push notifications and never announces game events: it cannot verify live events offline, so it will not pretend to. Every category below is off by default and can be disabled individually.
      </Note>
      <Card style={{ gap: 6 }}>
        {ROWS.map((r) => (
          <SwitchRow key={r.key} label={r.label} description={r.description} value={prefs[r.key]} onChange={(v) => void toggle(r.key, v)} />
        ))}
      </Card>
      {prefs.resourceMilestones ? (
        <Card style={{ gap: 10 }}>
          <NumberField label="STARDUST MILESTONE" value={milestone} onChange={(v) => set({ stardustMilestone: v })} min={1} placeholder="e.g. 500000" hint={stardust !== null ? `Your entered Stardust: ${stardust.toLocaleString('en-US')}` : 'Enter your Stardust in the bag first.'} />
          <Text variant="caption" color="muted">You’ll get one notification when the Stardust you enter in the bag crosses this number.</Text>
        </Card>
      ) : null}
      {denied ? <Note tone="warning">Permission was denied, so nothing will be scheduled until you allow notifications in system settings.</Note> : null}
      <SectionHeader title="TEST" />
      <Button label="Send a test notification" variant="secondary" onPress={async () => { const ok = await requestNotificationPermission(); if (ok) { await notifyNow('GO Compass', 'Notifications are working.'); toast.success('Sent'); } else toast.error('Permission denied'); }} />
    </Screen>
  );
}
