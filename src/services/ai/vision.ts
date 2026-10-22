import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { extractedSchema, type ExtractedPokemon } from '@/engine/io/extraction';
import { useSettings } from '@/store/settings';
import { callCoach } from './gateway';
import { AiUnavailableError } from './protocol';

/**
 * Optional, explicitly opt-in screenshot analysis with Gemini's multimodal model.
 * Privacy: the image is downscaled, sent once to YOUR Supabase Edge Function (which forwards it to Gemini)
 * and never stored by GO Compass. The user must have given consent in Settings → AI coach & cloud.
 * The result is only a *proposal*: it goes through the same editable review screen as on-device OCR.
 */
export async function analyzeScreenshotCloud(uri: string): Promise<ExtractedPokemon> {
  const settings = useSettings.getState();
  if (!settings.aiEnabled) throw new AiUnavailableError('AI features are turned off in Settings.', 'disabled');
  if (!settings.aiScreenshotConsent) {
    throw new AiUnavailableError('Cloud screenshot analysis needs your consent first (Settings → AI coach & cloud).', 'consent');
  }
  const ctx = ImageManipulator.manipulate(uri).resize({ width: 1280 });
  const rendered = await ctx.renderAsync();
  const img = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!img.base64) throw new Error('Could not prepare the image.');

  const res = await callCoach({
    mode: 'vision',
    locale: settings.language,
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: img.base64 } }, { text: 'Extract the Pokémon data from this screenshot.' }] }],
  });
  const text = res.content?.parts.map((p) => ('text' in p ? p.text : '')).join('') ?? '';
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AiUnavailableError('The AI returned something that is not valid data.', 'invalid-response');
  }
  const parsed = extractedSchema.safeParse(raw);
  if (!parsed.success) throw new AiUnavailableError('The AI response did not match the expected format.', 'invalid-response');
  const ex = parsed.data;
  // The model self-reports confidence; cap it so AI-extracted values always get a human glance.
  for (const k of Object.keys(ex.confidence)) ex.confidence[k] = Math.min(ex.confidence[k], 0.79);
  ex.notes.push('Read by AI from the screenshot — please verify every value before saving.');
  return ex;
}
