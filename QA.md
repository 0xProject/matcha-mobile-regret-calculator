# QA Protocol — Conference TP Growth Tool

**Every agent must run these checks after any change to the data pipeline, simulation logic, or API layer.** No exceptions — merge nothing without passing all sections.

## 1. Automated tests (always run first)

```bash
npm test          # Must show 0 failures
npm run build     # Must compile with no type errors
```

## 2. Integration test script

Run the wallet verification script against known wallets. This hits the real Zerion and Codex APIs and validates the math end-to-end.

```bash
node node_modules/.bin/tsx lib/__tests__/integration-check.ts
```

This script tests 3 wallets and checks:
- PnL records come back non-empty
- moneyLeftOnTable >= 0
- All topTrades have positive delta + take_profit trigger
- delta = simulatedPnL - actualPnL for every trade
- TP target price = entryPrice * (1 + optimalTp/100)
- Every TP-triggered trade has a candle with high >= target
- Cross-reference: for at least 1 token, Zerion PnL totalGain matches what we use as actualPnL

## 3. Spot-check wallets

These wallets have known characteristics. After any pipeline change, verify the results still make sense:

| Wallet | Chain | What to check |
|--------|-------|---------------|
| `0x48260a95ec90269512e76171f47df467660c9ee0` | Base | ~100+ positions. Has WOON (DCA sell, should show ~$8.3k actual PnL). Has ATEAM & TAOLOR (big winners — TP should NOT improve these). |
| `0xd985bd504d737c6533335dfa4ad74e571bb3bd88` | Base | Small wallet, few trades. Should produce results, not "no trades found". |
| `0xeb52626c58eacdf49c1f4126f5d670388c00aed5` | Base | Has cyb3rwr3n position (~30 day hold). Should have candles and TP simulation. |
| `G3gZWqrYkNmYFKYCyfRCNtGuxdyuE2wiYKkZpiZn4WSS` | Solana | Solana wallet. Tests cross-chain support. |

## 4. Mathematical invariants to verify manually

If automated tests pass but you changed simulation or aggregation logic, also verify these by hand on at least 1 wallet:

1. **PnL window match**: Zerion PnL `since` param should produce numbers consistent with the 180-day transaction events. If a token shows $X invested in PnL, you should see roughly $X of buy events in transactions. Large mismatches mean the `since` filter isn't working.

2. **DCA handling**: For tokens with multiple buy or sell events (like WOON), the actualPnL should match Zerion's `total_gain` for that token, NOT our old FIFO pair calculation.

3. **No false positives**: Tokens where the user already sold at the peak (big actual profit) should NOT appear in topTrades. TP would have sold earlier at a worse price → negative delta → excluded.

4. **exitPrice reconstruction**: For every non-skipped trade, `computePnL(entryPrice, exitPrice, amountUSD)` must equal `actualPnL`. This is the bridge formula: `exitPrice = entryPrice * (1 + actualPnL / totalInvested)`.

5. **Hero number**: `moneyLeftOnTable` = sum of all positive deltas only. Never negative. Never includes skipped trades.

## 5. UI smoke test

After any UI change, visually verify at `http://localhost:3000/conference`:

- [ ] Landing page renders with 3 input fields (name, wallet, social)
- [ ] Chain toggle works (Base ↔ Solana)
- [ ] Loading messages stream in with animation
- [ ] Results page shows hero number, comparison strip, optimal TP badge
- [ ] Top trades breakdown only shows "Take Profit" badges (no "Stop Loss")
- [ ] "View Leaderboard" link works
- [ ] Leaderboard shows display names (not wallet addresses)
- [ ] Leaderboard tab buttons switch between "Money Left on Table" and "Real P&L"
- [ ] "← Check your wallet" link on leaderboard goes back to form

## 6. Zerion API rate limits — manual wallet audits

When running batch scripts against the Zerion API (e.g., auditing wallets to check coverage), **respect the rate limit or all results will be silently wrong**.

**Builder tier (current key):** ~50 req/s burst, but production wallets still fire 2 Zerion calls (PnL + transactions). Don't run more than 1 wallet/sec in batch scripts.

**Rules for any manual audit script:**
- **Always add `"User-Agent": "curl/7.84.0"`** — Python's default `urllib` User-Agent is blocked (returns 403, not caught as an error, silently returns 0 results)
- **Wait 0.5–1s between calls** — even on builder tier, bursting 20+ wallets in parallel causes silent 503s that look like 0-result wallets
- **Print the HTTP status code** — a "0 events" result is meaningless unless you confirm it was HTTP 200
- **Test a known-active wallet first** (e.g. `0x48260a95...`) to confirm auth + network are working before running the batch

```python
HEADERS = {
    "Authorization": "Basic " + base64.b64encode(b"<key>:").decode(),
    "Accept": "application/json",
    "User-Agent": "curl/7.84.0",  # required — Python default is blocked
}
# Between each wallet:
time.sleep(0.5)
```

**Lesson learned (2026-05-04):** A batch audit of 20 wallets reported all 0 results. Root cause: Python's default User-Agent was silently getting 403s, which the script's `except Exception` caught and treated as 0 events. All 20 wallets actually had 100 trade events each. Always verify with a single manual curl before trusting batch results.

## 7. Common failure modes to watch for

| Symptom | Likely cause |
|---------|-------------|
| "No trades found" for a wallet that should have trades | Stale Supabase cache (30min TTL). Delete the entry and retry. |
| All numbers are 0 but trades exist | PnL endpoint returned empty breakdown. Check if `since` param is working (requires paid Zerion key). |
| Wildly inflated delta for a token | PnL window mismatch — all-time PnL vs 180-day events. Verify `since` param is set. |
| TP triggers on trades where it shouldn't | Candle `high` data is wrong. Check Codex candle fetch for that token — verify the token address is correct. |
| "Daily quota reached" immediately | Zerion key is demo tier (300 req/day). Need paid key for production use. |
| 429 errors during analysis | Too many parallel requests. Ensure PnL and events calls respect rate limits. |
| Batch audit shows all-zero results | Python `urllib` User-Agent blocked (403). Add `"User-Agent": "curl/7.84.0"` to headers. See section 6 above. |
