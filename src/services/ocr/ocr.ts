import { Platform } from 'react-native';

/**
 * On-device OCR via Google ML Kit text recognition (`@react-native-ml-kit/text-recognition`).
 *
 * ML Kit is a native module: it works in a development build / production build, NOT in Expo Go.
 * The import is dynamic and wrapped so Expo Go and web keep working — callers get `OcrUnavailableError`
 * and the UI falls back to manual entry or the optional (opt-in) cloud analysis.
 */

export class OcrUnavailableError extends Error {
  constructor(message = 'On-device text recognition needs a development build (it is not available in Expo Go).') {
    super(message);
    this.name = 'OcrUnavailableError';
  }
}

type MlKit = {
  recognize: (uri: string) => Promise<{ text: string; blocks: { text: string; lines: { text: string }[] }[] }>;
};

let cached: MlKit | null | undefined;

function loadMlKit(): MlKit | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web') {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-ml-kit/text-recognition') as { default?: MlKit } & MlKit;
    const impl = mod.default ?? mod;
    cached = typeof impl?.recognize === 'function' ? impl : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function isOcrAvailable(): boolean {
  return loadMlKit() !== null;
}

/** Returns recognised text lines in reading order. Throws OcrUnavailableError when ML Kit is not linked. */
export async function recognizeLines(imageUri: string): Promise<string[]> {
  const kit = loadMlKit();
  if (!kit) throw new OcrUnavailableError();
  const result = await kit.recognize(imageUri);
  const lines = result.blocks.flatMap((b) => b.lines.map((l) => l.text));
  return lines.length ? lines : result.text.split(/\r?\n/);
}
