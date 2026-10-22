import { router } from 'expo-router';
import { BarChart3, ShieldCheck, Sparkles } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Button } from '@/components/ui/Button';
import { CompassMark } from '@/components/ui/CompassMark';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Surface';
import { Text } from '@/components/ui/Text';
import { BRAND } from '@/constants/brand';
import { StepDots } from '@/features/profile/OnboardingFrame';
import { useTheme } from '@/theme/useTheme';

const POINTS = [
  { Icon: Sparkles, title: 'Knows your Pokémon', body: 'Add them once — CP, IVs, moves. Everything is stored privately on your device.' },
  { Icon: BarChart3, title: 'Real Pokémon GO maths', body: 'CP formula, PvP stat-product ranking, power-up costs and a raid damage model — not a tier list.' },
  { Icon: ShieldCheck, title: 'Honest by design', body: 'No fake sync. No login to the game. When data is missing, it asks instead of guessing.' },
];

export default function Welcome() {
  const { c } = useTheme();
  return (
    <Screen
      showOffline={false}
      footer={<Button label="Get started" onPress={() => router.push('/onboarding/trainer')} testID="onboarding-start" />}
      contentStyle={{ alignItems: 'stretch' }}
    >
      <View style={{ alignItems: 'center', paddingTop: 36, gap: 18 }}>
        <Animated.View entering={FadeIn.duration(500)} style={{ padding: 22, borderRadius: 36, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, shadowColor: c.accent, shadowOpacity: 0.3, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } }}>
          <CompassMark size={92} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(120).duration(400)} style={{ alignItems: 'center', gap: 6 }}>
          <Text variant="micro" color="accent">
            {BRAND.name.toUpperCase()}
          </Text>
          <Text variant="display" align="center" style={{ fontSize: 36, lineHeight: 40 }}>
            Your Pokémon collection.{'\n'}Smarter decisions.
          </Text>
          <Text variant="body" color="secondary" align="center" style={{ marginTop: 6 }}>
            Open the app and see exactly what to evolve, power up, or save — and why.
          </Text>
        </Animated.View>
        <StepDots step={1} total={4} />
      </View>
      <View style={{ gap: 10, marginTop: 8 }}>
        {POINTS.map(({ Icon, title, body }, i) => (
          <Animated.View key={title} entering={FadeInDown.delay(260 + i * 90).duration(360)}>
            <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={20} color={c.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h3">{title}</Text>
                <Text variant="small" color="secondary">
                  {body}
                </Text>
              </View>
            </Card>
          </Animated.View>
        ))}
      </View>
      <Text variant="caption" color="muted" align="center">
        {BRAND.disclaimer}
      </Text>
    </Screen>
  );
}
