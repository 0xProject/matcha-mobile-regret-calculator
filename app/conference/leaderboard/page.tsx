'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LeaderboardRotator from '@/components/conference/LeaderboardRotator';
import type { LeaderboardEntry } from '@/lib/types';

const POLL_INTERVAL_MS = 10_000;

export default function LeaderboardPage() {
  const [mlotEntries, setMlotEntries] = useState<LeaderboardEntry[]>([]);
  const [pnlEntries, setPnlEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchLeaderboard() {
      try {
        const [mlotRes, pnlRes] = await Promise.all([
          fetch('/api/conference/leaderboard?sort=moneyLeftOnTable&mlotOnly=true&limit=50'),
          fetch('/api/conference/leaderboard?sort=realPnL&limit=50'),
        ]);

        if (!mlotRes.ok || !pnlRes.ok) return;

        const [mlotData, pnlData] = await Promise.all([
          mlotRes.json(),
          pnlRes.json(),
        ]);

        if (cancelled) return;

        setMlotEntries(mlotData.entries ?? []);
        setPnlEntries(pnlData.entries ?? []);
        // total = all wallets ever analyzed (PnL dataset is the superset)
        setTotal(pnlData.total ?? 0);
      } catch {
        // silently ignore — projection should keep showing last data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const hasEntries = mlotEntries.length > 0 || pnlEntries.length > 0;

  return (
    <div className="flex flex-col min-h-screen bg-[#000000] text-white p-8 lg:p-12">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <span className="text-lg font-medium text-[#6B6B6B] tracking-wider uppercase">
          ETHConf 2026
        </span>
        <div className="flex-1 text-center">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
            Matcha{' '}
            <span className="text-[#00FF87]">Take Profit</span>{' '}
            Leaderboard
          </h1>
          <p className="text-sm text-[#3A3A3A] mt-1">Based on the last 12 months of spot trades</p>
        </div>
        <span className="text-lg font-semibold text-[#00FF87] tracking-wide">
          matcha.xyz
        </span>
      </header>

      {/* Divider */}
      <div className="w-full h-px bg-[#1F1F1F] mb-8" />

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-2 border-[#1F1F1F] border-t-[#00FF87] rounded-full animate-spin" />
              <span className="text-[#6B6B6B] text-xl">
                Loading leaderboard...
              </span>
            </div>
          </div>
        ) : !hasEntries ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[#6B6B6B] text-2xl">
              No entries yet -- scan your wallet at the booth!
            </span>
          </div>
        ) : (
          <LeaderboardRotator mlotEntries={mlotEntries} pnlEntries={pnlEntries} />
        )}
      </main>

      {/* Divider */}
      <div className="w-full h-px bg-[#1F1F1F] mt-8 mb-4" />

      {/* Footer */}
      <footer className="flex items-center justify-between text-[#6B6B6B] text-lg">
        <Link
          href="/conference"
          className="text-[#00FF87] hover:text-[#00CC6A] transition-colors font-semibold"
        >
          &larr; Check your wallet
        </Link>
        <span>
          <span className="text-white font-mono font-bold">{total}</span>{' '}
          wallets analyzed
        </span>
        <span className="font-mono text-[#6B6B6B]">
          matcha.xyz/conference
        </span>
      </footer>
    </div>
  );
}
