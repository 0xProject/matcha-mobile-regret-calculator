import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Chain, LeaderboardEntry, LeaderboardSort, LeaderboardResponse } from './types';

// ---------------------------------------------------------------------------
// Supabase singleton
// ---------------------------------------------------------------------------

let client: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  // Prefer the service-role key on the server so writes bypass RLS.
  // Falls back to anon (read-only under RLS) for local dev without service role configured.
  // NEVER expose SUPABASE_SERVICE_ROLE_KEY to the client — it bypasses all RLS policies.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY environment variables');
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

// ---------------------------------------------------------------------------
// Column mapping helpers
// ---------------------------------------------------------------------------

const SORT_COLUMN: Record<LeaderboardSort, string> = {
  moneyLeftOnTable: 'money_left_on_table',
  realPnL: 'real_pnl',
  tpPnL: 'tp_pnl',
};

function toRow(entry: LeaderboardEntry) {
  return {
    wallet_address: entry.walletAddress,
    chain: entry.chain,
    real_pnl: entry.realPnL,
    tp_pnl: entry.tpPnL,
    money_left_on_table: entry.moneyLeftOnTable,
    optimal_tp: entry.optimalTp,
    analyzed_trades: entry.analyzedTrades,
    total_trades: entry.totalTrades,
    display_name: entry.displayName,
    social_tg: entry.socialTg ?? null,
    social_x: entry.socialX ?? null,
    social_email: entry.socialEmail ?? null,
    analyzed_at: new Date(entry.analyzedAt * 1000).toISOString(),
  };
}

function fromRow(row: Record<string, unknown>): LeaderboardEntry {
  return {
    id: row.id as string,
    walletAddress: row.wallet_address as string,
    chain: row.chain as Chain,
    realPnL: Number(row.real_pnl),
    tpPnL: Number(row.tp_pnl),
    moneyLeftOnTable: Number(row.money_left_on_table),
    optimalTp: Number(row.optimal_tp),
    analyzedTrades: Number(row.analyzed_trades),
    totalTrades: Number(row.total_trades),
    displayName: row.display_name as string,
    socialTg: (row.social_tg as string) ?? undefined,
    socialX: (row.social_x as string) ?? undefined,
    socialEmail: (row.social_email as string) ?? undefined,
    analyzedAt: Math.floor(new Date(row.analyzed_at as string).getTime() / 1000),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const TABLE = 'leaderboard_entries';

/**
 * Check if a display name is available (globally unique across all chains).
 * Allows the same wallet to re-use their own name on re-analysis.
 */
export async function isDisplayNameAvailable(
  name: string,
  currentWallet?: string,
): Promise<boolean> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from(TABLE)
    .select('wallet_address', { count: 'exact', head: true })
    .ilike('display_name', name);

  if (currentWallet) {
    query = query.neq('wallet_address', currentWallet);
  }

  const { count, error } = await query;

  if (error) {
    console.warn(`isDisplayNameAvailable failed: ${error.message}`);
    return true; // fail open
  }

  return (count ?? 0) === 0;
}

/**
 * Check if a wallet is already claimed by a different display name.
 * Returns the existing display name if claimed, or null if available.
 */
export async function getWalletOwner(
  walletAddress: string,
  chain: string,
): Promise<string | null> {
  const supabase = getSupabaseClient();

  // EVM addresses are case-insensitive — use ilike for case-insensitive match
  const { data, error } = await supabase
    .from(TABLE)
    .select('display_name')
    .ilike('wallet_address', walletAddress)
    .eq('chain', chain)
    .maybeSingle();

  if (error) {
    console.warn(`getWalletOwner failed: ${error.message}`);
    return null; // fail open
  }

  return data?.display_name ?? null;
}

/**
 * Upsert a leaderboard entry.
 * ON CONFLICT (wallet_address, chain) updates all fields.
 */
export async function submitEntry(entry: LeaderboardEntry): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from(TABLE)
    .upsert(toRow(entry), { onConflict: 'wallet_address,chain' });

  if (error) {
    throw new Error(`submitEntry failed: ${error.message}`);
  }
}

/**
 * Fetch a paginated leaderboard sorted by the chosen metric (DESC).
 * When mlotOnly=true only returns entries with money_left_on_table > 0
 * (used for the MLOT tab so MLOT=0 wallets don't pollute it).
 */
export async function getLeaderboard(
  sort: LeaderboardSort,
  limit = 50,
  offset = 0,
  mlotOnly = false,
): Promise<LeaderboardResponse> {
  const supabase = getSupabaseClient();
  const column = SORT_COLUMN[sort];

  let query = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .order(column, { ascending: false })
    .range(offset, offset + limit - 1);

  if (mlotOnly) {
    query = query.gt('money_left_on_table', 0.01);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`getLeaderboard failed: ${error.message}`);
  }

  return {
    entries: (data ?? []).map(fromRow),
    total: count ?? 0,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Compute rank from a value directly — single DB query, no extra roundtrip.
 * Rank = (entries with strictly higher moneyLeftOnTable) + 1.
 */
export async function getRankByValue(moneyLeftOnTable: number): Promise<number> {
  const supabase = getSupabaseClient();

  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .gt('money_left_on_table', moneyLeftOnTable);

  if (error) {
    throw new Error(`getRankByValue failed: ${error.message}`);
  }

  return (count ?? 0) + 1;
}

/**
 * Compute rank by real P&L — for wallets that have realPnL but MLOT=0.
 * Rank = (entries with strictly higher real_pnl) + 1.
 */
export async function getRankByPnL(realPnL: number): Promise<number> {
  const supabase = getSupabaseClient();

  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .gt('real_pnl', realPnL);

  if (error) {
    throw new Error(`getRankByPnL failed: ${error.message}`);
  }

  return (count ?? 0) + 1;
}
