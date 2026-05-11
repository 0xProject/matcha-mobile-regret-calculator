# UX Patterns for Token Discovery & User Nudging

Research compiled from Zerion Feed case study, eToro CopyTrader, fomo.family, Robinhood, DexScreener, Photon, Spotify, TikTok, and fintech UX literature.

---

## 1. Discovery Feed Patterns

### 1.1 Feed Architecture Models

There are four dominant feed architectures in trading apps, each with distinct trade-offs:

| Model | How it works | Strength | Weakness | Example |
|-------|-------------|----------|----------|---------|
| **Algorithmic** | ML-ranked tokens based on signals (volume spike, holder growth, social mentions) | Scales without curation effort; adapts to user | Cold start problem; can feel opaque | TikTok FYP, Robinhood Crypto Market Pulse |
| **Curated** | Editorial team or DAO selects featured tokens/narratives | High trust, low noise | Doesn't scale; slow to react | Coinbase "New on Coinbase", Public.com themes |
| **Social/Trader-driven** | Feed populated by trades from followed wallets/traders | High signal for crypto natives; builds community | Empty without follows; echo chamber risk | Zerion Feed, fomo.family, Cielo |
| **Trending/Momentum** | Ranked by real-time metrics (volume, price change, new pairs) | Zero personalization needed; always populated | Noise-heavy; chases pumps | DexScreener Trending, DEXTools Hot Pairs |

**Best practice: Unified feed blending all four.** Zerion learned this the hard way — they originally split the feed into "followed traders" and "algorithmic recommendations" as separate tabs. Users who hadn't followed anyone saw an empty feed. The fix was a single unified Alpha Feed where followed traders' trades are prioritized but algorithmic recommendations fill in the gaps, ensuring every user sees something actionable on first open.

### 1.2 The TikTok Model Applied to Token Discovery

TikTok's core insight: rank by interest graph, not social graph. You don't need followers to see great content. Applied to tokens:

**Signal mapping from TikTok to trading:**

| TikTok signal | Trading equivalent | Weight |
|--------------|-------------------|--------|
| Watch completion rate | Time spent on token detail page | High |
| Replays | Returning to same token multiple times | High |
| Shares | Sharing token link externally | High |
| Likes | Adding to watchlist | Medium |
| Comments | Engaging with trade discussion | Medium |
| Profile visits | Viewing trader's full portfolio | Medium |
| Skip/scroll-past | Scrolling past a token card without tapping | Negative |
| "Not interested" | Explicit dismiss/hide | Strong negative |

**Staged distribution pipeline for new tokens:**
1. **Test pool** — Show a newly listed token to 200-500 users whose behavior patterns match early adopters of similar tokens
2. **Expand** — If engagement (tap-through, watchlist adds, trades) exceeds threshold, expand to 5x audience
3. **Trending** — Sustained engagement pushes to broader trending feed
4. **Plateau** — Distribution stabilizes; token becomes "known"

**Key difference from content:** Tokens have measurable on-chain data (volume, holder count, liquidity) that content doesn't. Combine behavioral signals with on-chain momentum for a hybrid ranking model.

### 1.3 How Robinhood, eToro, and Public Handle Discovery

**Robinhood:**
- Customizable dashboard with draggable widgets (watchlists, tickers, portfolio progress)
- "Crypto Market Pulse" — personalized 24/7 feed using real-time signals (sentiment, news, liquidity shifts, price changes). Gold members only, creating aspirational paywall
- Explore page with categories: "Top Movers", "Most Popular", "Upcoming Earnings", "New on Robinhood"
- Confetti animation on trade completion — small delight that creates habit loop
- Minimal jargon; educational tooltips inline

**eToro:**
- "Discover" tab organized by asset class, then by ranked traders
- Prominent "Popular Investor" cards showing 12-month return, risk score, number of copiers
- Social feed of followed traders' activity and market commentary
- CopyPortfolios — thematic bundles (DeFi, AI, Gaming) managed by eToro's investment team

**Public.com:**
- "Themes" — curated investment themes (Space Economy, Clean Water, Social Media)
- Community feed showing what other users are buying/selling with opt-in transparency
- "Town Hall" live audio events with company CEOs
- Educational content integrated directly into token detail pages

### 1.4 Recommended Feed Component: The Token Discovery Card

Based on Zerion's validated design research (82% found mini-charts useful, 63% preferred seeing token quantity):

```
┌─────────────────────────────────────────────────┐
│  [Trader Avatar] trader_name    🟢 Bought       │
│  Win Rate: 72%  |  30d PnL: +340%              │
│─────────────────────────────────────────────────│
│  TOKEN_NAME ($TICKER)           MCap: $2.4M     │
│  ┌─────────────────────────────┐                │
│  │  📈 7d mini-chart           │  +127% (24h)   │
│  │  (sparkline, not full chart)│  Vol: $890K     │
│  └─────────────────────────────┘                │
│  Bought 2.4 SOL worth ($340)                    │
│  Position: Entering ▶                           │
│─────────────────────────────────────────────────│
│  [💬 12 comments]    [⭐ Save]    [🔄 Copy]     │
└─────────────────────────────────────────────────┘
```

**Critical data points validated by Zerion's research:**
- **Market cap over price** — advanced traders use mcap to assess stage, not raw price
- **Position intent** — is the trader entering, averaging, or exiting? This is the most actionable signal
- **Win rate + PnL** — establishes credibility before the user evaluates the trade
- **Mini-chart** — visual compression; lets users assess trajectory without opening a full chart
- **Token quantity with cost basis** — builds trust and clarity (63% preference in testing)

---

## 2. Cold Start Problem Solutions

### 2.1 The Core Problem

New users face two simultaneous cold starts:
1. **Platform cold start** — "I don't know what this app does or how to use it"
2. **Decision cold start** — "I don't know what to trade"

Every additional second before the "aha moment" increases churn. Crypto exchanges average 2-3% visitor-to-trader conversion; top performers hit 8-12%. The difference is almost entirely UX.

### 2.2 Spotify-Style Preference Capture (Adapted for Trading)

Spotify asks you to pick 3+ artists on signup, then immediately plays music. Translation for trading:

**Onboarding flow (< 30 seconds, 3 screens):**

**Screen 1: "What chains do you trade on?"**
Grid of chain logos (Solana, Ethereum, Base, BSC, etc.). Multi-select. Tap to toggle. Preselect the chain from their connected wallet if available.

**Screen 2: "What kind of tokens interest you?"**
Pill-shaped tags: `Memecoins` `DeFi` `AI Agents` `RWA` `Gaming` `L2s` `New Launches` `Blue Chips`
Select 2-5. These seed the recommendation engine.

**Screen 3: "How do you trade?"**
Three cards with illustrations:
- **Sniper** — "I buy early and sell fast" → surface new listings, low-mcap tokens
- **Swing trader** — "I hold for days to weeks" → surface momentum tokens with strong trends
- **Degen** — "I ape into anything that moves" → surface highest-velocity tokens, social buzz

Skip button always visible. If skipped, default to "Trending" feed.

### 2.3 Default Content That Works Without Personalization

Even before preferences exist, the feed should never be empty:

| Section | Content | Why it works |
|---------|---------|-------------|
| **Trending Now** | Top 10 tokens by 24h volume increase across user's chains | Always populated; momentum-driven |
| **New Pairs** | Tokens listed in last 4 hours with >$50K liquidity | Appeals to snipers; time-sensitive |
| **Whale Moves** | Large buys (>$10K) by tracked wallets in last hour | Social proof; high signal |
| **Top Traders Today** | 5 wallets with best 24h realized PnL | Bootstraps the "who to follow" problem |
| **Narrative Spotlight** | 1 curated section on the day's dominant narrative | Editorial quality; anchors the feed |

### 2.4 Progressive Disclosure Strategy

**Level 1 (Day 1):** Show price, 24h change, mini-chart, volume. Single "Buy" button.
**Level 2 (Day 3+):** Unlock holder analytics, top holders, buy/sell ratio.
**Level 3 (Week 2+):** Full charting, indicators, limit orders, DCA configuration.

Don't gate features behind paywalls initially — gate them behind engagement. "You've viewed 20 token pages — here's the holder analysis tool" feels like a reward, not a restriction.

### 2.5 How Music/Content Apps Solve Cold Start (Transfer Patterns)

| App | Cold start solution | Trading translation |
|-----|-------------------|---------------------|
| **Spotify** | Pick 3 artists → instant playlist | Pick 3 token categories → instant watchlist |
| **TikTok** | Skip signup, show trending content immediately | Show trending tokens before any account creation |
| **Netflix** | "Top 10 in Your Country" | "Top 10 on Solana Right Now" |
| **YouTube** | "Trending" tab as zero-personalization default | "What's Moving" tab always available |
| **Pinterest** | Pick topics → populated board | Pick narratives → populated discovery feed |

**The transferable principle:** Show the best content your platform has immediately, before asking for anything. Let behavior replace stated preferences over 3-5 sessions.

---

## 3. Social / Copy Trading UX

### 3.1 eToro CopyTrader: What Makes It Work

eToro's CopyTrader is the most commercially successful copy trading product. Core mechanics:

- **One-tap copy**: Select trader → set amount ($200 minimum) → click "Copy" → all future trades mirrored proportionally
- **Proportional allocation**: If the trader has 60% in BTC and 40% in ETH, your $200 splits $120/$80 automatically
- **Full mirror**: Opens, closes, SL/TP adjustments all replicate. You can override individual positions without breaking the copy relationship
- **Up to 100 copied traders**: Enables portfolio-of-portfolios strategy
- **No additional fees**: Only standard spreads. This is critical — fee transparency builds trust
- **Demo mode**: $100K virtual money to try copy trading risk-free

**Why it works UX-wise:**
1. The trader selection screen is essentially a dating app for portfolios — photo, bio, stats, history
2. Risk score (1-10) gives instant gut-check without reading the full profile
3. Copier count acts as social proof ("12,847 people copy this trader")
4. 12-month return is the hero metric, but you can drill into monthly breakdown
5. The "Copy" CTA is persistent and visually dominant on every trader profile

### 3.2 fomo.family: Social-First Trading

fomo takes the opposite approach from eToro — social comes first, trading is the action layer.

**Feed design:**
- Twitter-like timeline showing real trades: "[trader_name] bought $500 of $BONK"
- Each trade card shows: entry price, current P&L (updating live), trader's thesis (optional text)
- Reactions and comments on each trade — turns transactions into conversations
- "Friends feed" toggle to filter to only people you follow
- "Top traders" feed ranked by timeframe (24h, 7d, 30d)

**Key UX patterns:**
- **Slide-to-buy**: Swipe gesture to execute a trade, not a tap. Prevents accidental trades while keeping friction minimal
- **Apple Pay integration**: No need to pre-fund a wallet or buy SOL for gas. USD → token in one motion
- **30-second signup**: Apple ID or email only. Full KYC deferred until withdrawal
- **Gasless transactions**: User never sees gas fees or blockchain complexity

**What fomo gets right for crypto natives:**
- The feed feels like CT (Crypto Twitter) but with verified, on-chain trades instead of screenshots
- Showing dollar amounts creates real social proof (vs. percentage-only which can be gamed with tiny positions)
- Live P&L updates on open positions create "spectator sport" engagement

### 3.3 Social Proof UI Components

**Activity Ticker (Top Bar)**
A persistent horizontal ticker across the top of the app showing recent notable trades:
```
🟢 whale.sol bought $12K of $PEPE  •  📈 $BONK +47% (1h)  •  🐋 vitalik.eth sold 100 ETH
```
Auto-scrolling, tappable to open detail. Creates ambient awareness of market activity.

**Big Buy Alert (Modal/Toast)**
When a tracked wallet or top trader makes a large purchase:
```
┌─────────────────────────────────────────┐
│  🐋 Whale Alert                         │
│                                         │
│  ansem.sol just bought                  │
│  $45,000 of $WIF                        │
│                                         │
│  [View Trade]      [Buy $WIF]           │
└─────────────────────────────────────────┘
```
Appears as a toast notification, auto-dismisses after 8 seconds. The "Buy" CTA is the key conversion moment.

**Leaderboard Card**
```
┌─────────────────────────────────────────┐
│  🏆 Top Traders (7d)                    │
│                                         │
│  1. CryptoKing    +892%    👥 2.4K      │
│  2. SolSniper     +634%    👥 1.8K      │
│  3. DeFi_Dave     +421%    👥 956       │
│     ─── You: #847 (+12%) ───           │
│                                         │
│  [View Full Leaderboard]                │
└─────────────────────────────────────────┘
```
Showing the user's own rank, even if low, creates aspiration. "You're #847" is more motivating than no rank at all.

### 3.4 Privacy Considerations

| Data point | Show? | Rationale |
|-----------|-------|-----------|
| Trade direction (buy/sell) | Yes | Core value of social trading |
| Token traded | Yes | Core value |
| Dollar amount | Yes, if user opts in | Builds trust but some prefer privacy |
| Percentage of portfolio | Safer alternative to $ | Shows conviction without revealing net worth |
| Wallet address | Truncated (0x1a2...f3d) | Blockchain is public anyway; truncation is convention |
| Total portfolio value | No (unless user opts in) | Too sensitive; attracts scammers |
| Historical P&L | Yes (aggregated) | Credibility metric |
| Unrealized positions | Configurable | Some traders don't want to be front-run |
| Loss trades | Yes | Showing only wins destroys credibility |

**Critical rule:** Always show losses alongside wins. Platforms that only display winning trades lose user trust rapidly. fomo.family explicitly shows both gains and losses updating live — this is their strongest trust signal.

### 3.5 Copy Trading vs. Social Discovery

These are two fundamentally different product patterns:

| Dimension | Copy Trading | Social Discovery |
|-----------|-------------|-----------------|
| **User action** | Set and forget | Browse, evaluate, decide manually |
| **Automation** | Full (every trade mirrored) | None (inspiration only) |
| **Risk profile** | Higher (blind delegation) | Lower (user retains control) |
| **UX priority** | Trader selection, allocation management | Feed quality, card informativeness |
| **Revenue model** | Performance fees, spread markup | Engagement → more trades → more fees |
| **Regulatory** | May require advisory licensing | Generally unregulated |
| **Best for** | Passive users, beginners | Active traders, crypto natives |

**Recommendation for a crypto-native app:** Lead with social discovery, offer copy trading as an upgrade. Crypto natives want to make their own decisions but appreciate seeing what smart money is doing. The feed should inspire action, not automate it.

---

## 4. Notification and Alert Patterns

### 4.1 Notification Taxonomy for Trading Apps

Notifications must be ruthlessly categorized and independently configurable:

| Category | Examples | Default | Frequency cap |
|----------|---------|---------|---------------|
| **Transactional** | Trade confirmed, withdrawal complete, deposit received | On | Unlimited |
| **Price alerts** | Token hits target price | On (user-configured) | As triggered |
| **Portfolio** | Daily P&L summary, weekly recap | On | 1/day, 1/week |
| **Social** | Followed trader made a trade, someone copied you | On | 5/day max |
| **Trending** | Token breaking out, unusual volume | Off by default | 3/day max |
| **Whale alerts** | Large wallet activity on watched tokens | Off by default | 3/day max |
| **Educational** | "Did you know you can set stop-losses?" | On (first 14 days) | 1/day max |
| **Marketing** | New feature launch, competition announcement | Off by default | 2/week max |

### 4.2 Push Notification Principles

**The 39% rule:** 39% of users disable notifications because of bad timing, not bad content. Respect timezone (never push between 10 PM and 8 AM local) and Focus modes.

**Value-first format:** Every push notification must answer "why should I care right now?"

Good:
```
📈 $PEPE is up 47% in the last hour. 3 traders you follow just bought.
```

Bad:
```
Check out what's trending on our app today!
```

**Progressive notification onboarding:**
- Day 1: Only transactional (trade confirmations)
- Day 3: Ask permission for price alerts with clear value prop
- Day 7: Suggest social notifications ("Want to know when traders you follow make moves?")
- Day 14: Offer trending/whale alerts for power users

### 4.3 In-App Alert Patterns That Work

**Contextual nudge (non-blocking):**
Appears as a small banner at the top of the feed, not a modal:
```
┌─────────────────────────────────────────┐
│  📊 3 tokens on your watchlist are      │
│  breaking out right now                 │
│                              [View →]   │
└─────────────────────────────────────────┘
```

**Smart entry prompt:**
When a user has viewed a token page 3+ times without trading:
```
┌─────────────────────────────────────────┐
│  You've been watching $TOKEN for 3 days │
│  It's up 23% since your first view     │
│                                         │
│  [Set Price Alert]    [Buy Now]         │
└─────────────────────────────────────────┘
```

**Post-trade suggestion:**
After a buy, show related tokens:
```
┌─────────────────────────────────────────┐
│  ✅ Bought $WIF                         │
│                                         │
│  Traders who bought $WIF also hold:     │
│  $BONK (+12% 24h)  $POPCAT (+8% 24h)   │
│                                         │
│  [Explore Similar]                      │
└─────────────────────────────────────────┘
```

### 4.4 Alert Types Ranked by Effectiveness

From highest to lowest engagement rate (based on industry data from push notification platforms):

1. **Price alert hit** — User-configured, high intent. ~35% open rate
2. **Followed trader action** — Social + actionable. ~25% open rate
3. **Position P&L milestone** — "Your $BONK position is up 100%" ~20% open rate
4. **Whale alert on watched token** — Signal quality varies. ~15% open rate
5. **Trending token** — Low personalization. ~8% open rate
6. **General market update** — "BTC is up 5% today" ~5% open rate

---

## 5. Gamification Patterns

### 5.1 What Works (and What Doesn't) in Trading Gamification

**Works well:**

| Pattern | Implementation | Why it works |
|---------|---------------|-------------|
| **Leaderboards** | Ranked by realized PnL (not paper gains). Weekly/monthly resets with eternal "hall of fame" | Competition drives engagement; resets prevent permanent winners |
| **Trading streaks** | "You've traded 5 days in a row" with visual streak counter | Habit formation; Duolingo proved this at scale |
| **Achievement badges** | First trade, first 10x, first loss, survived a -50% dip | Milestone markers; showing losses as achievements normalizes risk |
| **Weekly challenges** | "Find a token that does 5x this week" (paper trade counts) | Discovery + engagement without requiring capital |
| **Referral rewards** | Both referrer and referred get a benefit (fee discount, bonus) | Network effects with aligned incentives |

**Doesn't work / dangerous:**

| Pattern | Why it fails |
|---------|-------------|
| **Points for volume** | Incentivizes overtrading; regulatory risk |
| **Confetti on every trade** | Robinhood got congressional scrutiny for this; feels manipulative |
| **Loss hiding** | Suppressing red numbers erodes trust |
| **"You missed out"** | FOMO-inducing notifications that show what you would have made backfire emotionally |

### 5.2 Trading Competition Design

**Format: Weekly "Alpha Hunt"**

```
┌─────────────────────────────────────────┐
│  🏆 Alpha Hunt — Week 12               │
│  Find the best trade this week          │
│                                         │
│  Rules:                                 │
│  • Any token, any chain                 │
│  • Ranked by best single-trade ROI      │
│  • Min $50 position to qualify          │
│  • Paper trades eligible (marked)       │
│                                         │
│  Prize: Featured on leaderboard +       │
│  "Alpha Hunter" badge                   │
│                                         │
│  Current leader: SolSniper (+342%)      │
│  Your best: +47% on $BONK              │
│                                         │
│  [Enter Trade]    [View Leaderboard]    │
└─────────────────────────────────────────┘
```

**Key design decisions:**
- Paper trades are eligible but visually marked — lowers barrier to entry
- Single-trade ROI, not portfolio — makes it accessible to small accounts
- Weekly reset — everyone starts equal every Monday
- Non-monetary prizes (badges, visibility) — avoids regulatory issues

### 5.3 Paper Trading as Engagement Funnel

Paper trading is the most underutilized engagement tool in crypto. Design it as a first-class feature, not a demo mode:

**"Shadow Portfolio" concept:**
```
┌─────────────────────────────────────────┐
│  👻 Shadow Portfolio                    │
│  Track what you would have made         │
│                                         │
│  Paper $PEPE: +127% (paper traded 3d)   │
│  Paper $WIF:  +43% (paper traded 1d)    │
│  Paper $BONK: -12% (paper traded 5d)    │
│                                         │
│  Total shadow PnL: +$340                │
│                                         │
│  "You found $340 in alpha this week.    │
│   Ready to trade for real?"             │
│                                         │
│  [Make It Real]     [Keep Shadowing]    │
└─────────────────────────────────────────┘
```

**Conversion psychology:** Showing users what they "would have made" is the strongest conversion lever from paper to real trading. The key is showing it without making it feel like a loss ("you missed out") — frame it as skill validation ("you found this alpha").

### 5.4 Streak Mechanics

```
┌─────────────────────────────────────────┐
│  🔥 7-Day Streak                        │
│  ■ ■ ■ ■ ■ ■ ■ □ □ □                   │
│  M T W T F S S                          │
│                                         │
│  Trade or add to watchlist today to     │
│  keep your streak alive                 │
│                                         │
│  Milestone: 7 days → "Consistent        │
│  Trader" badge                          │
└─────────────────────────────────────────┘
```

**Critical detail:** Streaks should not require trading to maintain. Watchlist additions, price alert creation, or portfolio check-ins should count. The goal is daily opens, not daily trades (which encourages overtrading).

---

## 6. Specific UX Flows for Crypto Natives

### 6.1 "What's Happening Right Now" — The Pulse Screen

Crypto natives need real-time signal, not curated content. Design a dedicated "Pulse" screen:

```
┌─────────────────────────────────────────┐
│  ⚡ Pulse                      [Filter] │
│─────────────────────────────────────────│
│                                         │
│  VOLUME SPIKES (last 1h)                │
│  $TOKEN1  Vol: $2.3M (+840%)  MCap: $4M │
│  $TOKEN2  Vol: $890K (+320%)  MCap: $12M│
│                                         │
│  NEW PAIRS (last 4h)                    │
│  $TOKEN3  Liq: $120K  Holders: 340      │
│  $TOKEN4  Liq: $85K   Holders: 127      │
│                                         │
│  WHALE ACTIVITY                         │
│  🐋 [0x1a2...] bought $45K of $TOKEN5  │
│  🐋 [whale.sol] sold $120K of $TOKEN6  │
│                                         │
│  TOP NARRATIVES                         │
│  #AIAgents (14 tokens, avg +23%)        │
│  #BaseMemes (8 tokens, avg +45%)        │
│                                         │
│  SMART MONEY CONSENSUS                  │
│  3 tracked wallets bought $TOKEN7 today │
│  5 tracked wallets are accumulating ETH │
│                                         │
└─────────────────────────────────────────┘
```

**Key principle: Scannable hierarchy.** Each section is self-contained. Users can scan headers and only dive into sections relevant to their strategy. No infinite scroll — structured sections with "See all" expansion.

**Avoiding overwhelm:**
- Default to "last 1 hour" timeframe — keeps the list short
- Limit each section to 3-5 items by default
- Color-code by urgency: red for selling pressure, green for buying momentum, neutral for informational
- "Quiet hours" toggle that pauses the Pulse feed (for mental health)

### 6.2 Browse-to-Trade Flow (3 Taps from Discovery to Execution)

**Tap 1: Token card in feed**
User taps a token card from the discovery feed, Pulse screen, or notification.

**Token detail page appears:**
```
┌─────────────────────────────────────────┐
│  ← Back                                │
│                                         │
│  $TOKEN_NAME                            │
│  $0.0042 (+127% 24h)    MCap: $4.2M    │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │         Interactive Chart            ││
│  │    (1h / 4h / 1d / 1w toggles)      ││
│  └─────────────────────────────────────┘│
│                                         │
│  Quick Stats Row:                       │
│  Vol: $2.3M | Liq: $340K | Holders: 4K │
│  Buy/Sell Ratio: 72/28 | Age: 3 days   │
│                                         │
│  Top Holders (expandable accordion):    │
│  1. 0x1a2... (12%)  2. 0xb3c... (8%)   │
│                                         │
│  Recent Trades (live feed):             │
│  🟢 0xa1... bought $2.4K  (3m ago)     │
│  🔴 0xf2... sold $800     (7m ago)     │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │     [BUY]            [SELL]         ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

**Tap 2: "Buy" button opens trade sheet**
Bottom sheet slides up (not a new screen — maintains context):

```
┌─────────────────────────────────────────┐
│  Buy $TOKEN_NAME                        │
│                                         │
│  Amount:  [  0.5 SOL  ]                │
│                                         │
│  Quick amounts:                         │
│  [0.1 SOL] [0.5 SOL] [1 SOL] [MAX]    │
│                                         │
│  ≈ $68.50 USD                           │
│  Slippage: 1% (auto)      [Settings]   │
│                                         │
│  SL/TP (optional):                      │
│  Stop Loss: [   ] %    Take Profit: [  ] % │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │     [ Slide to Buy → ]             ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

**Tap 3: Slide to confirm**
Slide gesture (like fomo.family) instead of tap to prevent accidents. Shows confirmation toast:

```
┌─────────────────────────────────────────┐
│  ✅ Bought 14,280 $TOKEN for 0.5 SOL   │
│                                         │
│  [View Position]    [Share Trade]       │
└─────────────────────────────────────────┘
```

**Design principles for this flow:**
- **3 taps maximum** from discovery to execution
- **Bottom sheet for trade** — user never loses chart context
- **Pre-filled amounts** — most common positions as quick-select buttons
- **USD equivalent always visible** — mental model anchor
- **SL/TP optional but visible** — nudges risk management without forcing it
- **Slide, not tap** — prevents accidental trades on volatile screens

### 6.3 Charts, Data, and Analytics for Crypto Natives

Crypto natives want data density. Don't hide it — organize it.

**Data hierarchy on token detail page:**

**Tier 1 (Always visible):**
- Price + 24h change (hero)
- Interactive candlestick chart with timeframe toggles
- Market cap, 24h volume, liquidity depth

**Tier 2 (One tap to reveal — accordion sections):**
- Holder distribution (top 10, concentration %)
- Buy/sell ratio (last 1h, 6h, 24h)
- Recent large transactions (>$1K)
- Token age, contract address (with copy button and explorer link)

**Tier 3 (Swipe to second tab):**
- Full holder analytics (new holders, departing holders, diamond hands)
- DEX liquidity depth across pools
- Social mentions (Twitter/X, Telegram, Discord)
- Related tokens (same deployer, same narrative)
- Contract security scan results (renounced, honeypot check)

**Charting requirements for crypto natives:**
- Candlestick by default (not line chart)
- TradingView-quality interaction (pinch to zoom, drag to pan)
- Timeframes: 1m, 5m, 15m, 1h, 4h, 1d
- Volume bars below chart
- Optional overlay indicators (MA, VWAP) in settings
- Draw tools not needed for mobile — save for desktop

### 6.4 Connecting Discovery to the SL/TP Tool

For this specific app — where the core value prop is SL/TP analysis — the discovery experience should funnel toward the analyzer:

**In-feed prompt when a user's watched token hits their entry:**
```
┌─────────────────────────────────────────┐
│  $TOKEN hit your alert price ($0.0042)  │
│                                         │
│  Run SL/TP Analysis to find the         │
│  optimal exit strategy                  │
│                                         │
│  [Analyze Now]         [Dismiss]        │
└─────────────────────────────────────────┘
```

**Post-trade nudge:**
```
┌─────────────────────────────────────────┐
│  ✅ You just bought $TOKEN              │
│                                         │
│  Want to see what SL/TP settings        │
│  would have worked best historically?   │
│                                         │
│  [Run Analysis]        [Maybe Later]    │
└─────────────────────────────────────────┘
```

**On the token detail page:**
Add a "Historical SL/TP" section showing:
```
┌─────────────────────────────────────────┐
│  📊 SL/TP Insights for $TOKEN          │
│                                         │
│  Optimal SL: -15% (based on 90d data)  │
│  Optimal TP: +80% (based on 90d data)  │
│  Expected value: +$42 per trade         │
│                                         │
│  [See Full Analysis]                    │
└─────────────────────────────────────────┘
```

This creates a natural bridge between discovery ("what should I trade?") and the app's core tool ("how should I trade it?").

---

## Appendix: Platform Reference Matrix

| Feature | Zerion Feed | fomo.family | eToro | Robinhood | DexScreener |
|---------|------------|-------------|-------|-----------|-------------|
| Social feed | ✅ | ✅ | ✅ | Limited | ❌ |
| Copy trading | ✅ (1-tap) | ✅ | ✅ (full auto) | ❌ | ❌ |
| Trending tokens | ✅ | ✅ | ❌ | ✅ | ✅ |
| Whale tracking | ✅ | ❌ | ❌ | ❌ | ✅ |
| Mini-charts in feed | ✅ | ❌ | ❌ | ✅ | ✅ |
| Trader profiles | ✅ | ✅ | ✅ | ❌ | ❌ |
| Paper trading | ❌ | ❌ | ✅ ($100K demo) | ❌ | ❌ |
| Gamification | ❌ | ❌ | Popular Investor program | Confetti, widgets | ❌ |
| Notifications | ✅ | ✅ | ✅ | ✅ (Market Pulse) | ✅ (alerts) |
| SL/TP tools | ❌ | ❌ | ✅ | Limited | ❌ |
| Target user | Crypto native | Social-first | Retail investor | Beginner | Pro trader |

---

## Key Takeaways for Implementation Priority

1. **Unified discovery feed** with token cards (Zerion model) — this is the highest-impact feature for engagement
2. **3-tap browse-to-trade flow** — remove every possible friction point between seeing a token and buying it
3. **Cold start defaults** (trending, new pairs, whale moves) — never show an empty screen
4. **Preference capture onboarding** (Spotify model, 3 screens, <30 seconds) — seeds personalization
5. **Social proof layer** (activity ticker, trader cards, leaderboard) — builds ambient engagement
6. **Tiered notifications** with user control — price alerts and followed-trader actions as the two highest-value channels
7. **Paper trading / Shadow Portfolio** — strongest conversion funnel from browsing to trading
8. **SL/TP analysis integration** — connect discovery to the app's unique value proposition at every natural inflection point
