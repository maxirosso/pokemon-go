import { View } from 'react-native';
import { CompassMark } from '@/components/ui/CompassMark';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { APP_VERSION, BRAND } from '@/constants/brand';

const SOURCES = [
  { name: 'PoGoAPI', url: 'pogoapi.net', use: 'Pokémon GO gameplay data (stats, moves, evolutions, costs, raid bosses).', licence: 'Community project — check its terms before commercial use.' },
  { name: 'PvPoke', url: 'github.com/pvpoke/pvpoke', use: 'PvP rankings and recommended movesets.', licence: 'MIT licence — © PvPoke contributors.' },
  { name: 'PokéAPI', url: 'pokeapi.co', use: 'Species descriptions, names, sprites and official artwork.', licence: 'Data is free to use with attribution; artwork and sprites are © Nintendo / Game Freak / The Pokémon Company.' },
  { name: 'Google Gemini', url: 'ai.google.dev', use: 'Optional AI coach and screenshot analysis, via your own backend.', licence: 'Subject to Google’s API terms and quotas.' },
  { name: 'Geist & JetBrains Mono', url: 'fonts.google.com', use: 'Typography.', licence: 'SIL Open Font License 1.1.' },
];

export default function About() {
  return (
    <Screen title="About & attribution" showBack>
      <View style={{ alignItems: 'center', gap: 6, paddingTop: 8 }}>
        <CompassMark size={72} />
        <Text variant="h2">{BRAND.name}</Text>
        <Text variant="numSm" color="muted">Version {APP_VERSION}</Text>
        <Text variant="small" color="secondary" align="center">{BRAND.tagline}</Text>
      </View>

      <Card variant="warning" style={{ gap: 6 }}>
        <Text variant="label" color="warning">UNOFFICIAL APP</Text>
        <Text variant="small" color="secondary">{BRAND.disclaimer}</Text>
      </Card>

      <SectionHeader title="PRIVACY" />
      <Card style={{ gap: 8 }}>
        <Text variant="small" color="secondary">• Your collection, resources, teams and plan are stored only on this device (SQLite). No account is required.</Text>
        <Text variant="small" color="secondary">• Screenshots are read on-device. If you turn on the optional cloud screenshot analysis you must explicitly consent each time you enable it; the image is sent to your configured Gemini backend and nothing else is uploaded.</Text>
        <Text variant="small" color="secondary">• AI chat questions send a compact summary of your collection to the backend you configure. API keys are never stored in the app.</Text>
        <Text variant="small" color="secondary">• You can export everything or erase it completely in Backup &amp; data.</Text>
        <Text variant="small" color="secondary">• GO Compass never asks for Pokémon GO credentials and does not use any unofficial game API.</Text>
      </Card>

      <SectionHeader title="DATA SOURCES & ACKNOWLEDGEMENTS" />
      <View style={{ gap: 8 }}>
        {SOURCES.map((s) => (
          <Card key={s.name} style={{ gap: 2 }}>
            <Text variant="bodyMedium">{s.name} <Text variant="caption" color="muted">· {s.url}</Text></Text>
            <Text variant="small" color="secondary">{s.use}</Text>
            <Text variant="caption" color="muted">{s.licence}</Text>
          </Card>
        ))}
      </View>

      <Card style={{ gap: 6 }}>
        <Text variant="label" color="muted">BEFORE PUBLISHING</Text>
        <Text variant="small" color="secondary">
          Pokémon artwork, names and the Pokémon GO trademarks belong to their owners. Before a store release the developer must confirm an artwork licence (or replace artwork), confirm commercial-use terms for each data provider, and review the app name against trademark rules. See DATA_SOURCES.md.
        </Text>
      </Card>
    </Screen>
  );
}
