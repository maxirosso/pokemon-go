import type { ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  /** Base back-off in ms (doubles per attempt). */
  backoffMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** fetch + timeout + retry with exponential back-off. Retries network errors, 429 and 5xx only. */
export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 20000, retries = 2, backoffMs = 600 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      const res = await fetch(url, { signal: controller.signal, headers: opts.headers });
      if (res.ok) return res;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) throw new HttpError(`HTTP ${res.status} for ${url}`, res.status, false);
      lastError = new HttpError(`HTTP ${res.status} for ${url}`, res.status, true);
    } catch (e) {
      if (e instanceof HttpError && !e.retryable) throw e;
      lastError = e;
      if (opts.signal?.aborted) throw e;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(backoffMs * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new HttpError(`Request failed: ${url}`, null, true);
}

/** Fetch JSON and validate it against a Zod schema — a schema mismatch is an error, never silently accepted. */
export async function fetchJson<T>(url: string, schema: ZodType<T>, opts?: FetchOptions): Promise<T> {
  const res = await fetchWithRetry(url, opts);
  const json: unknown = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(`Unexpected response shape from ${url}: ${issue?.path.join('.')} ${issue?.message}`, null, false);
  }
  return parsed.data;
}
