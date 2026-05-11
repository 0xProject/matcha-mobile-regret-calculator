// lib/ens.ts
// Server-only ENS resolution via viem + Cloudflare Ethereum Gateway.
// No API key required. Caches successful results for 5 minutes.
// NEVER import this file from components/ or non-API app/ — see eslint.config.mjs.
//
// Uses the classic ENS Registry → resolver → addr() approach (not the Universal
// Resolver) so it works on any JSON-RPC provider without CCIP-Read support.
// Covers virtually all regular user-owned .eth names.

import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize, namehash } from 'viem/ens';

// ---------------------------------------------------------------------------
// Public client — mainnet only (ENS registry lives on L1, not Base)
// ---------------------------------------------------------------------------

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http('https://ethereum.publicnode.com'),
});

// ---------------------------------------------------------------------------
// ENS contract ABIs (minimal — only the functions we need)
// ---------------------------------------------------------------------------

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const;

const ensRegistryAbi = [
  {
    inputs: [{ name: 'node', type: 'bytes32' }],
    name: 'resolver',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const resolverAbi = [
  {
    inputs: [{ name: 'node', type: 'bytes32' }],
    name: 'addr',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ---------------------------------------------------------------------------
// In-memory cache (same TTL convention as lib/cache.ts)
// ---------------------------------------------------------------------------

const ENS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface EnsCacheEntry {
  address: string;   // checksummed 0x address
  resolvedAt: number;
}

const ensCache = new Map<string, EnsCacheEntry>();

function getCachedEns(name: string): string | undefined {
  const entry = ensCache.get(name);
  if (!entry) return undefined;
  if (Date.now() - entry.resolvedAt > ENS_CACHE_TTL_MS) {
    ensCache.delete(name);
    return undefined;
  }
  return entry.address;
}

// Note: null (not-found) results are NOT cached — a recently registered name
// that wasn't found yet should be retried without waiting for a TTL expiry.

// ---------------------------------------------------------------------------
// Detection helper (pure, no I/O — safe to inline in client code too)
// ---------------------------------------------------------------------------

/**
 * Returns true if the string looks like an ENS name (.eth suffix, non-empty label).
 * Intentionally narrow: only .eth — not .cb.id, .lens, etc.
 */
export function looksLikeEns(input: string): boolean {
  const lower = input.trim().toLowerCase();
  return lower.endsWith('.eth') && lower.length > 4; // at least "a.eth"
}

// ---------------------------------------------------------------------------
// Resolution — classic ENS Registry approach (no CCIP-Read required)
// ---------------------------------------------------------------------------

const RESOLVE_TIMEOUT_MS = 10_000;

/**
 * Resolve an ENS name to a checksummed 0x address.
 *
 * Uses ENS Registry → resolver → addr(namehash) directly — no Universal
 * Resolver, no CCIP-Read. Works on any standard JSON-RPC provider and handles
 * virtually all regular user-owned .eth names.
 *
 * Returns null if:
 *   - name has no resolver set
 *   - resolver has no address record
 *   - resolution times out (>10s)
 *   - any network or RPC error
 * Never throws — all errors are caught and returned as null.
 */
export async function resolveEns(name: string): Promise<string | null> {
  const normalized = name.trim().toLowerCase();

  const cached = getCachedEns(normalized);
  if (cached !== undefined) return cached;

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const node = namehash(normalize(normalized));

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('ENS resolution timeout')),
        RESOLVE_TIMEOUT_MS,
      );
    });

    // Step 1: Get resolver from ENS Registry
    const resolverAddress = await Promise.race([
      publicClient.readContract({
        address: ENS_REGISTRY,
        abi: ensRegistryAbi,
        functionName: 'resolver',
        args: [node],
      }),
      timeoutPromise,
    ]);

    if (!resolverAddress || resolverAddress === ZERO_ADDRESS) {
      clearTimeout(timer);
      return null; // name not registered or no resolver
    }

    // Step 2: Call addr(namehash) on the resolver
    const address = await Promise.race([
      publicClient.readContract({
        address: resolverAddress,
        abi: resolverAbi,
        functionName: 'addr',
        args: [node],
      }),
      timeoutPromise,
    ]);

    clearTimeout(timer);

    if (!address || address === ZERO_ADDRESS) return null;

    ensCache.set(normalized, { address, resolvedAt: Date.now() });
    return address;
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ens] resolveEns("${normalized}") failed: ${msg}`);
    return null;
  }
}

/** Exposed for testing only */
export function clearEnsCache(): void {
  ensCache.clear();
}
