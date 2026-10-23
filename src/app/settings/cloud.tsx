import { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Field, SwitchRow } from '@/components/ui/Form';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { currentUserEmail, deleteCloudBackup, downloadBackup, sendEmailCode, uploadBackup, verifyEmailCode } from '@/services/ai/cloudBackup';
import { AI_CONFIG, isSupabaseConfigured } from '@/services/ai/config';
import { testGeminiKey } from '@/services/ai/geminiDirect';
import { AiUnavailableError } from '@/services/ai/protocol';
import { signOutCloud } from '@/services/ai/supabase';
import { getDb } from '@/services/database/db';
import { restoreBackup } from '@/services/database/repositories';
import { useAiKey } from '@/store/aiKey';
import { useData } from '@/store/data';
import { useSettings } from '@/store/settings';

/** `Alert.alert` is a no-op on web, so destructive confirmations fall back to the browser's confirm dialog there. */
function confirmDestructive(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}

${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export default function CloudSettings() {
  const settings = useSettings();
  const reload = useData((s) => s.reload);
  const configured = isSupabaseConfigured();
  const hasKey = useAiKey((s) => s.hasKey);
  const [keyDraft, setKeyDraft] = useState('');
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
        Everything important works with no account and no internet. These features are optional extras: an AI coach (Google Gemini, using your own API key that stays on this device) and, optionally, a cross-device backup through your own Supabase project. Neither involves your Pokémon GO account.
      </Note>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pill label={hasKey ? 'GEMINI KEY SAVED ON THIS DEVICE' : 'NO GEMINI KEY'} tone={hasKey ? 'success' : 'warning'} />
        </View>
        <Text variant="small" color="secondary">
          Paste your own Gemini API key (from Google AI Studio). It is stored only in this device’s secure storage — never in the app code, your backups or git — and is sent only to Google when you ask the coach something. Model: {AI_CONFIG.geminiModel} (falls back to {AI_CONFIG.geminiFallbackModel}). Without a key the assistant still answers common questions offline.
        </Text>
        <Field
          label="GEMINI API KEY"
          value={keyDraft}
          onChangeText={setKeyDraft}
          placeholder={hasKey ? '•••••••• saved — paste a new key to replace it' : 'Paste your key'}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          testID="gemini-key-input"
        />
        <Button
          label="Save & test key"
          loading={busy === 'key'}
          disabled={keyDraft.trim().length < 20}
          testID="gemini-key-save"
          onPress={() =>
            run('key', async () => {
              await useAiKey.getState().save(keyDraft);
              try {
                const model = await testGeminiKey(useAiKey.getState().key ?? '');
                setKeyDraft('');
                toast.success(`Key works (${model}). Saved on this device.`);
              } catch (e) {
                // Rejected keys must not stay saved; quota/offline errors mean the key itself may be fine.
                if (e instanceof AiUnavailableError && e.reason === 'not-configured') {
                  await useAiKey.getState().clear();
                  throw e;
                }
                setKeyDraft('');
                toast.info(`Key saved, but the test could not finish: ${e instanceof Error ? e.message : 'unknown error'}`);
              }
            })
          }
        />
        {hasKey ? (
          <Button
            label="Remove key from this device"
            variant="destructive"
            size="sm"
            testID="gemini-key-remove"
            onPress={() =>
              confirmDestructive('Remove the Gemini key?', 'The AI coach stops working until you add a key again.', 'Remove', () => void useAiKey.getState().clear())
            }
          />
        ) : null}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pill label={configured ? 'SUPABASE (OPTIONAL): CONNECTED' : 'SUPABASE (OPTIONAL): NOT SET UP'} tone="neutral" />
        </View>
        <Text variant="small" color="secondary">
          {configured
            ? 'A Supabase project is configured: it is used for cloud backup, and for the coach only when no key is saved on this device.'
            : 'Supabase is only needed for cloud backup or if you would rather keep the Gemini key on a server. See DEVELOPMENT.md.'}
        </Text>
        <SwitchRow label="Enable the AI coach" description="Turn off to never contact the AI backend" value={settings.aiEnabled} onChange={(v) => settings.set({ aiEnabled: v })} />
        <SwitchRow
          label="Allow cloud screenshot analysis"
          description="Explicit consent: a downscaled copy of a screenshot you choose is sent to Google Gemini to read CP/moves/IVs. Not stored. You still review every field."
          value={settings.aiScreenshotConsent}
          onChange={(v) => {
            if (!v) return settings.set({ aiScreenshotConsent: false });
            Alert.alert('Send screenshots to the cloud?', 'When you choose “Analyse with AI” on a screenshot, the image is sent to Google Gemini. Do not use it on screenshots with personal information. You can turn this off any time.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'I agree', onPress: () => settings.set({ aiScreenshotConsent: true }) },
            ]);
          }}
        />
      </Card>

      <SectionHeader title="FREE-TIER LIMITS" />
      <Card style={{ gap: 6 }}>
        <Text variant="small" color="secondary">
          The coach defaults to the Gemini Flash-Lite model, which Google offers on a free tier with low per-minute and per-day request limits that change over time (Google publishes live numbers only in AI Studio). The app only waits a moment between requests; Google enforces the real limit. One question can use 2–4 requests (tool rounds + the final formatted answer). When a limit is hit, the app says so and falls back to on-device answers.
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
