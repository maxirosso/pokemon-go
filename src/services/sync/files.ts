import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { serializeBackup } from '@/engine/io/backup';
import { toCsv } from '@/engine/io/csv';
import { CSV_EXPORT_HEADER, pokemonToCsvRows } from '@/engine/io/importers';
import { getDb } from '@/services/database/db';
import { buildBackupData, pokemonRepo } from '@/services/database/repositories';

/** All export/import goes through the OS share sheet / file picker — nothing is uploaded anywhere. */

async function writeAndShare(fileName: string, content: string, mime: string, title: string): Promise<{ shared: boolean; uri: string }> {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: title, UTI: mime === 'application/json' ? 'public.json' : 'public.comma-separated-values-text' });
    return { shared: true, uri: file.uri };
  }
  return { shared: false, uri: file.uri };
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportBackup(): Promise<{ shared: boolean; uri: string; count: number }> {
  const db = await getDb();
  const data = await buildBackupData(db);
  const text = serializeBackup(data);
  const r = await writeAndShare(`go-compass-backup-${stamp()}.json`, text, 'application/json', 'Save GO Compass backup');
  return { ...r, count: data.pokemon.length };
}

export async function exportCsv(): Promise<{ shared: boolean; uri: string; count: number }> {
  const db = await getDb();
  const list = await pokemonRepo.listActive(db);
  const text = toCsv(CSV_EXPORT_HEADER, pokemonToCsvRows(list));
  const r = await writeAndShare(`go-compass-collection-${stamp()}.csv`, text, 'text/csv', 'Export collection CSV');
  return { ...r, count: list.length };
}

export interface PickedText {
  name: string;
  text: string;
}

export async function pickTextFile(types: string[] = ['application/json', 'text/csv', 'text/comma-separated-values', 'text/plain', '*/*']): Promise<PickedText | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const file = new File(asset.uri);
  const MAX = 25 * 1024 * 1024;
  if (typeof asset.size === 'number' && asset.size > MAX) throw new Error('That file is larger than 25 MB — it does not look like a collection export.');
  const text = await file.text();
  return { name: asset.name, text };
}
