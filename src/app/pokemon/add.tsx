import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Plus, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { TypeRow } from '@/components/pokemon/Badges';
import { PokemonImage } from '@/components/pokemon/PokemonImage';
import { SpeciesList } from '@/components/pokemon/SpeciesList';
import { Button } from '@/components/ui/Button';
import { IconButton, Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { buildDraft, emptyForm, formFromPokemon, type FormErrors, type FormState } from '@/features/collection/formModel';
import { PokemonForm } from '@/features/collection/PokemonForm';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import type { GoSpecies } from '@/engine/types';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';

/**
 * Add / edit a Pokémon. Step 1: pick the species from the searchable Pokédex (artwork + types).
 * Step 2: enter whatever is known — everything except the species is optional and nothing is assumed.
 */
export default function AddPokemon() {
  const { c } = useTheme();
  const { editId, speciesId, form: formParam } = useLocalSearchParams<{ editId?: string; speciesId?: string; form?: string }>();
  const ref = useReference((s) => s.ref);
  const pokemon = useData((s) => s.pokemon);
  const addPokemon = useData((s) => s.addPokemon);
  const updatePokemon = useData((s) => s.updatePokemon);
  const existing = useMemo(() => (editId ? pokemon.find((p) => p.id === editId) : undefined), [editId, pokemon]);

  const initialSpecies = useMemo(() => {
    if (existing) return ref.getSpecies(existing.speciesId, existing.form);
    if (speciesId) return ref.getSpecies(Number(speciesId), formParam ?? 'Normal');
    return undefined;
  }, [existing, speciesId, formParam, ref]);

  const [species, setSpecies] = useState<GoSpecies | undefined>(initialSpecies);
  const [form, setForm] = useState<FormState>(() => (existing ? formFromPokemon(existing) : emptyForm(initialSpecies?.form ?? 'Normal')));
  // After a rejected save the errors are re-derived from the form on every edit, so a fixed field's message clears at once.
  const [attempted, setAttempted] = useState(false);
  const errors: FormErrors = attempted && species ? buildDraft(species.speciesId, form).errors : {};
  const [saving, setSaving] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  const save = async (another: boolean) => {
    if (!species) return;
    const { draft } = buildDraft(species.speciesId, form);
    setAttempted(!draft);
    if (!draft) {
      toast.error('Please fix the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await updatePokemon(existing.id, draft);
        toast.success(`${speciesDisplayName(species)} updated`);
        close();
      } else {
        const created = await addPokemon(draft, 'manual');
        toast.success(`${speciesDisplayName(species)} added to your collection`);
        if (another) {
          setForm(emptyForm(species.form));
          setAttempted(false);
        } else {
          router.replace(`/pokemon/${created.id}` as Href);
        }
      }
    } catch {
      toast.error('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmClose = () => {
    const dirty = !existing && species && JSON.stringify(form) !== JSON.stringify(emptyForm(species.form));
    if (!dirty) return close();
    Alert.alert('Discard this Pokémon?', 'You have unsaved details.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: close },
    ]);
  };

  if (!species) {
    return (
      <Screen
        title="Add Pokémon"
        subtitle="STEP 1 · SPECIES"
        showBack={false}
        scroll={false}
        headerRight={
          <IconButton label="Close" onPress={close}>
            <X size={20} color={c.text} />
          </IconButton>
        }
      >
        <SpeciesList
          onSelect={(s) => {
            setSpecies(s);
            setForm(emptyForm(s.form));
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={existing ? 'Edit Pokémon' : 'Pokémon details'}
      subtitle={existing ? undefined : 'STEP 2 · DETAILS'}
      showBack={false}
      headerRight={
        <IconButton label="Close" onPress={confirmClose}>
          <X size={20} color={c.text} />
        </IconButton>
      }
      footer={
        <View style={{ gap: 8 }}>
          <Button label={existing ? 'Save changes' : 'Save to collection'} loading={saving} onPress={() => save(false)} testID="save-pokemon" />
          {!existing ? <Button label="Save & add another" variant="secondary" size="sm" disabled={saving} icon={<Plus size={16} color={c.text} />} onPress={() => save(true)} /> : null}
        </View>
      }
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 84, height: 84, borderRadius: 20, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>
          <PokemonImage speciesId={species.speciesId} form={form.form} shiny={form.shiny} size={76} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="micro" color="muted">
            #{String(species.speciesId).padStart(3, '0')}
          </Text>
          <Text variant="h2" numberOfLines={1}>
            {speciesDisplayName(ref.getSpecies(species.speciesId, form.form) ?? species)}
          </Text>
          <TypeRow types={(ref.getSpecies(species.speciesId, form.form) ?? species).types} />
          {!existing ? <Button label="Change species" variant="ghost" size="sm" fullWidth={false} onPress={() => setSpecies(undefined)} /> : null}
        </View>
      </Card>
      <PokemonForm species={ref.getSpecies(species.speciesId, form.form) ?? species} value={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} errors={errors} />
    </Screen>
  );
}
