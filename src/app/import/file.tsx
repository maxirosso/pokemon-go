import { router } from 'expo-router';
import { FileUp } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { SwitchRow } from '@/components/ui/Form';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { parseBackup } from '@/engine/io/backup';
import { importCsv, importJsonPokemon, splitDuplicates, type ImportResult, type NewPokemon } from '@/engine/io/importers';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import { pickTextFile } from '@/services/sync/files';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';

interface Preview {
  name: string;
  kind: 'csv' | 'json';
  result: ImportResult;
  fresh: NewPokemon[];
  duplicates: NewPokemon[];
}

export default function ImportFile() {
  const { c } = useTheme();
  const ref = useReference((s) => s.ref);
  const pokemon = useData((s) => s.pokemon);
  const addMany = useData((s) => s.addMany);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [allowDupes, setAllowDupes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isBackup, setIsBackup] = useState(false);

  const pick = async () => {
    setBusy(true);
    try {
      const f = await pickTextFile();
      if (!f) return;
      const text = f.text.trim();
      const looksJson = text.startsWith('{') || text.startsWith('[');
      if (looksJson && parseBackup(text).ok) {
        setIsBackup(true);
        setPreview(null);
        return;
      }
      setIsBackup(false);
      const result = looksJson ? importJsonPokemon(ref, text) : importCsv(ref, text);
      const { fresh, duplicates } = splitDuplicates(pokemon, result.accepted);
      setPreview({ name: f.name, kind: looksJson ? 'json' : 'csv', result, fresh, duplicates });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!preview) return;
    const list = allowDupes ? [...preview.fresh, ...preview.duplicates] : preview.fresh;
    if (list.length === 0) {
      toast.info('Nothing new to import.');
      return;
    }
    setBusy(true);
    try {
      await addMany(list, preview.kind === 'csv' ? 'csv' : 'json', preview.name, preview.result.rejected.length);
      toast.success(`Imported ${list.length} Pokémon`);
      router.replace('/(tabs)/collection');
    } catch {
      toast.error('Import failed. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  };

  const count = preview ? (allowDupes ? preview.fresh.length + preview.duplicates.length : preview.fresh.length) : 0;

  return (
    <Screen
      title="Import CSV / JSON"
      subtitle="VALIDATED BEFORE SAVING"
      showBack
      footer={preview ? <Button label={`Import ${count} Pokémon`} loading={busy} disabled={count === 0} onPress={() => void doImport()} testID="import-confirm" /> : undefined}
    >
      <Card style={{ gap: 10 }}>
        <Text variant="small" color="secondary">
          Accepted: CSV (Poke Genie and similar — headers like Name, CP, HP, Atk IV, Def IV, Sta IV, Level, Quick Move, Charge Move) and JSON arrays of Pokémon. Every row is validated: unknown species, impossible IVs/CP and malformed rows are rejected with a reason.
        </Text>
        <Button label={busy && !preview ? 'Reading…' : 'Choose a file'} icon={<FileUp size={18} color={c.accentOn} />} loading={busy && !preview} onPress={() => void pick()} />
      </Card>

      {isBackup ? (
        <Note>That file is a full GO Compass backup. Use Settings → Backup &amp; data → “Restore from a backup file” to merge or replace safely.</Note>
      ) : null}

      {preview ? (
        <>
          <SectionHeader title="PREVIEW" caption={preview.name} />
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Pill label={`${preview.fresh.length} NEW`} tone="success" />
              <Pill label={`${preview.duplicates.length} DUPLICATES`} tone={preview.duplicates.length ? 'warning' : 'neutral'} />
              <Pill label={`${preview.result.rejected.length} REJECTED`} tone={preview.result.rejected.length ? 'danger' : 'neutral'} />
            </View>
            {preview.duplicates.length > 0 ? (
              <SwitchRow label="Import duplicates anyway" description="Same species, CP, IVs, level and date as something you already own" value={allowDupes} onChange={setAllowDupes} />
            ) : null}
          </Card>

          {preview.fresh.slice(0, 8).map((p, i) => {
            const s = ref.getSpecies(p.speciesId, p.form);
            return (
              <Card key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="bodyMedium">{s ? speciesDisplayName(s) : `#${p.speciesId}`}</Text>
                <Text variant="numSm" color="secondary">{p.cp ? `CP ${p.cp}` : 'CP —'} · {p.ivs ? `${p.ivs.atk}/${p.ivs.def}/${p.ivs.sta}` : 'IV ?'}</Text>
              </Card>
            );
          })}
          {preview.fresh.length > 8 ? <Text variant="caption" color="muted">…and {preview.fresh.length - 8} more</Text> : null}

          {preview.result.rejected.length > 0 ? (
            <>
              <SectionHeader title="REJECTED ROWS" />
              <Card variant="danger" style={{ gap: 6 }}>
                {preview.result.rejected.slice(0, 10).map((r, i) => (
                  <Text key={i} variant="small" color="secondary">Line {r.line}: {r.reason}</Text>
                ))}
                {preview.result.rejected.length > 10 ? <Text variant="caption" color="muted">…and {preview.result.rejected.length - 10} more</Text> : null}
              </Card>
            </>
          ) : null}
          {preview.result.warnings.length > 0 ? (
            <Note>{preview.result.warnings.slice(0, 5).join(' ')}{preview.result.warnings.length > 5 ? ` (+${preview.result.warnings.length - 5} more)` : ''}</Note>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
