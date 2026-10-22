import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router/js-tabs';
import { Brain, House, LayoutGrid, Swords, User } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { useT, type TranslationKey } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/utils/haptics';

interface DockProps {
  state: { index: number; routes: { key: string; name: string }[] };
  /** SDK 58 bottom-tabs API: emit tabPress, then navigate by route *key*. */
  emitter: { emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean } };
  navigateToTab: (routeKey: string) => void;
}

const TABS: { name: string; key: TranslationKey; Icon: typeof House }[] = [
  { name: 'index', key: 'nav.home', Icon: House },
  { name: 'collection', key: 'nav.collection', Icon: LayoutGrid },
  { name: 'advisor', key: 'nav.advisor', Icon: Brain },
  { name: 'battle', key: 'nav.battle', Icon: Swords },
  { name: 'profile', key: 'nav.profile', Icon: User },
];

/** Floating, pill-shaped navigation dock (Midnight Orbit). Active tab: lime glyph + 4px bloom dot. */
function Dock({ state, emitter, navigateToTab }: DockProps) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const activeName = state.routes[state.index]?.name;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 420, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: c.borderStrong }}>
        <BlurView intensity={isDark ? 40 : 60} tint={isDark ? 'dark' : 'light'} style={{ flexDirection: 'row', backgroundColor: c.dock, paddingVertical: 10, paddingHorizontal: 6 }}>
          {TABS.map(({ name, key, Icon }) => {
            const route = state.routes.find((r) => r.name === name);
            if (!route) return null;
            const active = activeName === name;
            const color = active ? c.accent : c.textMuted;
            return (
              <Pressable
                key={name}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(key)}
                style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 }}
                onPress={() => {
                  haptic('select');
                  const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!active && !event.defaultPrevented) navigateToTab(route.key);
                }}
              >
                <Icon size={22} color={color} strokeWidth={active ? 2.4 : 1.9} />
                <Text variant="micro" style={{ color, fontSize: 9, letterSpacing: 0.8 }} numberOfLines={1}>
                  {t(key)}
                </Text>
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: active ? c.accent : 'transparent',
                    shadowColor: c.accent,
                    shadowOpacity: active ? 0.9 : 0,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 0 },
                  }}
                />
              </Pressable>
            );
          })}
        </BlurView>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      tabBar={(props) => <Dock {...(props as unknown as DockProps)} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="collection" />
      <Tabs.Screen name="advisor" />
      <Tabs.Screen name="battle" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
