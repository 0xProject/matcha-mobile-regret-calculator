// lib/analyze.ts
// Orchestrator: fetches Zerion PnL + events, groups by token, fetches candles, runs TP simulation.
// Server-only — used by the conference API route.

import type { Chain, TradeResult, ConferenceAnalysisResult, OHLCCandle, ZerionPnLRecord } from './types';
import { normalizeAddress } from './types';
import { fetchTradeEvents, fetchWalletPnL, type ZerionEvent } from './zerion';
import { fetchCandles } from './codex';
import { computePnL, findOptimalTpOnly, recalculateResultsTPOnly, aggregatePositiveDeltas, simulateAllTPOnly } from './simulation';

const CODEX_BATCH_SIZE = 5;         // 5 concurrent requests per batch
const CODEX_BATCH_DELAY_MS = 750;   // 750ms between batches
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TokenEventGroup {
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  buys: ZerionEvent[];
  sells: ZerionEvent[];
  firstBuyTime: number;
  lastExitTime: number;
}

/**
 * Group transaction events by token address.
 * Returns timing info needed for candle fetching.
 */
function groupEventsByToken(events: ZerionEvent[], chain: Chain): Map<string, TokenEventGroup> {
  const groups = new Map<string, TokenEventGroup>();

  for (const e of events) {
    const key = normalizeAddress(e.tokenAddress, chain);
    let group = groups.get(key);
    if (!group) {
      group = {
        tokenAddress: e.tokenAddress,
        tokenSymbol: e.tokenSymbol,
        tokenName: e.tokenName,
        buys: [],
        sells: [],
        firstBuyTime: Infinity,
        lastExitTime: 0,
      };
      groups.set(key, group);
    }

    if (e.type === 'buy') {
      group.buys.push(e);
      if (e.timestamp < group.firstBuyTime) group.firstBuyTime = e.timestamp;
    } else {
      group.sells.push(e);
      if (e.timestamp > group.lastExitTime) group.lastExitTime = e.timestamp;
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Conference pipeline
// ---------------------------------------------------------------------------

interface PositionToAnalyze {
  pnl: ZerionPnLRecord;
  firstBuyTime: number;
  lastExitTime: number;
  isOpen: boolean;
}

/**
 * Analyse a wallet for the conference leaderboard.
 *
 * Uses Zerion PnL endpoint for CORRECT actual PnL per token (handles DCA
 * in/out, partial sells, etc.), then simulates TP using daily candles.
 *
 * Unit of analysis: TOKEN POSITIONS (not individual buy-sell pairs).
 *
 * Pipeline:
 * 1. Fetch Zerion PnL + transaction events sequentially
 * 2. Group events by token → get timing (first buy, last sell)
 * 3. Fetch daily candles per token position
 * 4. Simulate TP at each token's average buy price
 * 5. Delta = simulated PnL − actual PnL (from Zerion)
 * 6. Hero number = sum of positive deltas
 */
export async function analyzeWalletConference(
  address: string,
  chain: Chain,
): Promise<ConferenceAnalysisResult> {
  // Step 1: Fetch events first to discover token addresses, then PnL with explicit filter.
  // Zerion's PnL breakdown requires filter[fungible_implementations] to be reliable —
  // chain+since alone returns empty breakdown for some wallets.
  const events = await fetchTradeEvents(address, chain);

  // Only include real contract addresses (not symbol fallbacks from getTokenAddress).
  // Solana addresses are 32-44 chars base58; EVM are 0x + 40 hex.
  // Only include real contract addresses (not symbol fallbacks from getTokenAddress).
  const tokenAddrs = new Set<string>();
  for (const e of events) {
    const addr = normalizeAddress(e.tokenAddress, chain);
    const isRealAddr = chain === 'solana' ? addr.length >= 32 : addr.startsWith('0x');
    if (isRealAddr) tokenAddrs.add(addr);
  }

  const pnlRecords = await fetchWalletPnL(address, chain, tokenAddrs);

  console.log(`[conference] PnL records: ${pnlRecords.size}, events: ${events.length}`);

  if (pnlRecords.size === 0 && events.length === 0) {
    return emptyResult(address, chain);
  }

  // Step 2: Group events by token for timing
  const eventGroups = groupEventsByToken(events, chain);
  const now = Math.floor(Date.now() / 1000);
  const positions: PositionToAnalyze[] = [];

  for (const [addr, cachedPnl] of pnlRecords) {
    const group = eventGroups.get(addr);

    // Skip tokens with no events at all (shouldn't happen — they came from pnlRecords
    // which was seeded from events — but guard defensively).
    if (!group || (group.buys.length === 0 && group.sells.length === 0)) {
      console.log(`[conference] skipping ${cachedPnl.tokenSymbol || addr.slice(0, 10)} — no events at all`);
      continue;
    }

    // Sanity check: cross-reference Zerion's total_invested against actual buy
    // event USD volume. Zerion can report wildly inflated values for illiquid
    // tokens (e.g. $259k invested for a $2 buy). Skip if ratio > 1000x.
    // Only run this check when buy events ARE visible — when buys are beyond our
    // 500-event pagination window, eventBuyUSD is 0 and the check is irrelevant.
    const eventBuyUSD = group.buys.reduce((sum, b) => sum + b.usdValue, 0);
    if (eventBuyUSD > 0 && cachedPnl.totalInvested > eventBuyUSD * 500) {
      console.log(`[conference] skipping ${cachedPnl.tokenSymbol || addr.slice(0, 10)} — Zerion invested $${cachedPnl.totalInvested.toFixed(0)} vs event buys $${eventBuyUSD.toFixed(0)} (${(cachedPnl.totalInvested / eventBuyUSD).toFixed(0)}x mismatch)`);
      continue;
    }

    // Churn filter: skip high-frequency round-trip traders.
    // Zerion's total_invested is cumulative buy volume — it compounds with
    // every buy cycle. A trader who flips a token 50× ends up with
    // total_invested >> peak_holdings, making the TP simulation report
    // fantasy-level "money left on table" ($11M for a $145K position).
    // We detect this by checking whether the net gain is essentially zero
    // relative to the stated investment: if abs(totalGain) / totalInvested < 0.5%
    // on a position > $10K, the trader is round-tripping and the inflated
    // totalInvested would corrupt the hero number. Skip entirely.
    const netGainRatio = Math.abs(cachedPnl.totalGain) / Math.max(cachedPnl.totalInvested, 1);
    if (netGainRatio < 0.005 && cachedPnl.totalInvested > 10_000) {
      console.log(`[conference] skipping ${cachedPnl.tokenSymbol || addr.slice(0, 10)} — round-trip churn (gain ${(netGainRatio * 100).toFixed(3)}% on $${cachedPnl.totalInvested.toFixed(0)} invested)`);
      continue;
    }

    // Copy before enriching — don't mutate the cached PnL records
    const pnl = {
      ...cachedPnl,
      tokenSymbol: group.tokenSymbol,
      tokenName: group.tokenName,
      tokenAddress: group.tokenAddress,
    };

    const isOpen = Math.abs(pnl.unrealizedGain) > 0.01;
    const lastExit = group.lastExitTime > 0 ? group.lastExitTime : now;

    // When buy events are visible, use the actual first buy timestamp.
    // When all visible events are sells (buys are beyond our 500-event pagination
    // window — e.g. a wallet that sold 700 positions before we see any buy),
    // fall back to the earliest visible sell minus 90 days so we still fetch a
    // meaningful candle window and run the TP simulation.
    let firstBuyTime: number;
    if (group.buys.length > 0) {
      firstBuyTime = group.firstBuyTime;
    } else {
      const firstSellTime = Math.min(...group.sells.map((s) => s.timestamp));
      firstBuyTime = Math.max(firstSellTime - 90 * 86400, now - 365 * 86400);
      console.log(`[conference] ${cachedPnl.tokenSymbol || addr.slice(0, 10)} — no buy events in window, using sell-based timing fallback`);
    }

    positions.push({
      pnl,
      firstBuyTime,
      lastExitTime: isOpen ? now : lastExit,
      isOpen,
    });
  }

  console.log(`[conference] ${positions.length} token positions to analyze`);

  if (positions.length === 0) {
    return emptyResult(address, chain);
  }

  // Step 3: Fetch daily candles per token position
  const candleResults: OHLCCandle[][] = [];
  for (let i = 0; i < positions.length; i += CODEX_BATCH_SIZE) {
    if (i > 0) await sleep(CODEX_BATCH_DELAY_MS);
    const batch = positions.slice(i, i + CODEX_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((pos) =>
        fetchCandles(pos.pnl.tokenAddress, chain, pos.firstBuyTime, pos.lastExitTime, '1D'),
      ),
    );
    candleResults.push(...batchResults);
  }

  // Step 4: Build TradeResult array (one per token position)
  const trades: TradeResult[] = [];
  let skippedCount = 0;

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const candles = candleResults[i];
    const hasCandles = candles.length > 0;
    if (!hasCandles) skippedCount++;

    const actualPnL = pos.pnl.totalGain;

    // Set exitPrice so that computePnL(entryPrice, exitPrice, amountUSD) = actualPnL.
    // This bridges Zerion's PnL with the simulation's price-based math.
    // Cap the ratio to prevent blowups on dust positions (e.g. $0.50 invested, $500 airdrop gain).
    const MAX_PRICE_RATIO = 100;
    const ratio = pos.pnl.totalInvested === 0
      ? 0
      : Math.max(-1, Math.min(MAX_PRICE_RATIO, actualPnL / pos.pnl.totalInvested));
    const exitPrice = pos.pnl.averageBuyPrice * (1 + ratio);

    trades.push({
      id: pos.pnl.tokenAddress,
      tokenSymbol: pos.pnl.tokenSymbol || pos.pnl.tokenAddress.slice(0, 10),
      tokenName: pos.pnl.tokenName || '',
      tokenAddress: pos.pnl.tokenAddress,
      entryPrice: pos.pnl.averageBuyPrice,
      exitPrice,
      entryTime: pos.firstBuyTime,
      exitTime: pos.lastExitTime,
      amountUSD: pos.pnl.totalInvested,
      actualPnL,
      simulatedPnL: actualPnL,
      delta: 0,
      triggerType: hasCandles ? 'natural' : 'skipped',
      candles,
      isOpen: pos.isOpen,
    });
  }

  // Step 5: Find optimal TP and simulate
  const optimal = findOptimalTpOnly(trades);
  const tpTrades = recalculateResultsTPOnly(trades, optimal.tpPercent);

  // Step 6: Aggregate
  const realPnL = tpTrades.reduce((sum, t) => t.triggerType === 'skipped' ? sum : sum + t.actualPnL, 0);
  const tpPnL = tpTrades.reduce((sum, t) => t.triggerType === 'skipped' ? sum : sum + t.simulatedPnL, 0);
  const moneyLeftOnTable = Math.max(0, aggregatePositiveDeltas(tpTrades));

  const topTrades = tpTrades
    .filter((t) => t.delta > 0 && t.triggerType === 'take_profit')
    .slice(0, 5);

  // Moonshots: positions where the user beat a 3x Take Profit.
  // Counted at a fixed 200% (3x) reference level — independent of the optimal TP.
  // This means "trades where you rode past 3x and still sold well."
  const MOONSHOT_REFERENCE_TP = 200; // 3x
  const moonshotTrades = simulateAllTPOnly(trades, MOONSHOT_REFERENCE_TP);
  const moonshots = moonshotTrades.filter(
    (t) => t.triggerType === 'take_profit' && t.delta < 0,
  ).length;

  return {
    walletAddress: address,
    chain,
    totalTrades: positions.length,
    analyzedTrades: positions.length - skippedCount,
    realPnL,
    tpPnL,
    moneyLeftOnTable,
    optimalTp: optimal.tpPercent,
    topTrades,
    moonshots,
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}

function emptyResult(address: string, chain: Chain): ConferenceAnalysisResult {
  return {
    walletAddress: address,
    chain,
    totalTrades: 0,
    analyzedTrades: 0,
    realPnL: 0,
    tpPnL: 0,
    moneyLeftOnTable: 0,
    optimalTp: 150,
    topTrades: [],
    moonshots: 0,
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}
