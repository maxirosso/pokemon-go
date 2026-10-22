import { router } from 'expo-router';
import { FileText, FlaskConical, Image as ImageIcon, PencilLine } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { buildDemoCollection } from '@/features/demo/demo';
import { OnboardingFrame } from '@/features/profile/OnboardingFrame';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';

function Option({ icon, title, body, onPress, badge }: { icon: React.ReactNode; title: string; body: string; onPress: () => void; badge?: string }) {
  const { c } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={title}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text variant="h3">{title}</Text>
          <Text variant="small" color="secondary">
            {body}
          </Text>
        </View>
        {badge ? (
          <Text variant="micro" color="warning">
            {badge}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

export default function CollectionStep() {
  const { c } = useTheme();
  const addMany = useData((s) => s.addMany);
  const ref = useReference((s) => s.ref);
  const [busy, setBusy] = useState(false);

  const finish = (then?: () => void) => {
    router.replace('/(tabs)');
    if (then) setTimeout(then, 60);
  };

  const demo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const items = buildDemoCollection(ref);
      await addMany(items, 'demo');
      toast.success(`Added ${items.length} demo Pokémon (tagged "demo"). Delete them any time in Settings.`);
      finish();
    } catch {
      toast.error('Could not add the demo collection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingFrame
      step={4}
      title="Bring in your Pokémon"
      subtitle="Choose how to start. You can use all of these later, too."
      footer={<Button label="Skip for now" variant="secondary" onPress={() => finish()} testID="collection-skip" />}
    >
      <Option icon={<PencilLine size={22} color={c.accent} />} title="Add Pokémon manually" body="Search the Pokédex, enter CP and IVs. Fastest for a few key Pokémon." onPress={() => finish(() => router.push('/pokemon/add'))} />
      <Option icon={<ImageIcon size={22} color={c.accent} />} title="Import screenshots" body="Pick Pokémon GO screenshots; text is read on your device and you review everything before saving." onPress={() => finish(() => router.push('/import/screenshots'))} />
      <Option icon={<FileText size={22} color={c.accent} />} title="Import CSV / JSON" body="From Poke Genie exports, other tools, or a GO Compass backup." onPress={() => finish(() => router.push('/import/file'))} />
      <Option icon={<FlaskConical size={22} color={c.warning} />} title="Explore a demo collection" body="16 sample Pokémon so you can try every feature. Clearly labelled as demo data." badge="DEMO" onPress={demo} />
      <Note>
        Direct Pokémon GO account sync is not available: there is no official, authorised API for third-party apps to read a player’s inventory, and GO Compass will never ask for your game login or use unofficial access. Manual entry, screenshots and file import are the supported ways in.
      </Note>
    </OnboardingFrame>
  );
}
