'use client';

import { useState } from 'react';
import LeaderboardTable from '@/components/conference/LeaderboardTable';
import type { LeaderboardEntry, LeaderboardSort } from '@/lib/types';

interface ViewConfig {
  label: string;
  title: string;
  metricKey: LeaderboardSort;
}

const VIEWS: ViewConfig[] = [
  { label: 'Money Left on Table', title: 'Most Money Left on Table', metricKey: 'moneyLeftOnTable' },
  { label: 'Real P&L', title: 'Top Traders by Real P&L', metricKey: 'realPnL' },
];

interface LeaderboardRotatorProps {
  mlotEntries: LeaderboardEntry[];
  pnlEntries: LeaderboardEntry[];
}

export default function LeaderboardRotator({ mlotEntries, pnlEntries }: LeaderboardRotatorProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const view = VIEWS[activeIndex];
  // Each tab gets its own pre-sorted dataset from the server — no client-side sort here.
  // LeaderboardTable handles secondary client-side sort (asc/desc toggle on Amount column).
  const entries = activeIndex === 0 ? mlotEntries : pnlEntries;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tab buttons */}
      <div className="flex gap-2 mb-6">
        {VIEWS.map((v, i) => (
          <button
            key={v.metricKey}
            onClick={() => setActiveIndex(i)}
            className={`px-5 py-2.5 rounded-xl text-base font-semibold transition-all duration-150 ${
              i === activeIndex
                ? 'bg-[#00FF87] text-black'
                : 'bg-[#111111] border border-[#1F1F1F] text-[#6B6B6B] hover:text-white'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <LeaderboardTable
          entries={entries}
          title={view.title}
          metricKey={view.metricKey}
        />
      </div>
    </div>
  );
}
