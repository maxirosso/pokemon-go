import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/useTheme';

export function StepDots({ step, total }: { step: number; total: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }} accessibilityLabel={`Step ${step} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ width: i + 1 === step ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: i + 1 <= step ? c.accent : c.elevatedHigh }} />
      ))}
    </View>
  );
}

export function OnboardingFrame({
  step,
  total = 4,
  title,
  subtitle,
  children,
  footer,
  onBack,
  showBack = true,
}: {
  step: number;
  total?: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
  onBack?: () => void;
  showBack?: boolean;
}) {
  return (
    <Screen showBack={showBack} onBack={onBack} headerRight={<StepDots step={step} total={total} />} footer={footer} showOffline={false}>
      <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 8, marginTop: 4 }}>
        <Text variant="h1" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" color="secondary">
            {subtitle}
          </Text>
        ) : null}
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(80).duration(260)} style={{ gap: 14 }}>
        {children}
      </Animated.View>
    </Screen>
  );
}
