'use client';

import { useState } from 'react';
import type { LeaderboardEntry, LeaderboardSort } from '@/lib/types';

function formatMetric(value: number): string {
  const abs = Math.abs(value);
  const prefix = value >= 0 ? '+' : '-';
  if (abs >= 1_000_000) return `${prefix}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}$${(abs / 1_000).toFixed(1)}k`;
  return `${prefix}$${abs.toFixed(0)}`;
}

function getMetricValue(entry: LeaderboardEntry, key: LeaderboardSort): number {
  switch (key) {
    case 'moneyLeftOnTable':
      return entry.moneyLeftOnTable;
    case 'realPnL':
      return entry.realPnL;
    case 'tpPnL':
      return entry.tpPnL;
  }
}

const RANK_ACCENTS: Record<number, string> = {
  1: '#FFD700', // gold
  2: '#C0C0C0', // silver
  3: '#CD7F32', // bronze
};

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  title: string;
  metricKey: LeaderboardSort;
}

export default function LeaderboardTable({
  entries,
  title,
  metricKey,
}: LeaderboardTableProps) {
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const display = [...entries]
    .sort((a, b) => {
      const diff = getMetricValue(a, metricKey) - getMetricValue(b, metricKey);
      return sortDir === 'desc' ? -diff : diff;
    })
    .slice(0, 20);

  return (
    <div className="w-full">
      <h2 className="text-4xl font-bold text-white mb-6 tracking-tight">
        {title}
      </h2>

      {/* Header row */}
      <div className="grid grid-cols-[60px_1fr_120px_1fr] gap-4 px-4 pb-3 text-[#6B6B6B] text-lg font-medium border-b border-[#1F1F1F]">
        <span>#</span>
        <span>Player</span>
        <span>Chain</span>
        <button
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          className="text-right flex items-center justify-end gap-1 hover:text-white transition-colors w-full"
          title={sortDir === 'desc' ? 'Click to show lowest first' : 'Click to show highest first'}
        >
          Amount {sortDir === 'desc' ? '↓' : '↑'}
        </button>
      </div>

      {/* Entries */}
      <div className="flex flex-col">
        {display.map((entry, i) => {
          const rank = i + 1;
          const accent = RANK_ACCENTS[rank];
          const value = getMetricValue(entry, metricKey);
          const isPositive = value >= 0;

          return (
            <div
              key={entry.id}
              className="grid grid-cols-[60px_1fr_120px_1fr] gap-4 items-center px-4 py-3 border-b border-[#1F1F1F]"
              style={{
                backgroundColor: rank % 2 === 0 ? '#0A0A0A' : 'transparent',
                borderLeft: accent ? `3px solid ${accent}` : '3px solid transparent',
              }}
            >
              {/* Rank */}
              <span
                className="font-mono text-2xl font-bold"
                style={{ color: accent ?? '#6B6B6B' }}
              >
                {rank}
              </span>

              {/* Player name */}
              <span className="text-2xl text-white font-semibold truncate">
                {entry.displayName}
              </span>

              {/* Chain badge */}
              <span
                className="inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-semibold uppercase tracking-wider"
                style={{
                  backgroundColor:
                    entry.chain === 'base' ? 'rgba(0,82,255,0.15)' : 'rgba(153,69,255,0.15)',
                  color: entry.chain === 'base' ? '#3B82F6' : '#9945FF',
                }}
              >
                {entry.chain === 'base' ? 'Base' : 'Solana'}
              </span>

              {/* Metric value */}
              <span
                className="font-mono text-2xl font-bold text-right"
                style={{ color: isPositive ? '#00FF87' : '#FF3B30' }}
              >
                {formatMetric(value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
