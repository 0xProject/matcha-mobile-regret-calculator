// lib/cache.ts
// Server-side in-memory cache for Codex OHLCV candle data.
// Persists across requests within a single server instance.
// TTL-based eviction prevents stale data and memory growth.

import type { OHLCCandle, Chain } from './types';
import { normalizeAddress } from './types';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  candles: OHLCCandle[];
  storedAt: number;
}

const store = new Map<string, CacheEntry>();

/**
 * Build a deterministic cache key for a token's candle data.
 * Round timestamps to the hour to improve hit rate.
 */
export function candleCacheKey(
  tokenAddress: string,
  chain: Chain,
  from: number,
  to: number,
  resolution: string = '60',
): string {
  const fromHour = Math.floor(from / 3600) * 3600;
  const toHour = Math.ceil(to / 3600) * 3600;
  return `${normalizeAddress(tokenAddress, chain)}:${chain}:${fromHour}:${toHour}:${resolution}`;
}

export function getCached(key: string): OHLCCandle[] | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;

  // TTL check
  if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
    store.delete(key);
    return undefined;
  }

  return entry.candles;
}

/**
 * Cache candle data. Does NOT cache empty arrays — empty results are likely
 * transient Codex failures and should be retried on the next request.
 */
export function setCache(key: string, candles: OHLCCandle[]): void {
  if (candles.length === 0) return; // don't cache failures
  store.set(key, { candles, storedAt: Date.now() });
}

/** Exposed for testing only */
export function clearCache(): void {
  store.clear();
}

export function cacheSize(): number {
  return store.size;
}
