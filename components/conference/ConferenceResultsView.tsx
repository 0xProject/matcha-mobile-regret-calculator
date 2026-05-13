'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ConferenceAnalysisResult } from '@/lib/types';
import { MatchaCTA } from './MatchaCTA';

interface ConferenceResultsViewProps {
  result: ConferenceAnalysisResult & { rank: number | null };
  onReset: () => void;
}

function formatDelta(abs: number): string {
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}k`;
  return `$${abs.toFixed(0)}`;
}

function formatSigned(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount >= 0 ? '+' : '-';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function tpPercentToMultiplier(tpPercent: number): string {
  const multiplier = 1 + tpPercent / 100;
  return `${multiplier.toFixed(1)}x`;
}

export function ConferenceResultsView({ result, onReset }: ConferenceResultsViewProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const displayRef = useRef(0);
  const rafRef = useRef<number>(0);

  const target = result.moneyLeftOnTable;

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const duration = 1_200;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = Math.min(now - start, duration);
      const p = 1 - Math.pow(1 - elapsed / duration, 3); // cubic ease-out
      const val = target * p;
      displayRef.current = val;
      setDisplayValue(val);
      if (elapsed < duration) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayRef.current = target;
        setDisplayValue(target);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  const isZero = result.moneyLeftOnTable < 1; // treat < $1 as effectively zero (avoids "+$0" with TP badge)
  const isProfitable = result.realPnL >= 0;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sltp.matcha.xyz/conference';
  const tweetText =
    isZero
      ? isProfitable
        ? `I left $0 on the table - my exits were already on point \ud83c\udfaf\n\nCheck yours -> ${appUrl}\n\n@matchaxyz`
        : `TP couldn't have saved me here - the market had other plans \ud83d\udcc9 But at least now I know my real P&L. Check yours -> ${appUrl}\n\n@matchaxyz`
      : `I left ${formatDelta(result.moneyLeftOnTable)} on the table by not using Take Profit \ud83e\udd2f\n\nCheck yours -> ${appUrl}\n\n@matchaxyz`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  // Sort top trades by delta desc, take max 5
  const sortedTrades = [...result.topTrades]
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-8 animate-fade-slide-up">
      {/* Hero */}
      <div className="text-center flex flex-col gap-3">
        <p className="text-xs uppercase tracking-widest text-[#6B6B6B] font-semibold">
          {result.chain === 'base' ? 'Base' : 'Solana'} wallet &middot; last 12 months
        </p>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-6xl font-black tabular-nums leading-none text-[#00FF87]">
            +{formatDelta(displayValue)}
          </span>
          <p className="text-xl text-white font-semibold mt-2">
            left on the table
          </p>
          {isZero && (
            <p className="text-sm text-[#6B6B6B] mt-1">
              {isProfitable
                ? `Clean exits - TP had nothing to add here 🎯 Want to stay this sharp on every trade? Matcha's P&L tracker shows your true performance in real time, not just the trades you analyze.`
                : `TP can't catch gains that didn't happen - the market just went the other way on these 😅 The good news: you now know your real P&L (${formatSigned(result.realPnL)} across ${result.analyzedTrades} trade${result.analyzedTrades !== 1 ? 's' : ''}). A more informed trader is a better trader. You might even be in the running for the biggest loss prize - check the leaderboard 👀`}
            </p>
          )}
        </div>

        {(!isZero || isProfitable) && (
          <p className="text-sm text-[#6B6B6B]">
            Across {result.analyzedTrades} trade{result.analyzedTrades !== 1 ? 's' : ''} in the last 12 months
          </p>
        )}

        {/* Comparison strip: only if TP would have improved results */}
        {result.tpPnL > result.realPnL && (
          <div className="flex items-center justify-center gap-5 pt-1">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[11px] text-[#3A3A3A] uppercase tracking-wider">Actual P&amp;L</span>
              <span className={`font-mono text-base font-bold tabular-nums ${result.realPnL >= 0 ? 'text-white' : 'text-[#FF3B30]'}`}>
                {formatSigned(result.realPnL)}
              </span>
            </div>
            <span className="text-[#2A2A2A] text-lg">&rarr;</span>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[11px] text-[#3A3A3A] uppercase tracking-wider">With Take Profit</span>
              <span className={`font-mono text-base font-bold tabular-nums ${result.tpPnL >= 0 ? 'text-[#00FF87]' : 'text-[#FF3B30]'}`}>
                {formatSigned(result.tpPnL)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Optimal TP badge — only shown when TP actually helped */}
      {!isZero && (
        <div className="flex justify-center">
          <div className="bg-[#111111] border border-[#1F1F1F] rounded-xl px-5 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#00FF87]/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-[#00FF87]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] text-[#6B6B6B] uppercase tracking-wider">Your optimal Take Profit</span>
              <span className="font-mono text-lg font-bold text-white tabular-nums">
                {tpPercentToMultiplier(result.optimalTp)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard rank + link */}
      <div className="text-center flex flex-col gap-2">
        {result.rank != null && (
          <p className="text-sm text-[#6B6B6B]">
            You&apos;re{' '}
            <span className="font-mono font-bold text-[#00FF87]">#{result.rank}</span>
            {' '}on the ETHConf leaderboard
          </p>
        )}
        <Link
          href="/conference/leaderboard"
          className="text-sm text-[#00FF87] hover:text-[#00CC6A] transition-colors font-semibold"
        >
          View Leaderboard &rarr;
        </Link>
      </div>

      {/* Trade breakdown */}
      {sortedTrades.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs uppercase tracking-widest text-[#6B6B6B] font-semibold px-1">
            Top trades
          </h3>
          <div className="flex flex-col gap-2">
            {sortedTrades.map((trade) => (
              <div
                key={trade.id}
                className="bg-[#111111] border border-[#1F1F1F] rounded-xl px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">
                      {trade.tokenSymbol}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-[#00FF87] bg-[#00FF87]/10 px-1.5 py-0.5 rounded">
                      Take Profit
                    </span>
                  </div>
                  <span className="text-xs text-[#6B6B6B]">
                    Actual: {formatSigned(trade.actualPnL)} &rarr; With TP: {formatSigned(trade.simulatedPnL)}
                  </span>
                </div>
                <span className="font-mono text-sm font-bold tabular-nums text-[#00FF87] flex-shrink-0">
                  +{formatDelta(trade.delta)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Moonshot callout */}
      {result.moonshots > 0 && (
        <div className="bg-[#111111] border border-[#1F1F1F] rounded-xl px-5 py-4 text-center">
          <p className="text-sm text-[#6B6B6B] leading-relaxed">
            <span className="text-white font-semibold">
              You nailed {result.moonshots} moonshot{result.moonshots > 1 ? 's' : ''}
            </span>
            {' '}- nice exits! But across your other positions, you left{' '}
            <span className="text-[#00FF87] font-semibold">{formatDelta(result.moneyLeftOnTable)}</span>
            {' '}on the table. Take Profit locks in gains automatically so the wins you miss don&apos;t stay missed.
          </p>
        </div>
      )}

      {/* Share button */}
      <button
        onClick={() => window.open(twitterUrl, '_blank', 'noopener,noreferrer')}
        className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-[#E5E5E5] text-black font-bold text-sm py-3.5 rounded-xl active:scale-[0.98] transition-all duration-150"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Share on X
      </button>

      {/* CTA */}
      <MatchaCTA variant={isZero && !isProfitable ? 'pnl' : 'tp'} />

      {/* Try another wallet */}
      <button
        onClick={onReset}
        className="text-sm text-[#6B6B6B] hover:text-white transition-colors underline underline-offset-4 mx-auto"
      >
        Try another wallet
      </button>
    </div>
  );
}
