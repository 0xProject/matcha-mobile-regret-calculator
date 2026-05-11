# Architecture — Conference TP Growth Tool

## Overview

Conference booth tool that analyzes wallet trading history and simulates how much more money the user would have made with automatic Take Profit. Built for ETHConf June 2026.

## Domain Map

```
┌─────────────────────────────────────────────────────────┐
│  UI Layer (browser)                                     │
│  app/conference/page.tsx     — wallet input + results   │
│  app/conference/leaderboard/ — booth projection screen  │
│  components/conference/*     — React components         │
│  components/WalletInput.tsx  — shared input component   │
│  components/LoadingState.tsx — shared loading spinner   │
└────────────────────┬────────────────────────────────────┘
                     │ fetch (HTTP)
┌────────────────────▼────────────────────────────────────┐
│  API Layer (server)                                     │
│  app/api/conference/analyze/route.ts   — POST analyze   │
│  app/api/conference/leaderboard/route.ts — GET rankings │
└────────────────────┬────────────────────────────────────┘
                     │ imports
┌────────────────────▼────────────────────────────────────┐
│  Orchestrator                                           │
│  lib/analyze.ts — analyzeWalletConference()             │
│    1. Zerion PnL (actual PnL per token)                 │
│    2. Zerion transactions (event timing)                │
│    3. Group by token → fetch Codex daily candles        │
│    4. TP simulation → grid search optimal TP            │
│    5. Aggregate positive deltas → hero number           │
└──────┬──────────────┬──────────────┬────────────────────┘
       │              │              │
┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼──────┐
│ Zerion API  │ │ Codex API │ │ Simulation │
│ lib/zerion  │ │ lib/codex │ │ lib/sim.ts │
│ (server)    │ │ (server)  │ │ (pure)     │
└──────┬──────┘ └─────┬─────┘ └─────┬──────┘
       │              │              │
┌──────▼──────────────▼──────────────▼──────┐
│  Shared Types                              │
│  lib/types.ts — zero project imports       │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│  Persistence                               │
│  lib/leaderboard.ts → Supabase             │
│  lib/cache.ts → in-memory candle cache     │
└────────────────────────────────────────────┘
```

## Dependency Rules (ESLint-enforced)

| Module | Can import | Cannot import |
|--------|-----------|---------------|
| `lib/types.ts` | nothing | everything else |
| `lib/simulation.ts` | `types` | zerion, codex, cache, analyze, components, app |
| `lib/zerion.ts` | `types` | codex, analyze, simulation, components, app |
| `lib/codex.ts` | `types`, `cache` | zerion, analyze, simulation, components, app |
| `lib/analyze.ts` | `types`, `simulation`, `zerion`, `codex` | components, app |
| `lib/leaderboard.ts` | `types` | everything except types |
| `components/*` | `types` | zerion, codex, cache, analyze, app/api |
| `app/api/*` | `analyze`, `leaderboard`, `types` | components |

## Data Flow

```
Browser                           Server
  │                                │
  ├─ User enters wallet ─────→  POST /api/conference/analyze
  │                                │
  │                                ├─→ fetchWalletPnL(Zerion)
  │                                │   - Single call, returns per-token PnL
  │                                │   - realized_gain, unrealized_gain, average_buy_price
  │                                │
  │                                ├─→ fetchTradeEvents(Zerion)
  │                                │   - Paginate up to 3 pages (300 events)
  │                                │   - Normalize → group by token address
  │                                │   - Extract: firstBuyTime, lastSellTime per token
  │                                │
  │                                ├─→ fetchCandles(Codex) [daily, parallel batches]
  │                                │   - 1 call per token position (not per trade)
  │                                │   - Resolution: '1D' (daily candles)
  │                                │
  │                                ├─→ TP Simulation (pure, no I/O)
  │                                │   - entryPrice = averageBuyPrice from Zerion PnL
  │                                │   - exitPrice = reconstructed from actualPnL
  │                                │   - Grid search optimal TP% (50-950%)
  │                                │   - Hero = sum of positive deltas only
  │                                │
  │                                ├─→ submitEntry(Supabase)
  │                                │   - Upsert leaderboard entry
  │                                │
  │  ←── ConferenceAnalysisResult ──┤
  │                                │
  └─ Display results               │
     Hero number + top trades      │
     Share on X + rank             │
```

## Performance

- **Target**: < 15s total analysis time per wallet
- **Zerion PnL**: ~1-2s (single call)
- **Zerion events**: ~22s worst case (3 pages x 11s delay) — dominates total time
- **Codex candles**: ~5s (batched, cached, 1 call per token not per trade)
- **Simulation**: < 50ms (pure JS, in-memory)
- **Candle cache**: In-memory Map, persists across requests within server process
