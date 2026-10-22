import { Redirect } from 'expo-router';
import { useData } from '@/store/data';

/** Entry: first launch → onboarding, otherwise → dashboard. No account is ever required. */
export default function Index() {
  const trainer = useData((s) => s.trainer);
  return <Redirect href={trainer ? '/(tabs)' : '/onboarding'} />;
}
