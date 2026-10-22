import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Check, Pencil } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SpeciesList } from '@/components/pokemon/SpeciesList';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState, Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { splitDuplicates, type NewPokemon } from '@/engine/io/importers';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import { buildDraft, formFromPokemon, type FormErrors, type FormState } from '@/features/collection/formModel';
import { PokemonForm } from '@/features/collection/PokemonForm';
import { useData } from '@/store/data';
import { useImportQueue, type ImportItem } from '@/store/importQueue';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';
import type { OwnedPokemon } from '@/engine/types';

const asOwned = (d: NewPokemon): OwnedPokemon => ({ ...d, id: 'draft', source: 'screenshot', importBatchId: null, createdAt: '', updatedAt: '', deletedAt: null });
const tone = { confident: 'success', uncertain: 'warning', missing: 'neutral' } as const;

export default function ImportReview() {
  const { c } = useTheme();
  const ref = useReference((s) => s.ref);
  const items = useImportQueue((s) => s.items).filter((i) => i.status === 'done' && i.review);
  const update = useImportQueue((s) => s.update);
  const existing = useData((s) => s.pokemon);
  const addMany = useData((s) => s.addMany);
  const [forms, setForms] = useState<Record<string, FormState>>({});
  const [speciesOverride, setSpeciesOverride] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [pickingSpecies, setPickingSpecies] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const speciesIdFor = (i: ImportItem) => speciesOverride[i.id] ?? i.review?.draft.speciesId ?? 0;
  const formFor = (i: ImportItem): FormState => forms[i.id] ?? formFromPokemon(asOwned(i.review!.draft));

  const built = useMemo(
    () =>
      items.map((i) => {
        const sid = speciesIdFor(i);
        const { draft } = buildDraft(sid, forms[i.id] ?? formFromPokemon(asOwned(i.review!.draft)));
        return { item: i, sid, draft };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, forms, speciesOverride],
  );

  const toSave = built.filter((b) => !b.item.skipped && b.sid > 0 && b.draft);
  const dedupe = useMemo(() => {
    const drafts = toSave.map((b) => b.draft as NewPokemon);
    return splitDuplicates(existing, drafts);
  }, [toSave, existing]);

  const save = async () => {
    setSaving(true);
    try {
      const fresh = dedupe.fresh;
      if (fresh.length === 0) {
        toast.info('Everything here is already in your collection.');
        return;
      }
      const source = items.some((i) => i.backend === 'gemini') ? 'ai-screenshot' : 'screenshot';
      await addMany(fresh, source, 'screenshots', dedupe.duplicates.length);
      toast.success(`Added ${fresh.length} Pokémon${dedupe.duplicates.length ? `, skipped ${dedupe.duplicates.length} duplicate(s)` : ''}`);
      useImportQueue.getState().clear();
      router.replace('/(tabs)/collection');
    } catch {
      toast.error('Could not save. Nothing was changed.');
    } finally {
      setSaving(false);
    }
  };

  const edit = items.find((i) => i.id === editing);
  const editSpecies = edit ? ref.getSpecies(speciesIdFor(edit), forms[edit.id]?.form ?? edit.review?.draft.form ?? 'Normal') : undefined;

  if (items.length === 0) {
    return (
      <Screen title="Review" showBack>
        <EmptyState icon={<Check size={30} color={c.accent} />} title="Nothing to review" body="Process some screenshots first." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Review extracted Pokémon"
      subtitle="CONFIRM · CORRECT · SKIP"
      showBack
      footer={<Button label={`Add ${dedupe.fresh.length} Pokémon`} loading={saving} disabled={dedupe.fresh.length === 0} onPress={() => void save()} testID="review-save" />}
    >
      <Note>Green = read confidently, amber = uncertain (check it), grey = not found. Tap a card to correct anything. Duplicates of Pokémon you already have are skipped automatically.</Note>
      {built.map(({ item: i, sid, draft }) => {
        const r = i.review!;
        const sp = sid ? ref.getSpecies(sid, forms[i.id]?.form ?? r.draft.form) : undefined;
        const f = forms[i.id] ?? formFromPokemon(asOwned(r.draft));
        const isDup = !!draft && dedupe.duplicates.includes(draft);
        return (
          <Card key={i.id} style={{ gap: 10, opacity: i.skipped ? 0.5 : 1 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Image source={{ uri: i.uri }} style={{ width: 70, height: 100, borderRadius: 10, backgroundColor: c.canvas }} contentFit="cover" />
              <View style={{ flex: 1, gap: 6 }}>
                <Text variant="h3">{sp ? speciesDisplayName(sp) : 'Species not detected'}</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Pill label={`SPECIES ${sid ? (speciesOverride[i.id] ? 'FIXED' : r.fieldStatus.speciesName.toUpperCase()) : 'MISSING'}`} tone={sid ? (speciesOverride[i.id] ? 'success' : tone[r.fieldStatus.speciesName]) : 'danger'} />
                  <Pill label={`CP ${f.cp ?? '—'}`} tone={f.cp === r.draft.cp ? tone[r.fieldStatus.cp] : 'success'} />
                  <Pill label={`HP ${f.hp ?? '—'}`} tone={f.hp === r.draft.hp ? tone[r.fieldStatus.hp] : 'success'} />
                  <Pill label={f.atk === null ? 'IV —' : `IV ${f.atk}/${f.def}/${f.sta}`} tone={f.atk === r.draft.ivs?.atk ? tone[r.fieldStatus.ivs] : 'success'} />
                  <Pill label={f.level === null ? 'LVL —' : `LVL ${f.level}`} tone={f.level === r.draft.level ? tone[r.fieldStatus.level] : 'success'} />
                </View>
                <Text variant="caption" color="muted">{f.fastMove ?? 'fast move —'} · {f.chargedMove1 ?? 'charged —'}</Text>
              </View>
            </View>
            {r.warnings.slice(0, 3).map((w, k) => (
              <Text key={k} variant="caption" color="warning">• {w}</Text>
            ))}
            {isDup ? <Text variant="caption" color="warning">Already in your collection — will be skipped.</Text> : null}
            {sid > 0 && !draft ? <Text variant="caption" color="danger">Some values are invalid — tap Edit to fix them.</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Edit" size="sm" variant="secondary" fullWidth={false} icon={<Pencil size={14} color={c.text} />} onPress={() => { if (!sid) setPickingSpecies(i.id); else { setEditing(i.id); setErrors({}); } }} />
              <Button label={i.skipped ? 'Include' : 'Skip'} size="sm" variant="ghost" fullWidth={false} onPress={() => update(i.id, { skipped: !i.skipped })} />
            </View>
          </Card>
        );
      })}

      <Sheet visible={!!pickingSpecies} onClose={() => setPickingSpecies(null)} title="Which Pokémon is this?" tall>
        <View style={{ height: 520 }}>
          <SpeciesList onSelect={(s) => { if (pickingSpecies) { setSpeciesOverride((m) => ({ ...m, [pickingSpecies]: s.speciesId })); setForms((m) => ({ ...m, [pickingSpecies]: { ...(m[pickingSpecies] ?? formFromPokemon(asOwned(items.find((x) => x.id === pickingSpecies)!.review!.draft))), form: s.form } })); setEditing(pickingSpecies); } setPickingSpecies(null); }} />
        </View>
      </Sheet>

      <Sheet
        visible={!!edit && !!editSpecies}
        onClose={() => setEditing(null)}
        title="Correct details"
        tall
        footer={
          <Button
            label="Done"
            onPress={() => {
              if (!edit || !editSpecies) return;
              const { errors: errs } = buildDraft(editSpecies.speciesId, forms[edit.id] ?? formFor(edit));
              setErrors(errs);
              if (Object.keys(errs).length === 0) setEditing(null);
              else toast.error('Please fix the highlighted fields.');
            }}
          />
        }
      >
        {edit && editSpecies ? (
          <PokemonForm species={editSpecies} value={formFor(edit)} onChange={(p) => setForms((m) => ({ ...m, [edit.id]: { ...(m[edit.id] ?? formFor(edit)), ...p } }))} errors={errors} />
        ) : null}
        {edit ? <Button label="Change species" variant="ghost" size="sm" fullWidth={false} onPress={() => { setEditing(null); setPickingSpecies(edit.id); }} /> : null}
      </Sheet>
    </Screen>
  );
}
