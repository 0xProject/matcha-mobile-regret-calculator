'use client';

import { useEffect, useState, useRef } from 'react';

const MESSAGES: { text: string; delay: number }[] = [
  { text: 'Judging your trades...', delay: 0 },
  { text: 'Oh wow, you really held that one huh', delay: 3000 },
  { text: 'Calculating how rich you could have been...', delay: 4000 },
  { text: 'This is going to be awkward', delay: 5000 },
  { text: 'Almost done, just processing your regret...', delay: 6000 },
];

export function LoadingState() {
  const [visibleMessages, setVisibleMessages] = useState<string[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const indexRef = useRef(0);

  useEffect(() => {
    function showNext() {
      if (indexRef.current >= MESSAGES.length) return;

      const msg = MESSAGES[indexRef.current];
      setVisibleMessages((prev) => [...prev, msg.text]);
      indexRef.current++;

      if (indexRef.current < MESSAGES.length) {
        timeoutRef.current = setTimeout(showNext, MESSAGES[indexRef.current].delay);
      }
    }

    showNext();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center justify-center py-16 gap-8">
      <div className="flex flex-col gap-5 items-center text-center">
        {visibleMessages.map((msg, i) => {
          const isLatest = i === visibleMessages.length - 1;
          return (
            <p
              key={`${i}-${msg}`}
              className={`text-2xl md:text-3xl lg:text-4xl font-semibold leading-snug transition-all duration-700 ${
                isLatest
                  ? 'text-white opacity-100 translate-y-0'
                  : 'text-[#2A2A2A] opacity-60 translate-y-0'
              }`}
              style={{
                animation: isLatest ? 'fadeSlideIn 0.6s ease-out' : undefined,
              }}
            >
              {msg}
            </p>
          );
        })}
      </div>

      {/* Pulsing glow bar */}
      <div className="w-48 h-1 rounded-full overflow-hidden mt-4">
        <div
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, #00FF87, transparent)',
            animation: 'shimmer 1.5s ease-in-out infinite',
          }}
        />
      </div>

      <style jsx>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(12px);
            filter: blur(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
        }
        @keyframes shimmer {
          0%, 100% {
            transform: translateX(-100%);
            opacity: 0.3;
          }
          50% {
            transform: translateX(100%);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
