import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist';
import { JetBrainsMono_500Medium, JetBrainsMono_600SemiBold, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastHost } from '@/components/ui/Toast';
import { useTheme } from '@/theme/useTheme';
import { useAnalysis } from '@/store/analysis';
import { useData } from '@/store/data';
import { useReference } from '@/store/reference';
import { useSettings } from '@/store/settings';
import { getDb } from '@/services/database/db';
import { kvRepo } from '@/services/database/repositories';
import { notifyNow, syncReminders } from '@/services/notifications/notifications';

void SplashScreen.preventAutoHideAsync();

/** Recompute recommendations (debounced) whenever the collection, resources, goals or reference data change. */
function AnalysisRunner() {
  const version = useData((s) => s.version);
  const ready = useData((s) => s.ready);
  const revision = useReference((s) => s.revision);
  const xl = useSettings((s) => s.hasXlCandy);
  useEffect(() => {
    if (!ready) return undefined;
    const id = setTimeout(() => void useAnalysis.getState().run(), 350);
    return () => clearTimeout(id);
  }, [version, revision, xl, ready]);
  return null;
}

/** Quiet background refresh of reference data — at most once per day, never blocks the UI. */
function ReferenceAutoRefresh() {
  const ready = useData((s) => s.ready);
  useEffect(() => {
    if (!ready) return;
    const last = useReference.getState().status.lastCheckedAt;
    const age = last ? Date.now() - new Date(last).getTime() : Infinity;
    if (age > 24 * 3600 * 1000) void useReference.getState().refresh({ silent: true });
  }, [ready]);
  return null;
}

function NotificationSync() {
  const prefs = useSettings((s) => s.notifications);
  const plan = useData((s) => s.plan);
  const lastVersion = useData((s) => s.version);
  const stardust = useData((s) => s.resources.find((r) => r.type === 'stardust')?.amount ?? null);
  const milestone = useSettings((s) => s.stardustMilestone);
  useEffect(() => {
    void syncReminders({ prefs, plan, pokemonCount: useData.getState().pokemon.length });
  }, [prefs, plan, lastVersion]);

  // The user's own Stardust milestone: fires once when *their entered balance* reaches *their own target*.
  useEffect(() => {
    if (!prefs.resourceMilestones || !milestone || stardust === null || stardust < milestone) return;
    void (async () => {
      const db = await getDb();
      const key = `milestone.notified.${milestone}`;
      if (await kvRepo.get(db, key)) return;
      await kvRepo.set(db, key, new Date().toISOString());
      await notifyNow('Stardust milestone reached', `You entered ${stardust.toLocaleString('en-US')} Stardust — your target was ${milestone.toLocaleString('en-US')}.`);
    })();
  }, [prefs.resourceMilestones, milestone, stardust]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });
  const dataReady = useData((s) => s.ready);
  const { c, isDark } = useTheme();
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 5 * 60 * 1000, networkMode: 'offlineFirst', refetchOnWindowFocus: false } },
      }),
    [],
  );

  useEffect(() => {
    // One after the other: both read SQLite and the web worker cannot run overlapping statements.
    void useData
      .getState()
      .init()
      .then(() => useReference.getState().init());
  }, []);

  useEffect(() => {
    if (fontsLoaded && dataReady) void SplashScreen.hideAsync();
  }, [fontsLoaded, dataReady]);

  const navTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: { ...(isDark ? DarkTheme : DefaultTheme).colors, background: c.background, card: c.background, text: c.text, border: c.border, primary: c.accent },
    }),
    [c, isDark],
  );

  if (!fontsLoaded || !dataReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={navTheme}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <AnalysisRunner />
            <ReferenceAutoRefresh />
            <NotificationSync />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background }, animation: 'slide_from_right' }}>
              <Stack.Screen name="index" options={{ animation: 'none' }} />
              <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
              <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
              <Stack.Screen name="pokemon/add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="filters" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="assistant" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            </Stack>
            <ToastHost />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
