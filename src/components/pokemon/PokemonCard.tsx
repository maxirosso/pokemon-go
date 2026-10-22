import { Heart, Ghost, Sparkles, Star, Droplets } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { IvBars } from '@/components/charts/Charts';
import { Pill } from '@/components/ui/Pill';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { ivPercent } from '@/engine/combat/cp';
import { speciesDisplayName } from '@/engine/reference/referenceData';
import type { Verdict } from '@/engine/recommendations/types';
import { VERDICT_LABEL } from '@/engine/recommendations/types';
import type { GoSpecies, OwnedPokemon } from '@/engine/types';
import { typeColors } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { fmtInt } from '@/utils/format';
import { haptic } from '@/utils/haptics';
import { TypeRow, verdictTone } from './Badges';
import { PokemonImage } from './PokemonImage';

export interface PokemonCardProps {
  pokemon: OwnedPokemon;
  species: GoSpecies;
  verdict?: Verdict | null;
  onPress: (p: OwnedPokemon) => void;
  onToggleFavorite?: (p: OwnedPokemon) => void;
  onLongPress?: (p: OwnedPokemon) => void;
  selected?: boolean;
  selectionMode?: boolean;
}

function verdictFooter(v: Verdict | null | undefined) {
  if (!v) return null;
  if (v.action === 'MORE_INFO') return { label: 'ADD DETAILS', tone: 'neutral' as const };
  if (v.action === 'POWER_UP' && v.priority <= 2) return { label: 'TOP INVESTMENT', tone: 'accent' as const };
  if (v.action === 'DONT_INVEST') return { label: 'PRESERVE STARDUST', tone: 'danger' as const };
  return { label: VERDICT_LABEL[v.action].toUpperCase(), tone: verdictTone(v.action) };
}

/** Collectible grid card. Artwork is the focal point; accent colour follows the primary type. */
export const PokemonCard = memo(function PokemonCard({ pokemon: p, species, verdict, onPress, onToggleFavorite, onLongPress, selected }: PokemonCardProps) {
  const { c } = useTheme();
  const typeColor = typeColors[species.types[0]];
  const iv = p.ivs ? ivPercent(p.ivs) : null;
  const perfect = iv === 100;
  const footer = verdictFooter(verdict);
  const name = p.nickname ?? speciesDisplayName(species);
  return (
    <View>
    <Card
      padded={false}
      variant={perfect ? 'glow' : 'default'}
      onPress={() => onPress(p)}
      onLongPress={onLongPress ? () => onLongPress(p) : undefined}
      accessibilityLabel={`${name}, CP ${p.cp ?? 'unknown'}, ${iv === null ? 'IVs unknown' : `${Math.round(iv)} percent IV`}`}
      style={{ borderColor: selected ? c.accent : undefined, borderWidth: selected ? 2 : undefined }}
    >
      <View style={{ padding: 12, gap: 8, backgroundColor: `${typeColor}12` }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', flexShrink: 1 }}>
            <Pill label={iv === null ? 'IV ?' : `${Math.round(iv)}%`} tone={perfect ? 'accent' : 'neutral'} />
            {p.shadow ? <Ghost size={14} color={c.danger} /> : null}
            {p.shiny ? <Sparkles size={14} color={c.warning} /> : null}
            {p.lucky ? <Star size={14} color={c.warning} /> : null}
            {p.purified ? <Droplets size={14} color={c.blue} /> : null}
          </View>
          <View style={{ width: 18, height: 18 }} />
        </View>
        <View style={{ alignItems: 'center', height: 104, justifyContent: 'center', backgroundColor: c.canvas, borderRadius: 16 }}>
          <PokemonImage speciesId={p.speciesId} form={p.form} shiny={p.shiny} size={96} />
        </View>
      </View>
      <View style={{ padding: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text variant="numMd" color={p.cp ? 'primary' : 'muted'}>
            {p.cp ? `CP ${fmtInt(p.cp)}` : 'CP —'}
          </Text>
          <Text variant="micro" color="muted">
            #{String(species.speciesId).padStart(3, '0')}
          </Text>
        </View>
        <Text variant="h3" numberOfLines={1}>
          {name}
        </Text>
        <TypeRow types={species.types} compact />
        <IvBars ivs={p.ivs} compact />
        {footer ? (
          <View style={{ marginTop: 2 }}>
            <Pill label={footer.label} tone={footer.tone} />
          </View>
        ) : null}
      </View>
    </Card>
    <Pressable
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={p.favorite ? 'Remove favorite' : 'Add favorite'}
      style={{ position: 'absolute', top: 12, right: 12 }}
      onPress={() => {
        haptic('light');
        onToggleFavorite?.(p);
      }}
    >
      <Heart size={18} color={p.favorite ? c.danger : c.textMuted} fill={p.favorite ? c.danger : 'transparent'} />
    </Pressable>
    </View>
  );
});

/** Compact list-mode row (collection "compact list" view). */
export const PokemonRow = memo(function PokemonRow({ pokemon: p, species, verdict, onPress, onLongPress }: PokemonCardProps) {
  const { c } = useTheme();
  const iv = p.ivs ? ivPercent(p.ivs) : null;
  const footer = verdictFooter(verdict);
  const name = p.nickname ?? speciesDisplayName(species);
  return (
    <Card onPress={() => onPress(p)} onLongPress={onLongPress ? () => onLongPress(p) : undefined} padded={false} accessibilityLabel={`${name}, CP ${p.cp ?? 'unknown'}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
        <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}>
          <PokemonImage speciesId={p.speciesId} form={p.form} shiny={p.shiny} size={52} kind="artwork" />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
              {name}
            </Text>
            {p.shadow ? <Ghost size={14} color={c.danger} /> : null}
            {p.shiny ? <Sparkles size={14} color={c.warning} /> : null}
            {p.favorite ? <Heart size={13} color={c.danger} fill={c.danger} /> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="numSm" color="secondary">
              {p.cp ? `CP ${fmtInt(p.cp)}` : 'CP —'}
            </Text>
            <Text variant="numSm" color={iv === 100 ? 'accent' : 'muted'}>
              {iv === null ? 'IV ?' : `${Math.round(iv)}%`}
            </Text>
            <TypeRow types={species.types} compact />
          </View>
        </View>
        {footer ? <Pill label={footer.label} tone={footer.tone} /> : null}
      </View>
    </Card>
  );
});
