'use client';

interface MatchaCTAProps {
  variant?: 'tp' | 'pnl';
}

export function MatchaCTA({ variant = 'tp' }: MatchaCTAProps) {
  if (variant === 'pnl') {
    return (
      <div className="w-full bg-[#0D0D0D] border border-[#1F1F1F] rounded-2xl p-8 flex flex-col gap-6 text-center">
        <div className="w-12 h-12 mx-auto bg-[#111111] border border-[#1F1F1F] rounded-xl flex items-center justify-center">
          <svg className="w-6 h-6 text-[#00FF87]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-bold text-white">
            Know your real P&amp;L, instantly
          </h3>
          <p className="text-sm text-[#6B6B6B] leading-relaxed">
            Know your true performance before your next trade. Track every position in real time - because a more informed trader is a better trader.
          </p>
        </div>

        <a
          href="#"
          className="w-full flex items-center justify-center bg-[#00FF87] text-black font-bold text-sm py-3 rounded-xl hover:bg-[#00E67A] active:scale-[0.98] transition-all duration-150"
        >
          Open Matcha
        </a>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#0D0D0D] border border-[#1F1F1F] rounded-2xl p-8 flex flex-col gap-6 text-center">
      <div className="w-12 h-12 mx-auto bg-[#111111] border border-[#1F1F1F] rounded-xl flex items-center justify-center">
        <svg className="w-6 h-6 text-[#00FF87]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-bold text-white">
          Take Profit is coming to Matcha Mobile
        </h3>
        <p className="text-sm text-[#6B6B6B] leading-relaxed">
          Never leave money on the table again. Set automatic take profit on any token.
        </p>
      </div>

      <a
        href="#"
        className="w-full flex items-center justify-center bg-[#00FF87] text-black font-bold text-sm py-3 rounded-xl hover:bg-[#00E67A] active:scale-[0.98] transition-all duration-150"
      >
        Download Matcha
      </a>
    </div>
  );
}
