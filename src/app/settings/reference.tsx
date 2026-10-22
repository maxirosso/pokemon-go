import { RefreshCw } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Screen, SectionHeader } from '@/components/ui/Screen';
import { Note } from '@/components/ui/States';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { KeyValue } from '@/components/pokemon/Analysis';
import { describeFreshness } from '@/services/reference/referenceService';
import { useReference } from '@/store/reference';
import { useTheme } from '@/theme/useTheme';
import { fmtInt, timeAgo } from '@/utils/format';

export default function ReferenceSettings() {
  const { c } = useTheme();
  const status = useReference((s) => s.status);
  const checking = useReference((s) => s.checking);
  const progress = useReference((s) => s.progress);
  const lastResult = useReference((s) => s.lastResult);
  const refresh = useReference((s) => s.refresh);
  const ref = useReference((s) => s.ref);
  const [showVersions, setShowVersions] = useState(false);
  const fresh = describeFreshness(status);

  return (
    <Screen title="Data sources" subtitle="REFERENCE DATA · FRESHNESS" showBack>
      <Card variant={fresh.severity === 'warn' ? 'warning' : 'default'} style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Pill label={status.source === 'bundled' ? 'BUNDLED SNAPSHOT' : status.source === 'cache' ? 'CACHED UPDATE' : 'FRESHLY DOWNLOADED'} tone={status.source === 'bundled' ? 'neutral' : 'success'} />
          {status.stale ? <Pill label="STALE" tone="warning" /> : <Pill label="UP TO DATE" tone="success" />}
        </View>
        <Text variant="small" color="secondary">{fresh.label}</Text>
        <KeyValue label="Data from" value={status.dataTimestamp.slice(0, 10)} />
        <KeyValue label="Last check" value={timeAgo(status.lastCheckedAt)} />
        <KeyValue label="PvPoke rankings" value={status.pvpokeFetchedAt ? status.pvpokeFetchedAt.slice(0, 10) : 'bundled snapshot'} />
        <KeyValue label="Species in dataset" value={fmtInt(status.speciesCount)} />
        <Button label={checking ? (progress ?? 'Checking…') : 'Check for updates'} loading={checking} icon={<RefreshCw size={18} color={c.accentOn} />} onPress={() => void refresh({ force: false })} />
        <Button label="Force re-download everything" variant="secondary" size="sm" disabled={checking} onPress={() => void refresh({ force: true })} />
        {lastResult ? <Text variant="small" color={lastResult.ok ? 'success' : 'warning'}>{lastResult.message}</Text> : null}
        {status.lastError && !lastResult ? <Text variant="small" color="warning">Last attempt: {status.lastError}</Text> : null}
      </Card>

      <Note>
        Updates download only datasets whose provider hash changed, validate them, and keep the last-known-good copy if anything fails. If a provider is down, the app keeps working with the data it has.
      </Note>

      <SectionHeader title="PROVIDERS" />
      <Card style={{ gap: 10 }}>
        <View style={{ gap: 2 }}>
          <Text variant="bodyMedium">PoGoAPI</Text>
          <Text variant="caption" color="muted">Pokémon GO base stats, moves, evolutions, power-up costs, CP multipliers, raid bosses, types, Mega data — pogoapi.net (community-maintained, derived from game files).</Text>
        </View>
        <View style={{ gap: 2 }}>
          <Text variant="bodyMedium">PvPoke</Text>
          <Text variant="caption" color="muted">PvP rankings and movesets — pvpoke.com (MIT licence). Used as the meta score; stat-product and simulation are computed locally.</Text>
        </View>
        <View style={{ gap: 2 }}>
          <Text variant="bodyMedium">PokéAPI</Text>
          <Text variant="caption" color="muted">Pokédex text, names and artwork only — pokeapi.co. Never used for Pokémon GO combat values.</Text>
        </View>
      </Card>

      <SectionHeader title="DATASET VERSIONS" />
      <Button label={showVersions ? 'Hide dataset hashes' : 'Show dataset hashes'} variant="ghost" size="sm" fullWidth={false} onPress={() => setShowVersions((s) => !s)} />
      {showVersions ? (
        <Card style={{ gap: 2 }}>
          {Object.entries(status.versions).map(([k, v]) => (
            <KeyValue key={k} label={k} value={v ? v.slice(0, 10) : '—'} />
          ))}
          <KeyValue label="CP multipliers up to level" value={`${ref.cpm.providerMaxLevel} (50 extrapolated)`} />
        </Card>
      ) : null}
    </Screen>
  );
}
