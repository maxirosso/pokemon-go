import { router, type Href } from 'expo-router';
import { Database, FileText, Image as ImageIcon, PencilLine } from 'lucide-react-native';
import { View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/useTheme';

export default function ImportHub() {
  const { c } = useTheme();
  const items = [
    { icon: <ImageIcon size={22} color={c.accent} />, title: 'Screenshots', body: 'Pick one or many Pokémon GO screenshots. Text (CP, HP, name, moves) is read on your device; you review everything before saving.', href: '/import/screenshots' },
    { icon: <FileText size={22} color={c.accent} />, title: 'CSV or JSON file', body: 'Poke Genie style exports, spreadsheets, or JSON lists. Bad rows are rejected with a reason; duplicates are detected.', href: '/import/file' },
    { icon: <Database size={22} color={c.accent} />, title: 'Restore a backup', body: 'Restore a GO Compass backup (JSON) — merge or replace.', href: '/settings/data' },
    { icon: <PencilLine size={22} color={c.accent} />, title: 'Add manually', body: 'Search the Pokédex and enter CP and IVs.', href: '/pokemon/add' },
  ];
  return (
    <Screen title="Import Pokémon" subtitle="BRING YOUR COLLECTION IN" showBack>
      {items.map((i) => (
        <Card key={i.title} onPress={() => router.push(i.href as Href)} style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>{i.icon}</View>
          <View style={{ flex: 1 }}>
            <Text variant="h3">{i.title}</Text>
            <Text variant="small" color="secondary">{i.body}</Text>
          </View>
        </Card>
      ))}
      <Note>There is no official, authorised way for third-party apps to read a Pokémon GO inventory, so GO Compass never connects to your game account. Importing is always something you do yourself.</Note>
    </Screen>
  );
}
