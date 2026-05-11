import {
  computePnL,
  simulateTradeTPOnly, recalculateResultsTPOnly, aggregatePositiveDeltas,
  aggregateRealPnL, aggregateSimulatedPnL, findOptimalTpOnly,
} from '../simulation';
import { normalizeAddress } from '../types';
import type { OHLCCandle, TradeResult } from '../types';

// Helper to build a simple candle
function candle(low: number, high: number, close: number = (low + high) / 2): OHLCCandle {
  return { timestamp: 0, open: close, high, low, close };
}

describe('computePnL', () => {
  it('computes profit correctly', () => {
    expect(computePnL(100, 150, 1000)).toBeCloseTo(500);
  });

  it('computes loss correctly', () => {
    expect(computePnL(100, 85, 1000)).toBeCloseTo(-150);
  });

  it('returns 0 when entry price is 0 (guard)', () => {
    expect(computePnL(0, 100, 1000)).toBe(0);
  });

  it('returns 0 for flat P&L', () => {
    expect(computePnL(100, 100, 1000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Conference mode: TP-only simulation
// ---------------------------------------------------------------------------

describe('simulateTradeTPOnly', () => {
  it('returns null when candles array is empty', () => {
    expect(simulateTradeTPOnly({
      candles: [],
      entryPrice: 100,
      actualExitPrice: 90,
      tpPercent: 100,
    })).toBeNull();
  });

  it('triggers take profit when price hits target', () => {
    const result = simulateTradeTPOnly({
      candles: [candle(90, 210)],
      entryPrice: 100,
      actualExitPrice: 150,
      tpPercent: 100,
    });
    expect(result!.triggerType).toBe('take_profit');
    expect(result!.exitPrice).toBeCloseTo(200);
  });

  it('ignores stop loss even when price drops below SL threshold', () => {
    const result = simulateTradeTPOnly({
      candles: [candle(50, 95)],
      entryPrice: 100,
      actualExitPrice: 60,
      tpPercent: 100,
    });
    expect(result!.triggerType).toBe('natural');
    expect(result!.exitPrice).toBeCloseTo(60);
  });

  it('TP triggers even when SL would have triggered first in normal mode', () => {
    const result = simulateTradeTPOnly({
      candles: [candle(80, 210)],
      entryPrice: 100,
      actualExitPrice: 150,
      tpPercent: 100,
    });
    expect(result!.triggerType).toBe('take_profit');
    expect(result!.exitPrice).toBeCloseTo(200);
  });

  it('uses natural exit when TP never triggers', () => {
    const result = simulateTradeTPOnly({
      candles: [candle(90, 130), candle(85, 140)],
      entryPrice: 100,
      actualExitPrice: 120,
      tpPercent: 100,
    });
    expect(result!.triggerType).toBe('natural');
    expect(result!.exitPrice).toBeCloseTo(120);
  });
});

describe('recalculateResultsTPOnly', () => {
  const makeTrade = (overrides: Partial<TradeResult> = {}): TradeResult => ({
    id: 'trade-1',
    tokenSymbol: 'ETH',
    tokenName: 'Ethereum',
    tokenAddress: '0xeth',
    entryPrice: 100,
    exitPrice: 90,
    entryTime: 0,
    exitTime: 3600,
    amountUSD: 1000,
    actualPnL: -100,
    simulatedPnL: 0,
    delta: 0,
    triggerType: 'natural',
    candles: [candle(80, 210)],
    ...overrides,
  });

  it('uses TP-only simulation (no SL triggers)', () => {
    const trades = [makeTrade()];
    const result = recalculateResultsTPOnly(trades, 100);
    expect(result[0].triggerType).toBe('take_profit');
    expect(result[0].simulatedPnL).toBeCloseTo(1000);
  });

  it('sorts by delta descending (biggest wins first)', () => {
    const t1 = makeTrade({ id: 't1', actualPnL: -100, candles: [candle(80, 210)] });
    const t2 = makeTrade({ id: 't2', actualPnL: 500, candles: [candle(90, 110)] });
    const result = recalculateResultsTPOnly([t1, t2], 100);
    expect(result[0].delta).toBeGreaterThanOrEqual(result[1].delta);
  });

  it('leaves skipped trades unchanged', () => {
    const skipped = makeTrade({ triggerType: 'skipped', candles: [] });
    const result = recalculateResultsTPOnly([skipped], 100);
    expect(result[0].triggerType).toBe('skipped');
  });
});

describe('aggregatePositiveDeltas', () => {
  const t = (delta: number, trigger: string = 'take_profit'): TradeResult => ({
    id: '1', tokenSymbol: '', tokenName: '', tokenAddress: '', entryPrice: 100,
    exitPrice: 100, entryTime: 0, exitTime: 0, amountUSD: 0, actualPnL: 0,
    simulatedPnL: 0, delta, triggerType: trigger as TradeResult['triggerType'], candles: [],
  });

  it('sums only positive deltas', () => {
    expect(aggregatePositiveDeltas([t(500), t(-200, 'natural'), t(300)])).toBeCloseTo(800);
  });

  it('returns 0 when all deltas are negative', () => {
    expect(aggregatePositiveDeltas([t(-100, 'natural')])).toBe(0);
  });

  it('excludes skipped trades', () => {
    expect(aggregatePositiveDeltas([t(500, 'skipped')])).toBe(0);
  });
});

describe('aggregateRealPnL', () => {
  it('sums actual PnL of non-skipped trades', () => {
    const trades: TradeResult[] = [
      { id: '1', tokenSymbol: '', tokenName: '', tokenAddress: '', entryPrice: 100, exitPrice: 100, entryTime: 0, exitTime: 0, amountUSD: 0, actualPnL: 300, simulatedPnL: 0, delta: 0, triggerType: 'take_profit', candles: [] },
      { id: '2', tokenSymbol: '', tokenName: '', tokenAddress: '', entryPrice: 100, exitPrice: 100, entryTime: 0, exitTime: 0, amountUSD: 0, actualPnL: -100, simulatedPnL: 0, delta: 0, triggerType: 'natural', candles: [] },
      { id: '3', tokenSymbol: '', tokenName: '', tokenAddress: '', entryPrice: 100, exitPrice: 100, entryTime: 0, exitTime: 0, amountUSD: 0, actualPnL: 999, simulatedPnL: 0, delta: 0, triggerType: 'skipped', candles: [] },
    ];
    expect(aggregateRealPnL(trades)).toBeCloseTo(200);
  });
});

describe('aggregateSimulatedPnL', () => {
  it('sums simulated PnL of non-skipped trades', () => {
    const trades: TradeResult[] = [
      { id: '1', tokenSymbol: '', tokenName: '', tokenAddress: '', entryPrice: 100, exitPrice: 100, entryTime: 0, exitTime: 0, amountUSD: 0, actualPnL: 0, simulatedPnL: 800, delta: 0, triggerType: 'take_profit', candles: [] },
      { id: '2', tokenSymbol: '', tokenName: '', tokenAddress: '', entryPrice: 100, exitPrice: 100, entryTime: 0, exitTime: 0, amountUSD: 0, actualPnL: 0, simulatedPnL: -50, delta: 0, triggerType: 'natural', candles: [] },
    ];
    expect(aggregateSimulatedPnL(trades)).toBeCloseTo(750);
  });
});

describe('findOptimalTpOnly', () => {
  const makeTrade = (overrides: Partial<TradeResult> = {}): TradeResult => ({
    id: 'trade-1', tokenSymbol: 'ETH', tokenName: 'Ethereum', tokenAddress: '0xeth',
    entryPrice: 100, exitPrice: 90, entryTime: 0, exitTime: 3600, amountUSD: 1000,
    actualPnL: -100, simulatedPnL: 0, delta: 0, triggerType: 'natural', candles: [],
    ...overrides,
  });

  it('returns the TP% that maximises positive delta', () => {
    const trades = [makeTrade({
      candles: [candle(95, 180), candle(85, 100)],
      actualPnL: -100,
    })];
    const result = findOptimalTpOnly(trades);
    expect(result.tpPercent).toBe(50);
    expect(result.totalPositiveDelta).toBeGreaterThan(0);
  });

  it('returns a valid result even when no TP would help', () => {
    const trades = [makeTrade({
      candles: [candle(80, 99), candle(70, 95)],
      actualPnL: -100,
    })];
    const result = findOptimalTpOnly(trades);
    expect(result.totalPositiveDelta).toBeCloseTo(0);
    expect(result.tpPercent).toBeDefined();
  });
});

describe('normalizeAddress', () => {
  it('lowercases EVM addresses', () => {
    expect(normalizeAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12', 'base'))
      .toBe('0xabcdef1234567890abcdef1234567890abcdef12');
  });

  it('preserves Solana address case (base58 is case-sensitive)', () => {
    const solAddr = '4p4K8LfWcZM5YE3G5Phe7eGvZAChGwXHZX2duhJepump';
    expect(normalizeAddress(solAddr, 'solana')).toBe(solAddr);
  });

  it('does not corrupt Solana addresses with mixed case', () => {
    const addr = 'ABCdefGHIjklMNOpqrSTUvwxYZ123456789abcDEF';
    expect(normalizeAddress(addr, 'solana')).toBe(addr);
    expect(normalizeAddress(addr, 'base')).toBe(addr.toLowerCase());
  });
});
