// lib/zerion.ts
// Zerion API client — fetches and normalizes swap events for a wallet.
// Returns raw buy/sell events; pairing into completed trades is done in analyze.ts.
// Server-only: uses process.env.
//
// Rate limit strategy: Zerion free tier allows ~6 req/min (~1 per 10s).
// We paginate up to MAX_PAGES (300 trades) with 11s PAGE_DELAY_MS between requests
// so we never exceed the rate limit. Worst case: 3 pages × 11s = 22s Zerion time.
// Historical window: 180 days.
// fetchZerion retries up to 3× on 429, waiting 10s each retry.
//
// Event cache: normalized events are cached per wallet+chain for 5 minutes to avoid
// re-hitting Zerion on repeated analyses of the same wallet (e.g. during development).

import type { Chain, ZerionPnLRecord } from './types';
import { normalizeAddress } from './types';

const STABLE_SYMBOLS = new Set([
  'USDC', 'USDT', 'DAI', 'BUSD', 'FRAX', 'LUSD', 'USDBC', 'USDbC',
  'USDC.e', 'WETH', 'ETH', 'SOL', 'WSOL',
]);

const ZERION_BASE_URL = 'https://api.zerion.io/v1';
const LOOKBACK_DAYS = 365;
const PAGE_SIZE = 100;      // Zerion hard max per page
const MAX_PAGES = 5;        // 500 trades — covers virtually all real wallets
const PAGE_DELAY_MS = 500; // 500ms between pages — builder tier supports 50 req/s

const CHAIN_MAP: Record<Chain, string> = {
  base: 'base',
  solana: 'solana',
};

// In-memory cache for normalized events — avoids re-fetching Zerion on repeated
// analyses of the same wallet within a 5-minute window.
const EVENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
interface EventCacheEntry { events: ZerionEvent[]; fetchedAt: number }
const eventCache = new Map<string, EventCacheEntry>();

export interface ZerionEvent {
  id: string;
  type: 'buy' | 'sell';
  tokenSymbol: string;
  tokenName: string;
  tokenAddress: string;
  tokenAmount: number;
  usdValue: number;
  price: number;
  timestamp: number; // unix seconds
  blockNumber: number | null;
}

interface ZerionTransfer {
  direction: 'in' | 'out';
  quantity: { float: number };
  price: number | null;
  value: number | null;
  fungible_info: {
    symbol: string;
    name: string;
    implementations: Array<{ address: string | null; chain_id: string }>;
  };
}

interface ZerionTransaction {
  id: string;
  attributes: {
    operation_type: string;
    mined_at: string;
    mined_at_block: number | null;
    transfers: ZerionTransfer[];
  };
}

interface ZerionResponse {
  data: ZerionTransaction[];
  links: { next?: string | null };
}

export class ZerionRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Zerion rate limited — retry after ${retryAfterSeconds}s`);
    this.name = 'ZerionRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAuthHeader(): string {
  const key = process.env.ZERION_API_KEY;
  if (!key) throw new Error('ZERION_API_KEY is not set');
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

function isStable(symbol: string): boolean {
  return STABLE_SYMBOLS.has(symbol) || STABLE_SYMBOLS.has(symbol.toUpperCase());
}

function getTokenAddress(transfer: ZerionTransfer, chain: Chain): string {
  const impl = transfer.fungible_info.implementations.find(
    (i) => i.chain_id === chain && i.address,
  );
  if (!impl?.address) {
    console.warn(`[zerion] no ${chain} address for ${transfer.fungible_info.symbol} — using symbol as fallback`);
  }
  return impl?.address ?? transfer.fungible_info.symbol;
}

/**
 * Single fetch with retries on 429/503 and network-level errors.
 * AbortSignal.timeout fires → Node.js throws TypeError('fetch failed') with
 * cause=DOMException(TimeoutError). We detect this and retry with backoff
 * rather than letting it propagate raw to the client.
 */
const FETCH_TIMEOUT_MS = 25_000; // 25s per request — generous for slow Zerion responses

async function fetchZerion(url: string, auth: string): Promise<Response> {
  const headers = { Authorization: auth, Accept: 'application/json' };
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (fetchErr) {
      // Node.js wraps AbortSignal timeout + network errors as TypeError('fetch failed').
      // Check the cause to distinguish timeout (retriable) from hard errors.
      const isRetriable = fetchErr instanceof Error && (
        fetchErr.message === 'fetch failed' ||
        fetchErr.name === 'TimeoutError' ||
        (fetchErr.cause instanceof Error && fetchErr.cause.name === 'TimeoutError')
      );
      if (isRetriable && attempt < MAX_RETRIES - 1) {
        console.warn(`[zerion] fetch timeout/network error on attempt ${attempt + 1}, retrying in 3s...`);
        await sleep(3000);
        continue;
      }
      // Exhausted retries or non-retriable error — translate to a typed error
      throw new Error(`Zerion request failed after ${attempt + 1} attempts: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
    }

    if (res.status === 429) {
      const resetIn = parseInt(res.headers.get('ratelimit-reset') ?? '2', 10);
      const dayRemaining = parseInt(res.headers.get('ratelimit-org-day-remaining') ?? '1', 10);

      // Daily quota exhausted — retrying won't help
      if (dayRemaining === 0) {
        console.warn(`[zerion] daily quota exhausted (reset in ${resetIn}s)`);
        throw new ZerionRateLimitError(resetIn);
      }

      // Per-second rate limit — wait exactly what the header says
      const waitMs = Math.max(resetIn * 1000, 1000);
      console.warn(`[zerion] 429 on attempt ${attempt + 1}, waiting ${waitMs}ms (reset in ${resetIn}s, day remaining: ${dayRemaining})`);
      if (attempt === MAX_RETRIES - 1) throw new ZerionRateLimitError(resetIn);
      await sleep(waitMs);
      continue;
    }

    if (res.status === 503) {
      // Transient or initial wallet bootstrap (Solana PnL can take 10-60s on first request).
      // Aggressive backoff: 3s, 8s, 15s, 30s — totals ~56s to cover Solana bootstrap window.
      const backoff = Math.min(3000 * Math.pow(2, attempt), 30000) + Math.random() * 1000;
      console.warn(`[zerion] 503 on attempt ${attempt + 1}, backing off ${Math.round(backoff / 1000)}s`);
      if (attempt === MAX_RETRIES - 1) throw new ZerionRateLimitError(2);
      await sleep(backoff);
      continue;
    }

    return res;
  }

  throw new ZerionRateLimitError(10);
}

/**
 * Fetch up to MAX_PAGES × PAGE_SIZE (500) swap events for a wallet in the
 * last 180 days. Collects all pages before normalizing so that the same-block
 * deduplication operates on the full dataset.
 */
export async function fetchTradeEvents(
  address: string,
  chain: Chain,
): Promise<ZerionEvent[]> {
  const cacheKey = `${normalizeAddress(address, chain)}:${chain}`;
  const cached = eventCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < EVENT_CACHE_TTL_MS) {
    console.log(`[zerion] cache hit for ${address.slice(0, 8)}... (${cached.events.length} events)`);
    return cached.events;
  }

  const auth = getAuthHeader();
  const chainId = CHAIN_MAP[chain];
  const fromTimestamp = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86400;
  // API expects milliseconds (13-digit), not seconds (10-digit)
  const fromTimestampMs = fromTimestamp * 1000;

  const params = new URLSearchParams({
    'filter[operation_types]': 'trade,execute',
    'filter[chain_ids]': chainId,
    'filter[min_mined_at]': String(fromTimestampMs),
    'page[size]': String(PAGE_SIZE),
    'sort': '-mined_at',
  });

  let url: string | null =
    `${ZERION_BASE_URL}/wallets/${address}/transactions/?${params}`;
  const allTxs: ZerionTransaction[] = [];

  for (let page = 0; page < MAX_PAGES && url !== null; page++) {
    if (page > 0) await sleep(PAGE_DELAY_MS);

    const res = await fetchZerion(url, auth);
    if (res.status === 404) break;

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[zerion] ${res.status}:`, errBody.slice(0, 300));
      throw new Error(`Zerion ${res.status}: ${errBody.slice(0, 150)}`);
    }

    const body = (await res.json()) as ZerionResponse;
    allTxs.push(...body.data);
    console.log(`[zerion] page ${page + 1}: ${body.data.length} txs (total ${allTxs.length})`);

    url = body.links.next ?? null;
  }

  const events = normalizeEvents(allTxs, chain, fromTimestamp);
  eventCache.set(cacheKey, { events, fetchedAt: Date.now() });
  return events;
}

function normalizeEvents(
  txs: ZerionTransaction[],
  chain: Chain,
  fromTimestamp: number,
): ZerionEvent[] {
  // Count transactions per block to filter same-block sandwich activity.
  // Use != null (loose) to catch both null and undefined — Zerion omits this
  // field for Solana, so JS sees undefined; strict !== null would pass undefined
  // and count all Solana txs under the same undefined key (count=100, all filtered).
  const blockCounts = new Map<number, number>();
  for (const tx of txs) {
    const b = tx.attributes.mined_at_block;
    if (b != null) blockCounts.set(b, (blockCounts.get(b) ?? 0) + 1);
  }

  const events: ZerionEvent[] = [];

  for (const tx of txs) {
    const { attributes } = tx;
    const ts = Math.floor(new Date(attributes.mined_at).getTime() / 1000);
    if (ts < fromTimestamp) continue;

    const block = attributes.mined_at_block;
    if (block != null && (blockCounts.get(block) ?? 0) > 2) continue;

    const transfers = attributes.transfers;
    // Pick the transfer with the highest USD value per direction.
    // Solana trades often have multiple out-transfers (e.g. 3 SOL transfers where
    // only one carries the real value — the others are $0 fee/rent transfers).
    const inTransfers = transfers.filter((t) => t.direction === 'in' && t.fungible_info);
    const outTransfers = transfers.filter((t) => t.direction === 'out' && t.fungible_info);
    if (inTransfers.length === 0 || outTransfers.length === 0) continue;

    const inT = inTransfers.reduce((best, t) => (Math.abs(t.value ?? 0) > Math.abs(best.value ?? 0) ? t : best));
    const outT = outTransfers.reduce((best, t) => (Math.abs(t.value ?? 0) > Math.abs(best.value ?? 0) ? t : best));

    const inStable = isStable(inT.fungible_info.symbol);
    const outStable = isStable(outT.fungible_info.symbol);

    if (inStable === outStable) continue;

    const volatileTransfer = inStable ? outT : inT;
    const stableTransfer = inStable ? inT : outT;
    const eventType: 'buy' | 'sell' = inStable ? 'sell' : 'buy';

    const tokenAmount = volatileTransfer.quantity.float;
    // Use the stable-side USD value as trade size — accurate even if the volatile
    // token has since crashed (its current `value` would be near zero).
    const stableValue = Math.abs(stableTransfer.value ?? 0);
    const usdValue = stableValue > 0 ? stableValue
      : Math.abs(volatileTransfer.value ?? tokenAmount * (volatileTransfer.price ?? 0));
    // Compute entry price from stable side for historical accuracy.
    const price = stableValue > 0 && tokenAmount > 0
      ? stableValue / tokenAmount
      : (volatileTransfer.price ?? 0);

    if (!price || price <= 0 || usdValue < 1) continue;

    events.push({
      id: tx.id,
      type: eventType,
      tokenSymbol: volatileTransfer.fungible_info.symbol,
      tokenName: volatileTransfer.fungible_info.name,
      tokenAddress: getTokenAddress(volatileTransfer, chain),
      tokenAmount,
      usdValue,
      price,
      timestamp: ts,
      blockNumber: block,
    });
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// PnL endpoint — per-token realized/unrealized PnL from Zerion
// ---------------------------------------------------------------------------

// Cache for PnL data (5 minute TTL, same as events)
const pnlCache = new Map<string, { records: Map<string, ZerionPnLRecord>; fetchedAt: number }>();

interface ZerionPnLResponse {
  data: {
    type: string;
    id: string;
    attributes: {
      total_gain: number;
      realized_gain: number;
      unrealized_gain: number;
      total_invested: number;
      breakdown?: {
        by_implementation?: Record<string, {
          total_gain: number;
          realized_gain: number;
          unrealized_gain: number;
          total_invested: number;
          average_buy_price: number;
          average_sell_price: number;
        }>;
      };
    };
  };
}

/**
 * Thrown when Zerion can't compute PnL for a wallet (>1M events).
 */
export class ZerionWhaleError extends Error {
  constructor() {
    super('Wallet has too many events for PnL computation');
    this.name = 'ZerionWhaleError';
  }
}

/**
 * Fetch per-token PnL for a wallet.
 * Returns a Map keyed by lowercase token address → ZerionPnLRecord.
 *
 * Requires tokenAddresses — uses filter[fungible_implementations] for reliable
 * per-token breakdown. The chain+since filter alone returns empty breakdowns
 * for some wallets.
 *
 * Throws ZerionWhaleError if the wallet has >1M events (Zerion limit).
 */
export async function fetchWalletPnL(
  address: string,
  chain: Chain,
  tokenAddresses: Set<string>,
): Promise<Map<string, ZerionPnLRecord>> {
  if (tokenAddresses.size === 0) return new Map();
  const cacheKey = `${normalizeAddress(address, chain)}:${chain}`;
  const cached = pnlCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < EVENT_CACHE_TTL_MS) {
    console.log(`[zerion-pnl] cache hit for ${address.slice(0, 8)}...`);
    return cached.records;
  }

  const auth = getAuthHeader();
  const chainId = CHAIN_MAP[chain];

  // Batch into chunks. Solana addresses are longer (~44 chars) than EVM (42),
  // and the filter goes in the URL — too many tokens = 400 from URL length limit.
  const allAddrs = [...tokenAddresses];
  const BATCH = chain === 'solana' ? 10 : 80;
  const chunks: string[][] = [];
  for (let i = 0; i < allAddrs.length; i += BATCH) {
    chunks.push(allAddrs.slice(i, i + BATCH));
  }

  console.log(`[zerion-pnl] fetching PnL for ${address.slice(0, 8)}... (${tokenAddresses.size} tokens, ${chunks.length} batch(es))`);

  const records = new Map<string, ZerionPnLRecord>();

  for (let c = 0; c < chunks.length; c++) {
    if (c > 0) await sleep(500);

    const implFilter = chunks[c].map((addr) => `${chainId}:${addr}`).join(',');
    const params = new URLSearchParams({
      currency: 'usd',
      'filter[fungible_implementations]': implFilter,
    });
    const url = `${ZERION_BASE_URL}/wallets/${address}/pnl/?${params}`;

    let res: Response;
    try {
      res = await fetchZerion(url, auth);
    } catch (err) {
      if (err instanceof ZerionRateLimitError) {
        console.warn(`[zerion-pnl] persistent 503 — wallet likely exceeds 1M event limit`);
        throw new ZerionWhaleError();
      }
      throw err;
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(`[zerion-pnl] batch ${c + 1} HTTP ${res.status}: ${errBody.slice(0, 300)}`);
      continue;
    }

    const body = (await res.json()) as ZerionPnLResponse;
    const byImpl = body.data?.attributes?.breakdown?.by_implementation;
    if (!byImpl) continue;

    for (const [implKey, data] of Object.entries(byImpl)) {
      const colonIdx = implKey.indexOf(':');
      if (colonIdx < 0) continue;

      const implChain = implKey.slice(0, colonIdx);
      const tokenAddr = implKey.slice(colonIdx + 1);

      if (!tokenAddr || tokenAddr.length < 10) continue;
      if (implChain !== chainId) continue;
      if (data.total_invested < 1) continue;
      if (!data.average_buy_price || data.average_buy_price <= 0) continue;

      records.set(normalizeAddress(tokenAddr, chain), {
        tokenAddress: tokenAddr,
        tokenSymbol: '',
        tokenName: '',
        chain,
        realizedGain: data.realized_gain,
        unrealizedGain: data.unrealized_gain,
        totalGain: data.total_gain,
        totalInvested: data.total_invested,
        averageBuyPrice: data.average_buy_price,
        averageSellPrice: data.average_sell_price,
      });
    }
  }

  console.log(`[zerion-pnl] ${records.size} token PnL records`);
  pnlCache.set(cacheKey, { records, fetchedAt: Date.now() });
  return records;
}
