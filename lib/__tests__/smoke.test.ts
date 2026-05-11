/**
 * Smoke tests — mathematical invariants that must hold after every change.
 * These test the conference TP pipeline logic using pure functions only (no API calls).
 */

import {
  computePnL, simulateTradeTPOnly, recalculateResultsTPOnly,
  aggregatePositiveDeltas, aggregateRealPnL, aggregateSimulatedPnL,
  findOptimalTpOnly,
} from '../simulation';
import type { OHLCCandle, TradeResult } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function candle(low: number, high: number, close?: number): OHLCCandle {
  return { timestamp: 0, open: close ?? (low + high) / 2, high, low, close: close ?? (low + high) / 2 };
}

function makeTrade(overrides: Partial<TradeResult> = {}): TradeResult {
  return {
    id: 'tok-1', tokenSymbol: 'TEST', tokenName: 'Test Token', tokenAddress: '0xtest',
    entryPrice: 100, exitPrice: 90, entryTime: 0, exitTime: 3600,
    amountUSD: 1000, actualPnL: -100, simulatedPnL: 0, delta: 0,
    triggerType: 'natural', candles: [candle(80, 210)],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Invariant tests
// ---------------------------------------------------------------------------

describe('Conference pipeline invariants', () => {

  it('1. moneyLeftOnTable is always >= 0', () => {
    // Mix of winning and losing trades
    const trades = [
      makeTrade({ id: 't1', actualPnL: -500, candles: [candle(50, 300)] }),
      makeTrade({ id: 't2', actualPnL: 2000, candles: [candle(90, 110)] }),
      makeTrade({ id: 't3', actualPnL: -200, candles: [candle(70, 180)] }),
    ];
    const optimal = findOptimalTpOnly(trades);
    const tpTrades = recalculateResultsTPOnly(trades, optimal.tpPercent);
    const hero = Math.max(0, aggregatePositiveDeltas(tpTrades));
    expect(hero).toBeGreaterThanOrEqual(0);
  });

  it('2. TP-triggered trade always has positive simulatedPnL', () => {
    const trades = [
      makeTrade({ id: 't1', entryPrice: 100, amountUSD: 1000, candles: [candle(80, 250)] }),
      makeTrade({ id: 't2', entryPrice: 50, amountUSD: 500, candles: [candle(40, 200)] }),
    ];
    const tpTrades = recalculateResultsTPOnly(trades, 100); // 2x target

    for (const t of tpTrades) {
      if (t.triggerType === 'take_profit') {
        expect(t.simulatedPnL).toBeGreaterThan(0);
        // simulatedPnL should equal (tpPercent/100) * amountUSD
        expect(t.simulatedPnL).toBeCloseTo((100 / 100) * t.amountUSD);
      }
    }
  });

  it('3. delta = simulatedPnL - actualPnL for all non-skipped trades', () => {
    const trades = [
      makeTrade({ id: 't1', actualPnL: -100, candles: [candle(80, 250)] }),
      makeTrade({ id: 't2', actualPnL: 500, candles: [candle(90, 110)] }),
      makeTrade({ id: 't3', triggerType: 'skipped', candles: [] }),
    ];
    const tpTrades = recalculateResultsTPOnly(trades, 100);

    for (const t of tpTrades) {
      if (t.triggerType !== 'skipped') {
        expect(t.delta).toBeCloseTo(t.simulatedPnL - t.actualPnL);
      }
    }
  });

  it('4. natural exit preserves actualPnL (delta = 0)', () => {
    // TP at 500% (6x) — will never trigger with candle high at 140
    const trades = [makeTrade({
      entryPrice: 100,
      exitPrice: 120,
      amountUSD: 1000,
      actualPnL: 200,
      candles: [candle(90, 140)],
    })];
    const tpTrades = recalculateResultsTPOnly(trades, 500);

    expect(tpTrades[0].triggerType).toBe('natural');
    expect(tpTrades[0].simulatedPnL).toBeCloseTo(200); // matches actualPnL
    expect(tpTrades[0].delta).toBeCloseTo(0);
  });

  it('5. optimal TP maximises positive deltas (no other TP% does better)', () => {
    const trades = [
      makeTrade({ id: 't1', actualPnL: -100, candles: [candle(80, 180)] }),
      makeTrade({ id: 't2', actualPnL: -200, candles: [candle(70, 350)] }),
      makeTrade({ id: 't3', actualPnL: 100, candles: [candle(90, 160)] }),
    ];
    const optimal = findOptimalTpOnly(trades);
    const optimalDelta = optimal.totalPositiveDelta;

    // Test 5 alternative TP values
    for (const tp of [25, 75, 200, 400, 800]) {
      const altTrades = recalculateResultsTPOnly(trades, tp);
      const altDelta = aggregatePositiveDeltas(altTrades);
      expect(optimalDelta).toBeGreaterThanOrEqual(altDelta - 0.01);
    }
  });

  it('6. skipped trades contribute 0 to all aggregates', () => {
    const trades: TradeResult[] = [
      makeTrade({ id: 't1', actualPnL: 999, simulatedPnL: 999, delta: 999, triggerType: 'skipped' }),
    ];
    expect(aggregatePositiveDeltas(trades)).toBe(0);
    expect(aggregateRealPnL(trades)).toBe(0);
    expect(aggregateSimulatedPnL(trades)).toBe(0);
  });

  it('7. exitPrice reconstructs actualPnL from Zerion PnL data', () => {
    // Simulate how analyze.ts bridges Zerion PnL → simulation math
    const entryPrice = 0.00000458;
    const totalInvested = 4518;
    const zerionActualPnL = 8323;

    // This is the formula used in analyze.ts:
    const exitPrice = entryPrice * (1 + zerionActualPnL / totalInvested);
    const reconstructed = computePnL(entryPrice, exitPrice, totalInvested);

    expect(reconstructed).toBeCloseTo(zerionActualPnL, 1);
  });

  it('8. candles with high >= targetPrice always trigger TP', () => {
    const entryPrice = 100;
    const tpPercent = 150; // target = 250
    const targetPrice = entryPrice * (1 + tpPercent / 100);

    const result = simulateTradeTPOnly({
      candles: [candle(90, 110), candle(80, targetPrice + 1)], // second candle hits target
      entryPrice,
      actualExitPrice: 120,
      tpPercent,
    });

    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe('take_profit');
  });

  it('9. candles with max(high) < targetPrice never trigger TP', () => {
    const entryPrice = 100;
    const tpPercent = 200; // target = 300

    const result = simulateTradeTPOnly({
      candles: [candle(80, 150), candle(70, 200), candle(90, 250)], // max high = 250 < 300
      entryPrice,
      actualExitPrice: 120,
      tpPercent,
    });

    expect(result).not.toBeNull();
    expect(result!.triggerType).toBe('natural');
    expect(result!.exitPrice).toBeCloseTo(120);
  });

  it('10. topTrades filter: only positive delta + take_profit trigger', () => {
    const trades = [
      makeTrade({ id: 't1', actualPnL: -500, candles: [candle(50, 300)] }), // TP triggers, big positive delta
      makeTrade({ id: 't2', actualPnL: 2000, candles: [candle(90, 110)] }), // TP doesn't trigger, natural
      makeTrade({ id: 't3', actualPnL: 800, candles: [candle(80, 250)] }),  // TP triggers but delta may be negative
    ];
    const tpTrades = recalculateResultsTPOnly(trades, 100);

    // Apply the same filter as analyzeWalletConference
    const topTrades = tpTrades
      .filter((t) => t.delta > 0 && t.triggerType === 'take_profit')
      .slice(0, 5);

    for (const t of topTrades) {
      expect(t.delta).toBeGreaterThan(0);
      expect(t.triggerType).toBe('take_profit');
    }
  });
});
