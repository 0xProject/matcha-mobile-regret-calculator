// lib/simulation.ts
// Pure simulation functions — no I/O, no side effects, no framework imports.
// Runs in both Node.js (API route) and the browser.
// Only imports from lib/types.ts.

import type {
  TPOnlySimulationInput,
  SimulationOutput,
  TradeResult,
  TriggerType,
} from './types';

/**
 * Compute P&L in USD for a position.
 * Positive = profit, Negative = loss.
 */
export function computePnL(
  entryPrice: number,
  exitPrice: number,
  amountUSD: number,
): number {
  if (entryPrice === 0) return 0;
  return ((exitPrice / entryPrice) - 1) * amountUSD;
}

// ---------------------------------------------------------------------------
// TP-only simulation (conference mode — SL disabled)
// ---------------------------------------------------------------------------

/**
 * Simulate take profit only — stop loss is completely ignored.
 * Walks candles from entry to exit checking only TP triggers.
 * Used in the conference growth-hack tool to isolate the TP narrative.
 *
 * Returns null if no candles are available — caller marks trade as skipped.
 */
export function simulateTradeTPOnly(input: TPOnlySimulationInput): SimulationOutput | null {
  const { candles, entryPrice, actualExitPrice, tpPercent } = input;

  if (candles.length === 0) return null;

  const targetPrice = entryPrice * (1 + tpPercent / 100);

  for (const candle of candles) {
    if (candle.high >= targetPrice) {
      return { exitPrice: targetPrice, triggerType: 'take_profit' };
    }
  }

  return { exitPrice: actualExitPrice, triggerType: 'natural' };
}

/**
 * Simulate TP on all trades. Returns unsorted results (lean, used by grid search).
 */
export function simulateAllTPOnly(
  trades: TradeResult[],
  tpPercent: number,
): TradeResult[] {
  return trades.map((trade) => {
    if (trade.triggerType === 'skipped') return trade;

    const simulation = simulateTradeTPOnly({
      candles: trade.candles,
      entryPrice: trade.entryPrice,
      actualExitPrice: trade.exitPrice,
      tpPercent,
    });

    if (!simulation) {
      return { ...trade, triggerType: 'skipped' as TriggerType };
    }

    const simulatedPnL = computePnL(trade.entryPrice, simulation.exitPrice, trade.amountUSD);
    const delta = simulatedPnL - trade.actualPnL;

    return { ...trade, simulatedPnL, delta, triggerType: simulation.triggerType };
  });
}

/**
 * Recalculate all trade results using TP-only simulation (SL disabled).
 * Sorts by delta descending (biggest upside first).
 */
export function recalculateResultsTPOnly(
  trades: TradeResult[],
  tpPercent: number,
): TradeResult[] {
  return simulateAllTPOnly(trades, tpPercent).sort((a, b) => b.delta - a.delta);
}

/**
 * Sum only positive deltas — trades where TP would have captured more profit.
 * Negative deltas (TP sold too early) are excluded.
 * This is the conference hero number: "money left on the table".
 */
export function aggregatePositiveDeltas(trades: TradeResult[]): number {
  return trades.reduce((sum, t) => {
    if (t.triggerType === 'skipped') return sum;
    return sum + Math.max(0, t.delta);
  }, 0);
}

/**
 * Sum actual P&L across all non-skipped trades.
 */
export function aggregateRealPnL(trades: TradeResult[]): number {
  return trades.reduce((sum, t) => {
    if (t.triggerType === 'skipped') return sum;
    return sum + t.actualPnL;
  }, 0);
}

/**
 * Sum simulated P&L across all non-skipped trades.
 */
export function aggregateSimulatedPnL(trades: TradeResult[]): number {
  return trades.reduce((sum, t) => {
    if (t.triggerType === 'skipped') return sum;
    return sum + t.simulatedPnL;
  }, 0);
}

/**
 * Grid-search TP values to find the percentage that maximises the sum of
 * positive deltas (money left on the table) with SL completely disabled.
 *
 * TP: 50–950% step 100 (10 values)
 */
export function findOptimalTpOnly(trades: TradeResult[]): {
  tpPercent: number;
  totalPositiveDelta: number;
} {
  const TP_STEPS = [50, 150, 250, 350, 450, 550, 650, 750, 850, 950];

  let best = { tpPercent: 150, totalPositiveDelta: -Infinity };

  for (const tp of TP_STEPS) {
    const updated = simulateAllTPOnly(trades, tp); // unsorted — no need to sort during search
    const positiveDelta = aggregatePositiveDeltas(updated);
    if (positiveDelta > best.totalPositiveDelta) {
      best = { tpPercent: tp, totalPositiveDelta: positiveDelta };
    }
  }

  return best;
}
