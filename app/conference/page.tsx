'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import type { ConferenceAnalysisResult, Chain } from '@/lib/types';
import { WalletInput } from '@/components/WalletInput';
import { LoadingState } from '@/components/LoadingState';
import { ConferenceResultsView } from '@/components/conference/ConferenceResultsView';

type ConferenceState = 'idle' | 'loading' | 'results' | 'error' | 'empty' | 'whale';

type ConferenceResult = ConferenceAnalysisResult & { rank: number | null };

function MethodologyTooltip() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative inline-flex items-center justify-center gap-1.5">
      <p className="text-xs text-[#3A3A3A] text-center">
        Past simulations are not financial advice.
      </p>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[#3A3A3A] text-[#3A3A3A] hover:border-[#6B6B6B] hover:text-[#6B6B6B] transition-colors text-[10px] font-bold leading-none"
        aria-label="How this works"
      >
        ?
      </button>

      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-16 left-1/2 -translate-x-1/2 w-[calc(100vw-32px)] sm:w-[420px] max-h-[70vh] overflow-y-auto bg-[#111111] border border-[#1F1F1F] rounded-2xl p-5 shadow-2xl z-50 text-left"
          style={{ animation: 'tooltipFadeIn 0.15s ease-out' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white">How this works</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-[#3A3A3A] hover:text-white transition-colors text-lg leading-none"
            >
              &times;
            </button>
          </div>

          <div className="flex flex-col gap-3 text-xs text-[#6B6B6B] leading-relaxed">
            <div>
              <span className="text-[#00FF87] font-semibold">Data source</span>
              <p>All numbers cover the <strong>last 12 months</strong> of on-chain spot swaps only. P&amp;L per token is sourced directly from on-chain data (realized + unrealized). Positions are grouped by token, not individual trades &mdash; this correctly handles DCA buying and selling in chunks.</p>
            </div>

            <div>
              <span className="text-[#00FF87] font-semibold">Price history</span>
              <p>For each token position, we fetch daily price candles covering the period you held it. We use the daily <em>high</em> to check if Take Profit would have triggered.</p>
            </div>

            <div>
              <span className="text-[#00FF87] font-semibold">TP simulation</span>
              <p>We test 10 Take Profit levels (1.5x to 10.5x) and pick the one that maximizes your upside. For each token, if the daily high ever hit your TP target, we assume you would have sold at that price. No stop loss is simulated.</p>
            </div>

            <div>
              <span className="text-[#00FF87] font-semibold">The hero number</span>
              <p>&ldquo;Money left on the table&rdquo; measures the extra profit you would have captured on trades where you exited too early &mdash; positions where the price kept rising past your sell, and a Take Profit would have locked in a higher exit. Trades where you already nailed the exit are unaffected.</p>
            </div>

            <div>
              <span className="text-[#00FF87] font-semibold">Limitations</span>
              <ul className="list-disc list-inside mt-1 flex flex-col gap-1">
                <li>Daily candles &mdash; intra-day price spikes shorter than 1 day may be missed</li>
                <li>Max 500 swap events analyzed</li>
                <li>Tokens with no price history data are skipped</li>
                <li>Simulation assumes instant fill at the TP target &mdash; no slippage or fees</li>
                <li>Only spot swaps are included &mdash; no perps, lending, or LP positions</li>
              </ul>
            </div>

            <p className="text-[#3A3A3A] mt-1">
              This is a simulation for educational purposes. Past performance does not predict future results. Not financial advice.
            </p>
          </div>

          <style jsx>{`
            @keyframes tooltipFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

export default function ConferencePage() {
  const [state, setState] = useState<ConferenceState>('idle');
  const [result, setResult] = useState<ConferenceResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(
    address: string,
    chain: Chain,
    displayName: string,
    social: { tg?: string; x?: string; email?: string },
  ) {
    setState('loading');
    setErrorMessage('');
    setResult(null);

    try {
      const res = await fetch('/api/conference/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          chain,
          displayName,
          socialTg: social.tg,
          socialX: social.x,
          socialEmail: social.email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'WHALE_ALERT') {
          setState('whale');
          return;
        }
        setErrorMessage(data.error ?? 'Something went wrong. Please try again.');
        setState('error');
        return;
      }

      if (!data.totalTrades || data.totalTrades === 0) {
        setState('empty');
        return;
      }

      setResult(data as ConferenceResult);
      setState('results');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[conference] fetch error:', msg);
      if (msg.includes('abort') || msg.includes('timeout') || msg.includes('Timeout') || msg === 'fetch failed') {
        setErrorMessage('Analysis is taking longer than expected. This wallet has a lot of trades — please try again.');
      } else {
        setErrorMessage('Could not reach the server. Check your connection and try again.');
      }
      setState('error');
    }
  }

  function reset() {
    setState('idle');
    setResult(null);
    setErrorMessage('');
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white flex flex-col items-center px-4 py-8">
      {/* Header — only shown on idle screen */}
      {state === 'idle' && (
        <header className="mb-6 text-center flex flex-col gap-3 max-w-lg">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#00FF87]">
              Matcha &middot; ETHConf 2026
            </span>
          </div>
          <h1 className="text-4xl font-black text-white leading-tight">
            How much did you leave on the table?
          </h1>
          <p className="text-[#6B6B6B] text-base leading-relaxed">
            See what Take Profit would have earned you on your last 12 months of trades.
          </p>
        </header>
      )}

      {/* Content area */}
      <div className="w-full max-w-xl">
        {state === 'idle' && (
          <WalletInput onSubmit={handleSubmit} isLoading={false} />
        )}

        {state === 'loading' && (
          <LoadingState />
        )}

        {state === 'results' && result && (
          <ConferenceResultsView result={result} onReset={reset} />
        )}

        {state === 'empty' && (
          <div className="text-center flex flex-col gap-6 py-12">
            <div className="text-5xl">&#x1F937;</div>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-bold text-white">Nothing to simulate</h2>
              <p className="text-[#6B6B6B] text-sm">
                Take-Profit only earns its keep on tokens that actually move. We skip stables and bluechips
                (ETH, BTC, USDC and friends), so if that&apos;s all your wallet&apos;s been up to,
                congratulations &mdash; you&apos;re wiser than most of crypto. Try the other chain, or another wallet.
              </p>
            </div>
            <button
              onClick={reset}
              className="text-sm text-white underline underline-offset-4 mx-auto hover:text-[#6B6B6B] transition-colors"
            >
              Try another wallet
            </button>
          </div>
        )}

        {state === 'whale' && (
          <div className="text-center flex flex-col gap-6 py-12">
            <div className="text-6xl">&#x1F433;</div>
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-black text-white">Whale detected</h2>
              <p className="text-[#6B6B6B] text-base leading-relaxed max-w-md mx-auto">
                Your wallet has so many transactions that even our servers need a moment of silence.
                Unfortunately we can&apos;t compute PnL for wallets with over 1 million events.
              </p>
              <p className="text-[#3A3A3A] text-sm mt-2">
                We get it, you trade. A lot.
              </p>
            </div>
            <button
              onClick={reset}
              className="text-sm text-white underline underline-offset-4 mx-auto hover:text-[#6B6B6B] transition-colors"
            >
              Try a smaller wallet
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="text-center flex flex-col gap-6 py-12">
            <div className="text-5xl">&#x26A0;&#xFE0F;</div>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-bold text-white">Something went wrong</h2>
              <p className="text-[#6B6B6B] text-sm">{errorMessage}</p>
            </div>
            <button
              onClick={reset}
              className="text-sm text-white underline underline-offset-4 mx-auto hover:text-[#6B6B6B] transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Footer — only shown on idle screen */}
      {state === 'idle' && (
        <footer className="mt-16 flex flex-col items-center gap-4">
          <Link
            href="/conference/leaderboard"
            className="text-sm text-[#00FF87] hover:text-[#00CC6A] transition-colors font-semibold"
          >
            View Leaderboard &rarr;
          </Link>
          <MethodologyTooltip />
        </footer>
      )}
    </main>
  );
}
