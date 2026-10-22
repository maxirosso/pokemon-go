import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Field, SwitchRow } from '@/components/ui/Form';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { currentUserEmail, deleteCloudBackup, downloadBackup, sendEmailCode, uploadBackup, verifyEmailCode } from '@/services/ai/cloudBackup';
import { isAiConfigured } from '@/services/ai/config';
import { signOutCloud } from '@/services/ai/supabase';
import { getDb } from '@/services/database/db';
import { restoreBackup } from '@/services/database/repositories';
import { useData } from '@/store/data';
import { useSettings } from '@/store/settings';

export default function CloudSettings() {
  const settings = useSettings();
  const reload = useData((s) => s.reload);
  const configured = isAiConfigured();
  const [email, setEmail] = useState<string | null>(null);
  const [draftEmail, setDraftEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (configured) void currentUserEmail().then(setEmail).catch(() => undefined);
  }, [configured]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="AI coach & cloud" subtitle="OPTIONAL · NEVER REQUIRED" showBack>
      <Note>
        Everything important works with no account and no internet. These features are optional extras: an AI coach (Google Gemini, called only through your own Supabase Edge Function — the API key is never in the app) and a cross-device backup. Neither involves your Pokémon GO account.
      </Note>

      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pill label={configured ? 'BACKEND CONFIGURED' : 'BACKEND NOT CONFIGURED'} tone={configured ? 'success' : 'warning'} />
        </View>
        {!configured ? (
          <Text variant="small" color="secondary">
            Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in a local .env file, deploy the gemini-coach Edge Function and add your GEMINI_API_KEY as a function secret. Step-by-step instructions are in DEVELOPMENT.md. Until then the assistant answers common questions offline.
          </Text>
        ) : (
          <Text variant="small" color="secondary">Connected to your Supabase project. Guests get an anonymous session used only for rate limiting.</Text>
        )}
        <SwitchRow label="Enable the AI coach" description="Turn off to never contact the AI backend" value={settings.aiEnabled} onChange={(v) => settings.set({ aiEnabled: v })} />
        <SwitchRow
          label="Allow cloud screenshot analysis"
          description="Explicit consent: a downscaled copy of a screenshot you choose is sent to your Gemini backend to read CP/moves/IVs. Not stored. You still review every field."
          value={settings.aiScreenshotConsent}
          onChange={(v) => {
            if (!v) return settings.set({ aiScreenshotConsent: false });
            Alert.alert('Send screenshots to the cloud?', 'When you choose “Analyse with AI” on a screenshot, the image is sent to your configured Supabase Edge Function and Google Gemini. Do not use it on screenshots with personal information. You can turn this off any time.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'I agree', onPress: () => settings.set({ aiScreenshotConsent: true }) },
            ]);
          }}
        />
      </Card>

      <SectionHeader title="FREE-TIER LIMITS" />
      <Card style={{ gap: 6 }}>
        <Text variant="small" color="secondary">
          The coach defaults to a Gemini Flash model, which Google offers on a free tier with low per-minute and per-day request limits that change over time (Google publishes live numbers only in AI Studio). The Edge Function also enforces its own limit per user (default 20 requests/hour, 120/day). One question can use 2–4 requests (tool rounds + the final formatted answer). When a limit is hit, the app says so and falls back to on-device answers.
        </Text>
      </Card>

      <SectionHeader title="CLOUD BACKUP (OPTIONAL)" />
      {!configured ? (
        <Note>Cloud backup needs the Supabase backend. Use Backup &amp; data to export a file instead.</Note>
      ) : (
        <Card style={{ gap: 10 }}>
          <SwitchRow label="Cloud sync enabled" value={settings.cloudSyncEnabled} onChange={(v) => settings.set({ cloudSyncEnabled: v })} />
          {email ? (
            <>
              <Text variant="small" color="secondary">Signed in as {email}</Text>
              <Button label="Back up now" loading={busy === 'up'} disabled={!settings.cloudSyncEnabled} onPress={() => run('up', async () => { const r = await uploadBackup(); toast.success(`Uploaded ${r.count} Pokémon`); })} />
              <Button
                label="Restore from cloud (merge)"
                variant="secondary"
                loading={busy === 'down'}
                disabled={!settings.cloudSyncEnabled}
                onPress={() => run('down', async () => { const b = await downloadBackup(); if (!b) { toast.info('No cloud backup found'); return; } const s = await restoreBackup(await getDb(), b, 'merge'); await reload(); toast.success(`Restored ${s.pokemonAdded} Pokémon`); })}
              />
              <Button label="Delete my cloud backup" variant="destructive" size="sm" onPress={() => Alert.alert('Delete cloud backup?', 'Your local data is not affected.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void run('del', async () => { await deleteCloudBackup(); toast.success('Cloud backup deleted'); }) }])} />
              <Button label="Sign out" variant="ghost" size="sm" onPress={() => run('out', async () => { await signOutCloud(); setEmail(null); })} />
            </>
          ) : (
            <>
              <Text variant="small" color="secondary">Sign in with an email one-time code to enable cross-device restore. No password.</Text>
              <Field label="EMAIL" value={draftEmail} onChangeText={setDraftEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              {codeSent ? <Field label="6-DIGIT CODE" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={8} /> : null}
              {!codeSent ? (
                <Button label="Send code" loading={busy === 'code'} disabled={!draftEmail.includes('@')} onPress={() => run('code', async () => { await sendEmailCode(draftEmail.trim()); setCodeSent(true); toast.success('Check your inbox'); })} />
              ) : (
                <Button label="Verify & sign in" loading={busy === 'verify'} disabled={code.length < 6} onPress={() => run('verify', async () => { await verifyEmailCode(draftEmail.trim(), code.trim()); setEmail(await currentUserEmail()); setCodeSent(false); setCode(''); toast.success('Signed in'); })} />
              )}
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}
