// lib/codex.ts
// Codex API client — fetches hourly OHLCV candle data for tokens.
// Server-only: uses process.env.
// All fetches check and populate the in-memory cache in lib/cache.ts.
//
// Codex getBars API:
//   symbol format: "tokenAddress:networkId"
//   response: parallel arrays { t, o, h, l, c, v }

import type { Chain, OHLCCandle } from './types';
import { getCached, setCache, candleCacheKey } from './cache';

const CODEX_BASE_URL = 'https://graph.codex.io/graphql';

// Codex network IDs
const NETWORK_MAP: Record<Chain, number> = {
  base: 8453,
  solana: 1399811149,
};

interface CodexBarsResponse {
  data: {
    getBars: {
      t: number[] | null;
      o: number[] | null;
      h: number[] | null;
      l: number[] | null;
      c: number[] | null;
    } | null;
  } | null;
  errors?: Array<{ message: string }>;
}

function getApiKey(): string {
  const key = process.env.CODEX_API_KEY;
  if (!key) throw new Error('CODEX_API_KEY is not set');
  return key;
}

export type CandleResolution = '60' | '1D';

/**
 * Fetch OHLC candles for a token between two timestamps.
 * Default resolution is '60' (hourly). Pass '1D' for daily candles.
 * Returns empty array if no data is available (callers mark trade as skipped).
 * Results are cached by token+chain+timerange+resolution.
 */
export async function fetchCandles(
  tokenAddress: string,
  chain: Chain,
  from: number,
  to: number,
  resolution: CandleResolution = '60',
): Promise<OHLCCandle[]> {
  const key = candleCacheKey(tokenAddress, chain, from, to, resolution);
  const cached = getCached(key);
  if (cached !== undefined) return cached;

  const candles = await fetchCandlesFromAPI(tokenAddress, chain, from, to, resolution);
  setCache(key, candles);
  return candles;
}

async function fetchCandlesFromAPI(
  tokenAddress: string,
  chain: Chain,
  from: number,
  to: number,
  resolution: CandleResolution = '60',
): Promise<OHLCCandle[]> {
  const networkId = NETWORK_MAP[chain];
  const apiKey = getApiKey();
  const symbol = `${tokenAddress}:${networkId}`;

  console.log(`[codex] fetching ${symbol} from=${from} to=${to}`);

  const query = `
    query GetBars($symbol: String!, $from: Int!, $to: Int!, $resolution: String!) {
      getBars(symbol: $symbol, from: $from, to: $to, resolution: $resolution) {
        t
        o
        h
        l
        c
      }
    }
  `;

  const res = await fetch(CODEX_BASE_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000), // 15s timeout — prevent hangs on bad WiFi
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({
      query,
      variables: {
        symbol,
        from,
        to,
        resolution, // '60' = hourly, '1D' = daily
      },
    }),
  });

  if (!res.ok) {
    console.warn(`[codex] HTTP ${res.status} for ${symbol}`);
    return [];
  }

  const body = (await res.json()) as CodexBarsResponse;

  if (body.errors?.length || !body.data?.getBars) {
    console.warn(`[codex] no data for ${symbol}:`, body.errors?.[0]?.message ?? 'getBars null');
    return [];
  }

  const bars = body.data.getBars;
  if (!bars.t || !bars.o || !bars.h || !bars.l || !bars.c) {
    return [];
  }

  const candles: OHLCCandle[] = [];
  for (let i = 0; i < bars.t.length; i++) {
    const high = bars.h[i];
    const low = bars.l[i];
    if (high <= 0 || low <= 0) continue;
    candles.push({
      timestamp: bars.t[i],
      open: bars.o[i],
      high,
      low,
      close: bars.c[i],
    });
  }

  console.log(`[codex] ${symbol}: ${candles.length} candles`);
  return candles.sort((a, b) => a.timestamp - b.timestamp);
}
