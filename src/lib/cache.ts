/**
 * General-purpose caching layer with optional Upstash Redis backend.
 *
 * - If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, values are
 *   stored in Redis via the REST API (works across horizontal scaling).
 * - Otherwise, falls back to an in-memory Map with TTL tracking.
 *
 * All keys are prefixed with "cache:" to avoid collision with rate-limit keys.
 */
import 'server-only';

interface CacheOptions {
  /** Time-to-live in seconds. Default 300 (5 min). */
  ttlSeconds?: number;
}

interface InMemoryEntry {
  value: string; // JSON-serialised
  expiresAt: number; // Date.now() + ttl
}

// ── In-memory store (singleton across HMR) ──

const globalForCache = globalThis as unknown as {
  _cacheStore?: Map<string, InMemoryEntry>;
};
if (!globalForCache._cacheStore) {
  globalForCache._cacheStore = new Map();
}
const store = globalForCache._cacheStore;

// ── Upstash detection (reuse same env vars as rate-limit.ts) ──

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = !!(UPSTASH_URL && UPSTASH_TOKEN);

const KEY_PREFIX = 'cache:';
const DEFAULT_TTL = 300; // 5 minutes

// ── Upstash helpers ──

async function upstashCommand(commands: string[][]): Promise<any[]> {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  return res.json();
}

// ── Public API ──

export async function cacheGet<T>(key: string): Promise<T | null> {
  const fullKey = `${KEY_PREFIX}${key}`;

  if (useUpstash) {
    try {
      const results = await upstashCommand([['GET', fullKey]]);
      const raw = results?.[0]?.result;
      if (raw == null) return null;
      return JSON.parse(raw) as T;
    } catch {
      // Fall through to in-memory
    }
  }

  const entry = store.get(fullKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(fullKey);
    return null;
  }
  return JSON.parse(entry.value) as T;
}

export async function cacheSet<T>(
  key: string,
  value: T,
  options?: CacheOptions,
): Promise<void> {
  const fullKey = `${KEY_PREFIX}${key}`;
  const ttl = options?.ttlSeconds ?? DEFAULT_TTL;
  const serialised = JSON.stringify(value);

  if (useUpstash) {
    try {
      await upstashCommand([['SET', fullKey, serialised, 'EX', String(ttl)]]);
      return;
    } catch {
      // Fall through to in-memory
    }
  }

  store.set(fullKey, {
    value: serialised,
    expiresAt: Date.now() + ttl * 1000,
  });
}

export async function cacheDelete(key: string): Promise<void> {
  const fullKey = `${KEY_PREFIX}${key}`;

  if (useUpstash) {
    try {
      await upstashCommand([['DEL', fullKey]]);
    } catch {
      // best-effort
    }
  }

  store.delete(fullKey);
}

export async function cacheClear(prefix?: string): Promise<void> {
  const matchPrefix = `${KEY_PREFIX}${prefix ?? ''}`;

  if (useUpstash && prefix) {
    // Upstash SCAN-based delete is not atomic but good enough for cache
    try {
      let cursor = '0';
      do {
        const results = await upstashCommand([
          ['SCAN', cursor, 'MATCH', `${matchPrefix}*`, 'COUNT', '100'],
        ]);
        const scanResult = results?.[0]?.result;
        cursor = scanResult?.[0] ?? '0';
        const keys: string[] = scanResult?.[1] ?? [];
        if (keys.length > 0) {
          await upstashCommand(keys.map((k) => ['DEL', k]));
        }
      } while (cursor !== '0');
    } catch {
      // best-effort
    }
  }

  for (const k of store.keys()) {
    if (k.startsWith(matchPrefix)) {
      store.delete(k);
    }
  }
}

// ── Periodic in-memory cleanup (every 5 min) ──

function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) {
      store.delete(key);
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var _cacheCleanupScheduled: boolean | undefined;
}
if (!useUpstash && !globalThis._cacheCleanupScheduled) {
  globalThis._cacheCleanupScheduled = true;
  setInterval(() => cleanupExpiredEntries(), 5 * 60_000).unref();
}
