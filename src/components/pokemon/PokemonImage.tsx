import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { useSpeciesInfo } from '@/hooks/useSpeciesInfo';
import { pokeApiIdForForm, pokemonImageUrl, type ImageKind } from '@/services/api/pokeapi';
import { useTheme } from '@/theme/useTheme';

function Placeholder({ size }: { size: number }) {
  const { c } = useTheme();
  const s = size * 0.55;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
      <Svg width={s} height={s} viewBox="0 0 40 40">
        <Circle cx="20" cy="20" r="17" stroke={c.textMuted} strokeWidth="3" fill="none" />
        <Line x1="3" y1="20" x2="37" y2="20" stroke={c.textMuted} strokeWidth="3" />
        <Circle cx="20" cy="20" r="5" stroke={c.textMuted} strokeWidth="3" fill={c.background} />
      </Svg>
    </View>
  );
}

/**
 * Official artwork from the PokéAPI sprites repo. Default forms use a deterministic URL (no API call);
 * regional forms resolve their PokéAPI id from the cached species info. Images are disk-cached by expo-image.
 */
export const PokemonImage = memo(function PokemonImage({
  speciesId,
  form = 'Normal',
  shiny = false,
  size = 96,
  kind = 'artwork',
  style,
  accessibilityLabel,
}: {
  speciesId: number;
  form?: string;
  shiny?: boolean;
  size?: number;
  kind?: ImageKind;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const needsInfo = form !== 'Normal';
  const { data } = useSpeciesInfo(speciesId, needsInfo);
  const pokeId = pokeApiIdForForm(speciesId, form, data);
  const uri = pokemonImageUrl(pokeId, { shiny, kind });
  const [failedUri, setFailedUri] = useState<string | null>(null);
  // If the shiny artwork is missing, fall back to the regular one before giving up.
  const effectiveUri = failedUri === uri && shiny ? pokemonImageUrl(pokeId, { shiny: false, kind }) : uri;
  const showFallback = failedUri !== null && failedUri === effectiveUri;
  return (
    <View style={[{ width: size, height: size }, style]} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {showFallback ? (
        <Placeholder size={size} />
      ) : (
        <Image
          source={{ uri: effectiveUri }}
          style={{ width: size, height: size }}
          contentFit="contain"
          cachePolicy="disk"
          recyclingKey={effectiveUri}
          transition={140}
          onError={() => setFailedUri(effectiveUri)}
        />
      )}
    </View>
  );
});
