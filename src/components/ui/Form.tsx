import { memo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/utils/haptics';
import { Text } from './Text';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  hint?: string;
  error?: string | null;
  right?: ReactNode;
  left?: ReactNode;
  testID?: string;
}

/** Input with focus ring (Orbital Blue) — 14px radius per design system. */
export const Field = memo(function Field({ label, hint, error, right, left, onFocus, onBlur, ...rest }: FieldProps) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="label" color="muted">
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: c.canvas,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: error ? c.danger : focused ? c.blue : c.elevatedHigh,
          paddingHorizontal: 14,
          minHeight: 50,
          shadowColor: c.blue,
          shadowOpacity: focused ? 0.3 : 0,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        {left}
        <TextInput
          {...rest}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          placeholderTextColor={c.textMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{ flex: 1, color: c.text, fontFamily: 'Geist_400Regular', fontSize: 16, paddingVertical: 12 }}
        />
        {right}
      </View>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

/** Integer input that keeps a string draft and only commits valid numbers (or null when empty). */
export const NumberField = memo(function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  allowDecimal,
  hint,
  placeholder,
  suffix,
  emitOutOfRange,
}: {
  label?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  allowDecimal?: boolean;
  hint?: string;
  placeholder?: string;
  suffix?: string;
  /**
   * Also report numbers outside min/max. By default they are only shown with an inline error and the previous in-range
   * value is kept, which silently saves stale data. Forms that validate on submit should set this so the typed value
   * reaches their own validation and blocks the save.
   */
  emitOutOfRange?: boolean;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // external change (e.g. reset)
    setLastValue(value);
    if (value === null ? draft !== '' : Number(draft) !== value) setDraft(value === null ? '' : String(value));
  }
  const n = draft === '' ? null : Number(draft);
  const error =
    draft !== '' && (Number.isNaN(n) || (min !== undefined && (n as number) < min) || (max !== undefined && (n as number) > max))
      ? `Enter a number${min !== undefined && max !== undefined ? ` between ${min} and ${max}` : min !== undefined ? ` ≥ ${min}` : max !== undefined ? ` ≤ ${max}` : ''}`
      : null;
  const keyboard: KeyboardTypeOptions = allowDecimal ? 'decimal-pad' : 'number-pad';
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      value={draft}
      placeholder={placeholder}
      keyboardType={keyboard}
      right={suffix ? <Text variant="small" color="muted">{suffix}</Text> : undefined}
      onChangeText={(t) => {
        const cleaned = allowDecimal ? t.replace(/[^0-9.]/g, '') : t.replace(/[^0-9]/g, '');
        setDraft(cleaned);
        if (cleaned === '') {
          setLastValue(null);
          onChange(null);
          return;
        }
        const num = Number(cleaned);
        const inRange = (min === undefined || num >= min) && (max === undefined || num <= max);
        if (!Number.isNaN(num) && (inRange || emitOutOfRange)) {
          setLastValue(num);
          onChange(num);
        }
      }}
    />
  );
});

export const Segmented = memo(function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.canvas, borderRadius: radius.pill, padding: 3, borderWidth: 1, borderColor: c.border }} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptic('select');
              onChange(o.value);
            }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: 36, borderRadius: radius.pill, backgroundColor: active ? c.elevatedHigh : 'transparent' }}
          >
            <Text variant="small" color={active ? 'primary' : 'muted'} style={{ fontFamily: active ? 'Geist_600SemiBold' : 'Geist_500Medium' }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}) as <T extends string>(p: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) => ReactNode;

export function SwitchRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium">{label}</Text>
        {description ? (
          <Text variant="caption" color="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={(v) => {
          haptic('select');
          onChange(v);
        }}
        trackColor={{ false: c.elevatedHigh, true: c.accent }}
        thumbColor={value ? c.accentOn : '#E7EAF2'}
        ios_backgroundColor={c.elevatedHigh}
      />
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  danger,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const { c } = useTheme();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      {left}
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium" color={danger ? 'danger' : 'primary'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => {
        haptic('light');
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth })}
    >
      {content}
    </Pressable>
  );
}

export function ProgressBar({ value, tone = 'accent', height = 6, label }: { value: number; tone?: 'accent' | 'blue' | 'purple' | 'warning' | 'danger'; height?: number; label?: string }) {
  const { c } = useTheme();
  const color = { accent: c.accent, blue: c.blue, purple: c.purple, warning: c.warning, danger: c.danger }[tone];
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height, borderRadius: height, backgroundColor: c.elevatedHigh, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct * 100}%`, height, borderRadius: height, backgroundColor: color }} />
    </View>
  );
}
