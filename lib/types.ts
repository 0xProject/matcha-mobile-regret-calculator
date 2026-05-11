// lib/types.ts
// Shared TypeScript interfaces — zero project-internal imports.
// All domains import from here. Nothing else imports from this file.

export type Chain = 'base' | 'solana';

/**
 * Normalize a token/wallet address for comparison and map keys.
 * EVM (hex) → lowercase. Solana (base58) → preserve case (case-sensitive).
 */
export function normalizeAddress(addr: string, chain: Chain): string {
  return chain === 'solana' ? addr : addr.toLowerCase();
}

export type TriggerType = 'stop_loss' | 'take_profit' | 'natural' | 'skipped';

export interface OHLCCandle {
  timestamp: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SimulationOutput {
  exitPrice: number;
  triggerType: Exclude<TriggerType, 'skipped'>;
}

export interface TradeResult {
  id: string;
  tokenSymbol: string;
  tokenName: string;
  tokenAddress: string;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  amountUSD: number;
  actualPnL: number;
  simulatedPnL: number;
  delta: number; // simulatedPnL - actualPnL
  triggerType: TriggerType;
  candles: OHLCCandle[]; // stored for client-side slider recalculation
  isOpen?: boolean;      // true for positions not yet closed (unrealized P&L)
}

export interface AnalyzeRequest {
  walletAddress: string;
  chain: Chain;
  displayName: string;
  socialTg?: string;
  socialX?: string;
  socialEmail?: string;
}

export interface AnalyzeErrorResponse {
  error: string;
  code: 'INVALID_ADDRESS' | 'NO_TRADES' | 'API_ERROR' | 'MISSING_API_KEY' | 'RATE_LIMITED' | 'NAME_TAKEN';
}

// ---------------------------------------------------------------------------
// Conference mode types (TP-only simulation, leaderboard)
// ---------------------------------------------------------------------------

export interface TPOnlySimulationInput {
  candles: OHLCCandle[];
  entryPrice: number;
  actualExitPrice: number;
  tpPercent: number;
}

export interface ConferenceAnalysisResult {
  walletAddress: string;
  chain: Chain;
  totalTrades: number;
  analyzedTrades: number;
  realPnL: number;           // sum of actual PnL across all trades
  tpPnL: number;             // sum of simulated PnL with optimal TP (SL disabled)
  moneyLeftOnTable: number;  // sum of POSITIVE deltas only (hero number, always >= 0)
  optimalTp: number;         // the TP% that maximised positive deltas
  topTrades: TradeResult[];  // top 5 trades by positive delta (upside stories only)
  moonshots: number;         // count of positions where user outperformed TP (negative delta = they nailed the exit)
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// Zerion PnL types (per-token position from /wallets/{address}/pnl/)
// ---------------------------------------------------------------------------

export interface ZerionPnLRecord {
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  chain: Chain;
  realizedGain: number;
  unrealizedGain: number;
  totalGain: number;       // realized + unrealized
  totalInvested: number;
  averageBuyPrice: number;
  averageSellPrice: number;
}

export interface LeaderboardEntry {
  id: string;
  walletAddress: string;
  chain: Chain;
  realPnL: number;
  tpPnL: number;
  moneyLeftOnTable: number;
  optimalTp: number;
  analyzedTrades: number;
  totalTrades: number;
  displayName: string;
  socialTg?: string;
  socialX?: string;
  socialEmail?: string;
  analyzedAt: number;        // unix timestamp
}

export type LeaderboardSort = 'moneyLeftOnTable' | 'realPnL' | 'tpPnL';

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  updatedAt: number;
}
