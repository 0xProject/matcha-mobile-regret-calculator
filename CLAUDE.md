# Conference TP Growth Tool

ETHConf booth activation tool. Analyzes a wallet's trading history and shows how much more money they would have made with automatic Take Profit — drives mobile app signups.

## Quick start

```bash
npm run dev          # Dev server at localhost:3000
npm run build        # Production build (must pass before deploy)
npm test             # Unit + smoke tests (must pass before commit)
npm run lint         # ESLint (must pass before commit)
```

Tech: **Next.js 16** / **React 19** / **TypeScript strict** / **Tailwind CSS v4** / **Supabase**

## Architecture

```
Zerion PnL endpoint → actual PnL per token (source of truth)
Zerion transactions → event timing (first buy, last sell per token)
Codex daily candles → price history for TP simulation
Simulation (pure)   → "would TP have done better?"
Supabase            → leaderboard persistence
```

**Domain boundaries (ESLint-enforced):**
- `lib/types.ts` — zero internal imports, all shared interfaces
- `lib/simulation.ts` — pure functions, no I/O, runs in browser + server
- `lib/zerion.ts`, `lib/codex.ts`, `lib/analyze.ts` — server-only (uses process.env)
- `components/` — cannot import data-pipeline (zerion, codex, analyze)
- `app/api/` — orchestrates data-pipeline + simulation

See `ARCHITECTURE.md` for full dependency rules and data flow diagram.

## Key files

| Path | Purpose |
|------|---------|
| `lib/types.ts` | All TypeScript interfaces |
| `lib/simulation.ts` | Pure TP simulation + aggregation functions |
| `lib/zerion.ts` | Zerion API: PnL endpoint + trade events |
| `lib/codex.ts` | Codex API: daily OHLC candles |
| `lib/analyze.ts` | Conference pipeline orchestrator |
| `lib/leaderboard.ts` | Supabase leaderboard CRUD |
| `lib/cache.ts` | In-memory candle cache |
| `app/conference/page.tsx` | Landing page (wallet input + results) |
| `app/conference/leaderboard/page.tsx` | Booth projection screen |
| `app/api/conference/analyze/route.ts` | POST — analyze wallet |
| `app/api/conference/leaderboard/route.ts` | GET — leaderboard data |

## External APIs

### Zerion (`lib/zerion.ts`)
- **PnL endpoint**: `GET /v1/wallets/{addr}/pnl/` — per-token realized/unrealized PnL, average buy/sell prices. Single call, returns all tokens. Filtered by `chain_ids` and `since` (365 days).
- **Transactions**: `GET /v1/wallets/{addr}/transactions/` — swap events for timing data. Paginated (100/page, max 3 pages). 11s delay between pages.
- **Rate limit**: ~6 req/min on free tier. PnL endpoint counts toward limit. Retries on 429/503 with 10s backoff.

### Codex (`lib/codex.ts`)
- **getBars** GraphQL query. Symbol format: `"tokenAddress:networkId"` (Base=8453, Solana=1399811149).
- Resolution: `'1D'` (daily candles) for conference mode.
- Batch: 5 concurrent requests, 1s delay between batches.
- Response: parallel arrays `{ t, o, h, l, c }`.

### Supabase (`lib/leaderboard.ts`)
- Table: `leaderboard_entries` with upsert on `(wallet_address, chain)`.
- Env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

## Conference pipeline logic

1. Fetch Zerion PnL (actual PnL per token, handles DCA in/out correctly)
2. Fetch transaction events (for timing: first buy → last sell per token)
3. Group events by token address
4. Fetch daily candles per token position
5. Set `exitPrice` to reconstruct Zerion's actualPnL: `entryPrice * (1 + actualPnL / totalInvested)`
6. Grid-search optimal TP% (50–950%, step 100) maximizing sum of positive deltas
7. Hero number = sum of positive deltas only (trades where TP helped, ignoring trades where TP would have sold too early)

## Code rules

- `simulation.ts` functions are **pure** — no I/O, no fetch, no console.log in production
- All types live in `lib/types.ts` — single source of truth
- UI components cannot import `lib/zerion.ts`, `lib/codex.ts`, or `lib/analyze.ts`
- Conference mode uses daily candles (`'1D'` resolution) — hourly is unnecessary for TP-only
- The hero number ("money left on table") is always >= 0 by design

## Testing

- `lib/__tests__/simulation.test.ts` — unit tests for all simulation functions
- `lib/__tests__/smoke.test.ts` — 10 mathematical invariants that must always hold
- `lib/__tests__/integration-check.ts` — end-to-end test against real wallets (not Jest, run manually)
- `QA.md` — **full QA protocol: every agent must follow after any pipeline change**
- Run `npm test` before every commit
- Run `node node_modules/.bin/tsx lib/__tests__/integration-check.ts` after any pipeline/API change

### Smoke test invariants (must never fail)
1. moneyLeftOnTable >= 0
2. TP-triggered trades have positive simulatedPnL
3. delta = simulatedPnL - actualPnL
4. Natural exit preserves actualPnL (delta = 0)
5. Optimal TP beats all alternatives
6. Skipped trades contribute 0 to aggregates
7. exitPrice formula reconstructs Zerion PnL
8. High >= target always triggers TP
9. High < target never triggers TP
10. topTrades only contains positive delta + take_profit

## Common mistakes

- **Zerion `value` field = current price, not historical.** Always use the stable-side transfer's value for USD sizing. Derive entry price as `stableValue / tokenAmount`.
- **Codex API is `getBars`, not `getTokenOhlcv`.** Symbol format: `"address:networkId"`.
- **Use `!= null` (loose) for Zerion fields.** Solana transactions omit `mined_at_block` entirely (undefined, not null). Strict `!== null` passes undefined.
- **npm scripts need explicit path.** Use `node node_modules/.bin/<cmd>` in package.json scripts.
- **PnL endpoint rate-limits harder.** Call PnL before transactions (sequentially, not in parallel) to avoid 429 collisions.

## Environment variables

```
ZERION_API_KEY=         # From zerion.io developer portal
CODEX_API_KEY=          # From codex.io
SUPABASE_URL=           # Supabase project URL
SUPABASE_ANON_KEY=      # Supabase anon/public key
NEXT_PUBLIC_APP_URL=    # For share links (e.g. https://sltp.matcha.xyz/conference)
```
