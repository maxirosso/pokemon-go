import { Stack } from 'expo-router';
import { useTheme } from '@/theme/useTheme';

export default function OnboardingLayout() {
  const { c } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background }, animation: 'slide_from_right' }} />;
}
