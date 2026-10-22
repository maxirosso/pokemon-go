/* eslint-disable @typescript-eslint/no-require-imports */
// Reanimated/worklets need native runtimes. Component tests use a minimal, behaviour-preserving mock:
// shared values are plain objects, animations resolve immediately and layout animations are chainable no-ops.
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const chain: unknown = new Proxy(function chainable() {}, {
    get: (_t, prop) => (prop === 'build' ? () => ({}) : chain),
    apply: () => chain,
  });
  const Animated = {
    View: RN.View,
    Text: RN.Text,
    Image: RN.Image,
    ScrollView: RN.ScrollView,
    FlatList: RN.FlatList,
    createAnimatedComponent: <T,>(c: T) => c,
  };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: (f: () => unknown) => f(),
    withTiming: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    useReducedMotion: () => false,
    FadeIn: chain,
    FadeOut: chain,
    FadeInDown: chain,
    FadeOutDown: chain,
    SlideInDown: chain,
    SlideOutDown: chain,
  };
});

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// Icons are pure presentation (and ship as ESM); render them as nothing in unit tests.
jest.mock('lucide-react-native', () => new Proxy({ __esModule: true }, { get: (t, name) => (name in t ? (t as Record<string | symbol, unknown>)[name] : () => null) }));
