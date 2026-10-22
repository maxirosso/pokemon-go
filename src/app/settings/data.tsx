import { router } from 'expo-router';
import { Download, FileDown, History, RotateCcw, ShieldAlert, Trash2, Upload } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Form';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { parseBackup, type BackupFile } from '@/engine/io/backup';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import type { OwnedPokemon } from '@/engine/types';
import { getDb } from '@/services/database/db';
import { chatRepo, pokemonRepo, referenceCacheRepo, restoreBackup, speciesInfoCacheRepo } from '@/services/database/repositories';
import { exportBackup, exportCsv, pickTextFile } from '@/services/sync/files';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';

export default function DataSettings() {
  const { c } = useTheme();
  const ref = useReference((s) => s.ref);
  const pokemon = useData((s) => s.pokemon);
  const reload = useData((s) => s.reload);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ name: string; backup: BackupFile } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [trash, setTrash] = useState<OwnedPokemon[]>([]);
  const demoCount = pokemon.filter((p) => p.source === 'demo').length;

  const loadTrash = async () => setTrash(await pokemonRepo.listDeleted(await getDb()));
  useEffect(() => {
    let alive = true;
    void getDb()
      .then((db) => pokemonRepo.listDeleted(db))
      .then((list) => alive && setTrash(list));
    return () => {
      alive = false;
    };
  }, [pokemon.length]);

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

  const pickBackup = () =>
    run('restore', async () => {
      const f = await pickTextFile(['application/json', 'text/plain', '*/*']);
      if (!f) return;
      const r = parseBackup(f.text);
      if (!r.ok) {
        Alert.alert(r.error, r.issues.length ? r.issues.join('\n') : 'Nothing was changed.');
        return;
      }
      setPending({ name: f.name, backup: r.backup });
    });

  const doRestore = (mode: 'replace' | 'merge') =>
    run('apply', async () => {
      if (!pending) return;
      const s = await restoreBackup(await getDb(), pending.backup, mode);
      await reload();
      toast.success(`Restored: ${s.pokemonAdded} Pokémon added${s.pokemonSkipped ? `, ${s.pokemonSkipped} already present` : ''}, ${s.teams} teams`);
      setPending(null);
    });

  const removeDemo = () =>
    Alert.alert('Remove demo Pokémon?', `${demoCount} demo Pokémon will be deleted. Your own Pokémon are not touched.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void run('demo', async () => { await pokemonRepo.deleteBySource(await getDb(), 'demo'); await reload(); toast.success('Demo data removed'); }) },
    ]);

  const reset = () =>
    run('reset', async () => {
      await useData.getState().wipe();
      const db = await getDb();
      await referenceCacheRepo.clear(db);
      await speciesInfoCacheRepo.clear(db);
      await chatRepo.clearAll(db);
      await useReference.getState().init();
      setResetOpen(false);
      setConfirmText('');
      toast.success('Local data erased');
      router.replace('/');
    });

  return (
    <Screen title="Backup & data" subtitle="EXPORT · RESTORE · RESET" showBack>
      <Note>All of your data lives on this device. Exports go through your system share sheet — nothing is uploaded by GO Compass.</Note>

      <SectionHeader title="EXPORT" />
      <Card style={{ gap: 10 }}>
        <Button label="Export full backup (JSON)" icon={<Download size={18} color={c.accentOn} />} loading={busy === 'backup'} onPress={() => run('backup', async () => { const r = await exportBackup(); toast.success(r.shared ? `Backup of ${r.count} Pokémon ready` : `Saved to ${r.uri}`); })} />
        <Button label="Export collection (CSV)" variant="secondary" icon={<FileDown size={18} color={c.text} />} loading={busy === 'csv'} onPress={() => run('csv', async () => { const r = await exportCsv(); toast.success(r.shared ? `${r.count} Pokémon exported` : `Saved to ${r.uri}`); })} />
        <Text variant="caption" color="muted">The backup includes Pokémon, resources, teams and your investment plan. The CSV contains Pokémon only.</Text>
      </Card>

      <SectionHeader title="RESTORE" />
      <Card style={{ gap: 10 }}>
        <Button label="Restore from a backup file" variant="secondary" icon={<Upload size={18} color={c.text} />} loading={busy === 'restore'} onPress={() => void pickBackup()} />
        <Button label="Import Pokémon from CSV / JSON" variant="ghost" onPress={() => router.push('/import/file')} />
      </Card>

      <SectionHeader title="MAINTENANCE" />
      {demoCount > 0 ? (
        <Card style={{ gap: 8 }}>
          <Text variant="bodyMedium">{demoCount} demo Pokémon</Text>
          <Button label="Remove demo data" variant="secondary" onPress={removeDemo} />
        </Card>
      ) : null}
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <History size={16} color={c.textSecondary} />
          <Text variant="bodyMedium">Recently deleted ({trash.length})</Text>
        </View>
        {trash.length === 0 ? (
          <Text variant="caption" color="muted">Deleted Pokémon can be restored from here until purged.</Text>
        ) : (
          <>
            {trash.slice(0, 10).map((p) => {
              const s = ref.getSpecies(p.speciesId, p.form);
              return (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text variant="small" style={{ flex: 1 }}>{p.nickname ?? (s ? speciesDisplayName(s) : `#${p.speciesId}`)} {p.cp ? `· CP ${p.cp}` : ''}</Text>
                  <Button label="Restore" size="sm" variant="secondary" fullWidth={false} icon={<RotateCcw size={14} color={c.text} />} onPress={async () => { await useData.getState().restorePokemon(p.id); await loadTrash(); }} />
                </View>
              );
            })}
            <Button label="Permanently delete these" variant="destructive" size="sm" fullWidth={false} onPress={() => Alert.alert('Permanently delete?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete forever', style: 'destructive', onPress: async () => { await pokemonRepo.purgeDeleted(await getDb()); await loadTrash(); } }])} />
          </>
        )}
      </Card>

      <SectionHeader title="DANGER ZONE" />
      <Card variant="danger" style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ShieldAlert size={18} color={c.danger} />
          <Text variant="bodyMedium" color="danger">Reset local data</Text>
        </View>
        <Text variant="small" color="secondary">Erases your profile, Pokémon, resources, teams, plan, AI chats and cached data from this device. Export a backup first.</Text>
        <Button label="Reset everything…" variant="destructive" icon={<Trash2 size={18} color={c.danger} />} onPress={() => setResetOpen(true)} />
      </Card>

      <Sheet visible={!!pending} onClose={() => setPending(null)} title="Restore backup">
        {pending ? (
          <View style={{ gap: 10 }}>
            <Text variant="small" color="secondary">
              {pending.name}: {pending.backup.pokemon.length} Pokémon, {pending.backup.resources.length} resource entries, {pending.backup.teams.length} teams, {pending.backup.plan.length} plan actions (exported {pending.backup.exportedAt.slice(0, 10)}).
            </Text>
            <Button label="Merge — add missing Pokémon only" loading={busy === 'apply'} onPress={() => void doRestore('merge')} />
            <Button label="Replace everything on this device" variant="destructive" onPress={() => Alert.alert('Replace all data?', 'Your current Pokémon, teams and plan will be replaced by the backup.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Replace', style: 'destructive', onPress: () => void doRestore('replace') }])} />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={resetOpen} onClose={() => setResetOpen(false)} title="Erase all local data?" footer={<Button label="Erase everything" variant="destructive" disabled={confirmText !== 'RESET'} loading={busy === 'reset'} onPress={() => void reset()} />}>
        <Text variant="small" color="secondary">This cannot be undone. Type RESET to confirm.</Text>
        <Field value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" placeholder="RESET" />
      </Sheet>
    </Screen>
  );
}
