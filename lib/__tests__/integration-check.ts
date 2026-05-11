/**
 * Integration test — runs the full conference pipeline against real wallets
 * and validates mathematical correctness end-to-end.
 *
 * Requires: ZERION_API_KEY and CODEX_API_KEY in .env.local
 * Run: node node_modules/.bin/tsx lib/__tests__/integration-check.ts
 *
 * This is NOT a Jest test (it hits real APIs). Run manually after pipeline changes.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load env
const envPath = resolve(import.meta.dirname ?? __dirname, '../../.env.local');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq < 0) continue;
  if (!process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1);
}

import { analyzeWalletConference } from '../analyze';
import { computePnL } from '../simulation';
import type { Chain, TradeResult } from '../types';

interface TestWallet {
  address: string;
  chain: Chain;
  label: string;
  minExpectedTrades: number;
}

const WALLETS: TestWallet[] = [
  {
    address: '0x48260a95ec90269512e76171f47df467660c9ee0',
    chain: 'base',
    label: 'Heavy Base trader (~100+ positions)',
    minExpectedTrades: 20,
  },
  {
    address: '0xeb52626c58eacdf49c1f4126f5d670388c00aed5',
    chain: 'base',
    label: 'Base wallet with cyb3rwr3n position',
    minExpectedTrades: 3,
  },
  {
    address: '0x981837fcc116557663d3a3692700f9b89739323f',
    chain: 'base',
    label: 'Engineering manager wallet (Base)',
    minExpectedTrades: 1,
  },
  {
    address: 'G3gZWqrYkNmYFKYCyfRCNtGuxdyuE2wiYKkZpiZn4WSS',
    chain: 'solana',
    label: 'Solana memecoin trader',
    minExpectedTrades: 10,
  },
];

let totalChecks = 0;
let passedChecks = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  totalChecks++;
  if (condition) {
    passedChecks++;
  } else {
    const msg = `FAIL: ${name}${detail ? ' — ' + detail : ''}`;
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}

async function testWallet(wallet: TestWallet) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${wallet.label}`);
  console.log(`${wallet.address} (${wallet.chain})`);
  console.log('═'.repeat(70));

  const start = Date.now();
  const result = await analyzeWalletConference(wallet.address, wallet.chain);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`  Completed in ${elapsed}s — ${result.totalTrades} positions, ${result.analyzedTrades} analyzed`);
  console.log(`  moneyLeftOnTable: $${result.moneyLeftOnTable.toFixed(2)}`);
  console.log(`  realPnL:          $${result.realPnL.toFixed(2)}`);
  console.log(`  tpPnL:            $${result.tpPnL.toFixed(2)}`);
  console.log(`  optimalTp:        ${result.optimalTp}% (${(1 + result.optimalTp / 100).toFixed(1)}x)`);
  console.log(`  moonshots:        ${result.moonshots}`);

  if (result.topTrades.length > 0) {
    console.log(`\n  Top trades (${result.topTrades.length}):`);
    for (const t of result.topTrades) {
      const tpPrice = t.entryPrice * (1 + result.optimalTp / 100);
      const maxHigh = t.candles.length > 0 ? Math.max(...t.candles.map(c => c.high)) : 0;
      const reconstructedPnL = t.amountUSD > 0
        ? ((t.exitPrice - t.entryPrice) / t.entryPrice) * t.amountUSD
        : 0;
      console.log(`\n    ${t.tokenSymbol}`);
      console.log(`      invested:       $${t.amountUSD.toFixed(2)}`);
      console.log(`      entry:          $${t.entryPrice.toPrecision(6)}`);
      console.log(`      exit (actual):  $${t.exitPrice.toPrecision(6)}`);
      console.log(`      TP target:      $${tpPrice.toPrecision(6)}`);
      console.log(`      max candle H:   $${maxHigh.toPrecision(6)}`);
      console.log(`      actualPnL:      $${t.actualPnL.toFixed(2)}  [Zerion]`);
      console.log(`      exitPrice→PnL:  $${reconstructedPnL.toFixed(2)}  [reconstructed, should ≈ actualPnL]`);
      console.log(`      simulatedPnL:   $${t.simulatedPnL.toFixed(2)}  [at TP exit]`);
      console.log(`      delta:          $${t.delta.toFixed(2)}  [simPnL − actualPnL, should = ${(t.simulatedPnL - t.actualPnL).toFixed(2)}]`);
      console.log(`      triggerType:    ${t.triggerType}`);
    }
  }

  // CHECK 1: Got enough trades
  check(
    'Minimum trades',
    result.totalTrades >= wallet.minExpectedTrades,
    `expected >= ${wallet.minExpectedTrades}, got ${result.totalTrades}`,
  );

  // CHECK 2: moneyLeftOnTable >= 0
  check(
    'moneyLeftOnTable >= 0',
    result.moneyLeftOnTable >= 0,
    `got ${result.moneyLeftOnTable}`,
  );

  // CHECK 3: analyzedTrades <= totalTrades
  check(
    'analyzedTrades <= totalTrades',
    result.analyzedTrades <= result.totalTrades,
  );

  // CHECK 4: topTrades are all positive delta + take_profit
  for (const t of result.topTrades) {
    check(
      `topTrade ${t.tokenSymbol}: delta > 0`,
      t.delta > 0,
      `delta = ${t.delta.toFixed(2)}`,
    );
    check(
      `topTrade ${t.tokenSymbol}: triggerType = take_profit`,
      t.triggerType === 'take_profit',
      `got ${t.triggerType}`,
    );
  }

  // CHECK 5: delta = simulatedPnL - actualPnL for all topTrades
  for (const t of result.topTrades) {
    const expectedDelta = t.simulatedPnL - t.actualPnL;
    check(
      `topTrade ${t.tokenSymbol}: delta arithmetic`,
      Math.abs(t.delta - expectedDelta) < 0.01,
      `delta=${t.delta.toFixed(2)}, simPnL-actualPnL=${expectedDelta.toFixed(2)}`,
    );
  }

  // CHECK 6: exitPrice reconstruction — computePnL(entry, exit, amount) ≈ actualPnL
  for (const t of result.topTrades) {
    if (t.amountUSD === 0) continue;
    const reconstructed = computePnL(t.entryPrice, t.exitPrice, t.amountUSD);
    check(
      `topTrade ${t.tokenSymbol}: exitPrice reconstructs actualPnL`,
      Math.abs(reconstructed - t.actualPnL) < 1,
      `reconstructed=$${reconstructed.toFixed(2)}, actual=$${t.actualPnL.toFixed(2)}`,
    );
  }

  // CHECK 7: TP target check — for TP-triggered trades, candle high >= target
  for (const t of result.topTrades) {
    if (t.triggerType !== 'take_profit' || t.candles.length === 0) continue;
    const target = t.entryPrice * (1 + result.optimalTp / 100);
    const maxHigh = Math.max(...t.candles.map(c => c.high));
    check(
      `topTrade ${t.tokenSymbol}: candle high >= TP target`,
      maxHigh >= target,
      `target=$${target.toPrecision(6)}, maxHigh=$${maxHigh.toPrecision(6)}`,
    );
  }

  // CHECK 8: No negative-delta trades leaked into topTrades
  const leaks = result.topTrades.filter(t => t.delta <= 0 || t.triggerType !== 'take_profit');
  check(
    'No invalid trades in topTrades',
    leaks.length === 0,
    leaks.length > 0 ? `${leaks.length} invalid trades found` : undefined,
  );

  // CHECK 9: Sanity — moneyLeftOnTable >= sum of topTrades deltas
  const topSum = result.topTrades.reduce((s, t) => s + t.delta, 0);
  check(
    'moneyLeftOnTable >= sum of visible topTrades',
    result.moneyLeftOnTable >= topSum - 0.01,
    `hero=$${result.moneyLeftOnTable.toFixed(2)}, topSum=$${topSum.toFixed(2)}`,
  );
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Conference Pipeline — Integration Test                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  for (const wallet of WALLETS) {
    try {
      await testWallet(wallet);
    } catch (err) {
      console.log(`\n  ❌ WALLET CRASHED: ${err instanceof Error ? err.message : err}`);
      failures.push(`CRASH: ${wallet.address} — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log('SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Checks: ${passedChecks}/${totalChecks} passed`);

  if (failures.length > 0) {
    console.log(`\n${failures.length} FAILURE(S):`);
    for (const f of failures) console.log(`  • ${f}`);
    process.exit(1);
  } else {
    console.log('\n✅ ALL CHECKS PASSED');
    process.exit(0);
  }
}

main();
