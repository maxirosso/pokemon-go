import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { AlertTriangle, CheckCircle2, ImagePlus, Sparkles, Trash2 } from 'lucide-react-native';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { ProgressBar } from '@/components/ui/Form';
import { Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { isAiConfigured } from '@/services/ai/config';
import { useAiKey } from '@/store/aiKey';
import { AiUnavailableError } from '@/services/ai/protocol';
import { analyzeScreenshotCloud } from '@/services/ai/vision';
import { isOcrAvailable } from '@/services/ocr/ocr';
import { useImportQueue } from '@/store/importQueue';
import { useReference } from '@/store/reference';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme/useTheme';

export default function ImportScreenshots() {
  const { c } = useTheme();
  const items = useImportQueue((s) => s.items);
  const running = useImportQueue((s) => s.running);
  const ref = useReference((s) => s.ref);
  const consent = useSettings((s) => s.aiScreenshotConsent);
  const aiEnabled = useSettings((s) => s.aiEnabled);
  useAiKey((s) => s.hasKey);
  const cloudReady = isAiConfigured() && aiEnabled && consent;
  const ocr = isOcrAvailable();
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'error').length;
  const processed = done + failed;

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.accessPrivileges !== 'limited') {
      toast.error('Photo access is needed to pick screenshots.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 30, quality: 1 });
    if (res.canceled) return;
    useImportQueue.getState().add(res.assets.map((a) => ({ uri: a.uri, name: a.fileName ?? a.uri.split('/').pop() ?? 'screenshot' })));
  };

  const run = async (backend: 'ocr' | 'gemini') => {
    await useImportQueue.getState().process(ref, {
      backend,
      cloud: backend === 'gemini' ? analyzeScreenshotCloud : undefined,
    });
    const st = useImportQueue.getState().items;
    const errs = st.filter((i) => i.status === 'error');
    if (errs.length && st.every((i) => i.status === 'error')) toast.error(errs[0].error ?? 'Could not process the screenshots.');
    else toast.success(`Processed ${st.filter((i) => i.status === 'done').length} screenshot(s) — review before saving`);
  };

  const cloud = async () => {
    if (!cloudReady) {
      toast.info(consent ? 'The AI backend is not configured.' : 'Enable cloud screenshot analysis in Settings → AI coach & cloud first.');
      return;
    }
    try {
      await run('gemini');
    } catch (e) {
      toast.error(e instanceof AiUnavailableError ? e.message : 'Cloud analysis failed.');
    }
  };

  return (
    <Screen
      title="Import screenshots"
      subtitle="OCR · REVIEW · SAVE"
      showBack
      footer={
        done > 0 ? (
          <Button label={`Review ${done} result${done > 1 ? 's' : ''}`} icon={<CheckCircle2 size={18} color={c.accentOn} />} onPress={() => router.push('/import/review')} testID="go-review" />
        ) : undefined
      }
    >
      <Card style={{ gap: 10 }}>
        <Text variant="small" color="secondary">
          Take screenshots of a Pokémon’s details screen (CP, HP, name, moves) and, for IVs, its appraisal. Text is read on your device. The IV bars are graphics, so IVs usually need to be entered during review — nothing is guessed.
        </Text>
        <Button label="Choose screenshots" icon={<ImagePlus size={18} color={c.accentOn} />} onPress={() => void pick()} />
        {!ocr ? (
          <Note tone="warning">
            On-device text recognition (Google ML Kit) is a native module: it works in a development build (`npx expo run:android` / `run:ios`) but not in Expo Go. You can still use the optional cloud analysis, or enter Pokémon manually.
          </Note>
        ) : null}
      </Card>

      {items.length > 0 ? (
        <>
          <SectionHeader title={`QUEUE · ${items.length}`} right={<Button label="Clear" size="sm" variant="ghost" fullWidth={false} icon={<Trash2 size={14} color={c.textSecondary} />} onPress={() => useImportQueue.getState().clear()} />} />
          {running ? <ProgressBar value={items.length ? processed / items.length : 0} label="Processing screenshots" /> : null}
          <View style={{ gap: 8 }}>
            {items.map((i) => (
              <Card key={i.id} padded={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
                  <Image source={{ uri: i.uri }} style={{ width: 52, height: 72, borderRadius: 10, backgroundColor: c.canvas }} contentFit="cover" />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="small" numberOfLines={1}>{i.name}</Text>
                    {i.status === 'done' && i.review ? (
                      <Text variant="caption" color="muted">
                        {i.review.draft.speciesId ? ref.getSpecies(i.review.draft.speciesId)?.name : 'species not read'} · {i.review.draft.cp ? `CP ${i.review.draft.cp}` : 'CP not read'}
                      </Text>
                    ) : i.error ? (
                      <Text variant="caption" color="danger" numberOfLines={3}>{i.error}</Text>
                    ) : null}
                  </View>
                  <Pill label={i.status.toUpperCase()} tone={i.status === 'done' ? 'success' : i.status === 'error' ? 'danger' : i.status === 'processing' ? 'blue' : 'neutral'} icon={i.status === 'error' ? <AlertTriangle size={10} color={c.danger} /> : undefined} />
                </View>
              </Card>
            ))}
          </View>
          <View style={{ gap: 8 }}>
            <Button label={running ? 'Processing…' : failed ? 'Retry failed & process queue' : 'Read with on-device OCR'} loading={running} disabled={!ocr || running} onPress={() => void run('ocr')} />
            <Button label="Analyse with AI (cloud, opt-in)" variant="secondary" icon={<Sparkles size={18} color={c.text} />} disabled={running} onPress={() => void cloud()} />
            <Text variant="caption" color="muted">Cloud analysis sends a downscaled copy of each image to your Gemini backend only after you consented in Settings. OCR and AI can both be wrong — you review every field next.</Text>
          </View>
        </>
      ) : null}
    </Screen>
  );
}
