import { useEffect, useRef, useState } from 'react';
import { NumberField } from '@/components/ui/Form';
import { Text } from '@/components/ui/Text';
import type { ResourceType } from '@/engine/types';
import { useData } from '@/store/data';

/** Number input bound to one resource balance. Empty = unknown (distinct from 0). Writes are debounced. */
export function ResourceInput({
  label,
  type,
  scope = null,
  hint,
  placeholder,
}: {
  label: string;
  type: ResourceType;
  scope?: string | null;
  hint?: string;
  placeholder?: string;
}) {
  const stored = useData((s) => s.resources.find((r) => r.type === type && r.scope === scope)?.amount ?? null);
  const setResource = useData((s) => s.setResource);
  const [value, setValue] = useState<number | null>(stored);
  const dirty = useRef(false);
  const lastStored = useRef(stored);

  useEffect(() => {
    if (!dirty.current && stored !== lastStored.current) {
      lastStored.current = stored;
      setValue(stored);
    }
  }, [stored]);

  useEffect(() => {
    if (!dirty.current) return undefined;
    const id = setTimeout(() => {
      dirty.current = false;
      lastStored.current = value;
      void setResource(type, scope, value);
    }, 600);
    return () => clearTimeout(id);
  }, [value, type, scope, setResource]);

  return <NumberField label={label} value={value} onChange={(v) => { dirty.current = true; setValue(v); }} min={0} hint={hint} placeholder={placeholder ?? 'not entered'} />;
}

export function ResourceHint() {
  return (
    <Text variant="caption" color="muted">
      Leave a field empty if you don’t know it — unknown is different from 0, and recommendations will say they can’t check affordability.
    </Text>
  );
}

