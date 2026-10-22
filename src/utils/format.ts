export const fmtInt = (n: number | null | undefined): string => (n === null || n === undefined || Number.isNaN(n) ? '—' : Math.round(n).toLocaleString('en-US'));

/** 1,425,000 → "1.43M", 88,000 → "88K" for tight tiles. */
export function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 10_000) return `${Math.round(n / 1000)}K`;
  if (a >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

export const fmtPct = (n: number | null | undefined, digits = 0): string => (n === null || n === undefined ? '—' : `${n.toFixed(digits)}%`);

export const fmtLevel = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(1));

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'never';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const titleCase = (s: string) => s.replace(/(^|\s)\S/g, (m) => m.toUpperCase());
