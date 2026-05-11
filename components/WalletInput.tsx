'use client';

import { useState, useEffect } from 'react';
import type { Chain } from '@/lib/types';

interface WalletInputProps {
  onSubmit: (address: string, chain: Chain, displayName: string, social: { tg?: string; x?: string; email?: string }) => void;
  isLoading: boolean;
}

// ENS response type — mirrors app/api/conference/resolve-ens/route.ts
interface EnsResolveResponse {
  name: string;
  address: string | null;
  error?: 'not_found' | 'invalid_name' | 'resolution_failed';
}

function isValidEVM(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

function isValidSolana(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

// Inlined (not imported from lib/ens.ts) to respect the ESLint server-only boundary.
function looksLikeEns(input: string): boolean {
  const lower = input.trim().toLowerCase();
  return lower.endsWith('.eth') && lower.length > 4; // at least "a.eth"
}

export function WalletInput({ onSubmit, isLoading }: WalletInputProps) {
  const [address, setAddress] = useState('');
  const [chain, setChain] = useState<Chain>('base');
  const [displayName, setDisplayName] = useState('');
  const [socialField, setSocialField] = useState('');
  const [socialType, setSocialType] = useState<'x' | 'tg' | 'email'>('x');
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);

  // ENS resolution state
  const [ensResolved, setEnsResolved] = useState('');
  const [ensStatus, setEnsStatus] = useState<'idle' | 'resolving' | 'resolved' | 'not_found' | 'error'>('idle');

  // Debounced ENS resolution — fires 600ms after the user stops typing.
  // All setState calls are inside async callbacks (setTimeout) to avoid
  // the react-hooks/set-state-in-effect lint rule.
  useEffect(() => {
    const trimmed = address.trim();
    if (chain !== 'base' || !looksLikeEns(trimmed)) return;

    // Show spinner immediately (next tick) so the user sees feedback right away
    const statusTimer = setTimeout(() => {
      setEnsStatus('resolving');
      setEnsResolved('');
    }, 0);

    // Debounce the actual fetch
    const fetchTimer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/conference/resolve-ens?name=${encodeURIComponent(trimmed)}`,
        );
        const data: EnsResolveResponse = await res.json();

        if (data.address) {
          setEnsResolved(data.address);
          setEnsStatus('resolved');
        } else {
          setEnsStatus('not_found');
        }
      } catch {
        setEnsStatus('error');
      }
    }, 600);

    return () => {
      clearTimeout(statusTimer);
      clearTimeout(fetchTimer);
    };
  }, [address, chain]);

  function validate(): boolean {
    const name = displayName.trim();
    if (!name) {
      setError('Pick a name for the leaderboard');
      return false;
    }
    if (name.length < 2 || name.length > 20) {
      setError('Name must be 2–20 characters');
      return false;
    }

    const trimmed = address.trim();
    if (!trimmed) {
      setError('Enter a wallet address');
      return false;
    }

    if (chain === 'base') {
      if (looksLikeEns(trimmed)) {
        // ENS path — require resolution to complete
        if (ensStatus === 'resolving') {
          setError('Resolving ENS name, please wait…');
          return false;
        }
        if (ensStatus === 'not_found') {
          setError('ENS name not found — double-check or use a 0x address');
          return false;
        }
        if (ensStatus === 'error' || !ensResolved) {
          setError('Could not resolve ENS name — try again or use a 0x address');
          return false;
        }
        // ensStatus === 'resolved' with a valid ensResolved — fall through
        return true;
      }
      // Normal 0x path
      if (!isValidEVM(trimmed)) {
        setError('That doesn\'t look like a valid Base address (should start with 0x...)');
        return false;
      }
    }

    if (chain === 'solana' && !isValidSolana(trimmed)) {
      setError('That doesn\'t look like a valid Solana address');
      return false;
    }

    return true;
  }

  function parseSocial(): { tg?: string; x?: string; email?: string } {
    const v = socialField.trim();
    if (!v) return {};
    return { [socialType]: v };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    // For ENS inputs, submit the resolved 0x address, not the typed ENS name
    const submittedAddress =
      chain === 'base' && looksLikeEns(address.trim()) && ensResolved
        ? ensResolved
        : address.trim();

    // Pre-flight: check name + wallet availability before starting analysis
    setValidating(true);
    try {
      const res = await fetch('/api/conference/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: submittedAddress,
          chain,
          displayName: displayName.trim(),
        }),
      });
      const data = await res.json();
      if (!data.valid) {
        setError(data.error || 'Validation failed');
        setValidating(false);
        return;
      }
    } catch {
      // If validation endpoint fails, proceed anyway — analyze endpoint has the same checks
    }
    setValidating(false);

    onSubmit(submittedAddress, chain, displayName.trim(), parseSocial());
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto flex flex-col gap-4">
      {/* Chain toggle */}
      <div className="flex bg-[#111111] border border-[#1F1F1F] rounded-xl p-1 w-fit mx-auto">
        {(['base', 'solana'] as Chain[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setChain(c);
              setError('');
              // Clear address + ENS state when switching chains
              setAddress('');
              setEnsResolved('');
              setEnsStatus('idle');
            }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 capitalize ${
              chain === c
                ? 'bg-white text-black'
                : 'text-[#6B6B6B] hover:text-white'
            }`}
          >
            {c === 'base' ? 'Base' : 'Solana'}
          </button>
        ))}
      </div>

      {/* Display name + wallet on one row-like section */}
      <div className="flex flex-col gap-3">
        <input
          type="text"
          value={displayName}
          onChange={(e) => { setDisplayName(e.target.value); setError(''); }}
          placeholder="Your name"
          disabled={isLoading}
          maxLength={20}
          autoComplete="off"
          className="w-full bg-[#111111] border border-[#1F1F1F] rounded-xl px-5 py-3.5 text-white text-base placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#333333] transition-colors disabled:opacity-50"
        />

        <input
          type="text"
          value={address}
          onChange={(e) => { setAddress(e.target.value); setError(''); }}
          placeholder={chain === 'base' ? '0x... or vitalik.eth' : 'GX4EM...7kJq'}
          disabled={isLoading}
          spellCheck={false}
          autoComplete="off"
          className="w-full bg-[#111111] border border-[#1F1F1F] rounded-xl px-5 py-3.5 text-white font-mono text-base placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#333333] transition-colors disabled:opacity-50"
        />

        {/* Safety reassurance — read-only analysis, no wallet connection */}
        <p className="text-[#6B6B6B] text-xs px-1 -mt-1 flex items-center gap-1.5">
          <svg
            className="h-3 w-3 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Read-only analysis · we never ask you to sign or approve anything
        </p>

        {/* ENS resolution feedback — only shown when the current input looks like ENS */}
        {chain === 'base' && looksLikeEns(address.trim()) && ensStatus !== 'idle' && (
          <div className="px-1 -mt-1">
            {ensStatus === 'resolving' && (
              <p className="text-[#6B6B6B] text-sm flex items-center gap-1.5">
                <svg
                  className="animate-spin h-3 w-3 shrink-0"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Resolving…
              </p>
            )}
            {ensStatus === 'resolved' && ensResolved && (
              <p className="text-[#00FF87] text-sm font-mono opacity-80">
                → {ensResolved.slice(0, 6)}…{ensResolved.slice(-4)}
              </p>
            )}
            {ensStatus === 'not_found' && (
              <p className="text-[#FF3B30] text-sm">ENS name not found</p>
            )}
            {ensStatus === 'error' && (
              <p className="text-[#FF3B30] text-sm">Could not resolve ENS name</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex bg-[#111111] border border-[#1F1F1F] rounded-xl p-0.5 shrink-0">
            {([
              { key: 'x' as const, label: '𝕏' },
              { key: 'tg' as const, label: 'TG' },
              { key: 'email' as const, label: '@' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSocialType(key)}
                className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                  socialType === key
                    ? 'bg-[#1F1F1F] text-white'
                    : 'text-[#3A3A3A] hover:text-[#6B6B6B]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={socialField}
            onChange={(e) => setSocialField(e.target.value)}
            placeholder={
              socialType === 'x' ? '@handle (optional)'
                : socialType === 'tg' ? '@username (optional)'
                : 'email (optional)'
            }
            disabled={isLoading}
            autoComplete="off"
            className="flex-1 bg-[#111111] border border-[#1F1F1F] rounded-xl px-4 py-3.5 text-white text-sm placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#333333] transition-colors disabled:opacity-50"
          />
        </div>
      </div>

      {error && (
        <p className="text-[#FF3B30] text-sm px-1 -mt-1">{error}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading || validating}
        className="w-full bg-white text-black font-bold text-base py-4 rounded-xl hover:bg-[#E5E5E5] active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {validating ? 'Checking...' : isLoading ? 'Analyzing...' : 'See what you left on the table \u2192'}
      </button>
    </form>
  );
}
