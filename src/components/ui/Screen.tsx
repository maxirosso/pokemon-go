import { router } from 'expo-router';
import { useNetworkState } from 'expo-network';
import { ChevronLeft, WifiOff } from 'lucide-react-native';
import { memo, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/utils/haptics';
import { Text } from './Text';

export const DOCK_HEIGHT = 96;

export const IconButton = memo(function IconButton({
  children,
  onPress,
  label,
  size = 40,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  label: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        haptic('light');
        onPress?.();
      }}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.7 : 1 },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
});

export interface HeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  right?: ReactNode;
}

export function Header({ title, subtitle, onBack, showBack = true, right }: HeaderProps) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
      {showBack ? (
        <IconButton label={t('common.back')} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}>
          <ChevronLeft size={22} color={c.text} />
        </IconButton>
      ) : null}
      <View style={{ flex: 1 }}>
        {subtitle ? (
          <Text variant="micro" color="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {title ? (
          <Text variant="h3" numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function OfflineBanner() {
  const net = useNetworkState();
  const { c } = useTheme();
  const t = useT();
  if (net.isInternetReachable !== false && net.isConnected !== false) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 12, backgroundColor: c.warningSoft }}>
      <WifiOff size={16} color={c.warning} />
      <Text variant="small" color="warning" style={{ flex: 1 }}>
        {t('common.offline')}
      </Text>
    </View>
  );
}

export interface ScreenProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  headerRight?: ReactNode;
  /** Header slot that replaces the default header entirely. */
  header?: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Reserve space for the floating tab dock. */
  dock?: boolean;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  showOffline?: boolean;
  keyboard?: boolean;
}

/** Safe-area aware screen shell: header, keyboard handling, pull-to-refresh, dock-aware bottom padding. */
export function Screen({
  children,
  title,
  subtitle,
  showBack = false,
  onBack,
  headerRight,
  header,
  scroll = true,
  refreshing,
  onRefresh,
  dock,
  footer,
  contentStyle,
  showOffline = true,
  keyboard = true,
}: ScreenProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[{ paddingHorizontal: 16, paddingBottom: (dock ? DOCK_HEIGHT + insets.bottom + 16 : insets.bottom + 32) + (footer ? 84 : 0), gap: 16 }, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.elevated} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingHorizontal: 16 }, contentStyle]}>{children}</View>
  );
  const inner = (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
      {header ?? (title || showBack || headerRight ? <Header title={title} subtitle={subtitle} showBack={showBack} onBack={onBack} right={headerRight} /> : null)}
      {showOffline ? <OfflineBanner /> : null}
      {body}
      {footer ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 12, backgroundColor: c.background, borderTopWidth: 1, borderTopColor: c.border }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
  if (!keyboard) return inner;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {inner}
    </KeyboardAvoidingView>
  );
}

export function SectionHeader({ title, right, caption }: { title: string; right?: ReactNode; caption?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
      <View style={{ flex: 1 }}>
        <Text variant="label" color="muted" accessibilityRole="header">
          {title}
        </Text>
        {caption ? (
          <Text variant="caption" color="muted">
            {caption}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
