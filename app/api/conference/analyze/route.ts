// app/api/conference/analyze/route.ts
// POST /api/conference/analyze — conference-mode wallet analysis with leaderboard.

// Allow up to 120s for heavy wallets (200+ Solana positions = many Codex batches)
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import type { AnalyzeRequest, AnalyzeErrorResponse, LeaderboardEntry } from '@/lib/types';
import { analyzeWalletConference } from '@/lib/analyze';
import { submitEntry, getRankByValue, getRankByPnL, isDisplayNameAvailable, getWalletOwner } from '@/lib/leaderboard';
import { ZerionRateLimitError, ZerionWhaleError } from '@/lib/zerion';

// Basic address format validation per chain.
// ENS names are resolved client-side (via /api/conference/resolve-ens) before submit.
// This route always receives a resolved 0x address for Base — never a raw ENS name.
function isValidAddress(address: string, chain: string): boolean {
  if (chain === 'base') {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
  }
  if (chain === 'solana') {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
  return false;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<AnalyzeErrorResponse>(
      { error: 'Invalid JSON body', code: 'API_ERROR' },
      { status: 400 },
    );
  }

  const { walletAddress, chain, displayName, socialTg, socialX, socialEmail } = body as Partial<AnalyzeRequest>;

  if (!walletAddress || typeof walletAddress !== 'string') {
    return NextResponse.json<AnalyzeErrorResponse>(
      { error: 'walletAddress is required', code: 'INVALID_ADDRESS' },
      { status: 400 },
    );
  }

  if (!displayName || typeof displayName !== 'string' || displayName.trim().length < 2) {
    return NextResponse.json<AnalyzeErrorResponse>(
      { error: 'Pick a name for the leaderboard (2+ characters)', code: 'INVALID_ADDRESS' },
      { status: 400 },
    );
  }

  if (chain !== 'base' && chain !== 'solana') {
    return NextResponse.json<AnalyzeErrorResponse>(
      { error: 'chain must be "base" or "solana"', code: 'INVALID_ADDRESS' },
      { status: 400 },
    );
  }

  if (!isValidAddress(walletAddress, chain)) {
    return NextResponse.json<AnalyzeErrorResponse>(
      { error: `Invalid ${chain} wallet address format`, code: 'INVALID_ADDRESS' },
      { status: 400 },
    );
  }

  if (!process.env.ZERION_API_KEY || !process.env.CODEX_API_KEY) {
    return NextResponse.json<AnalyzeErrorResponse>(
      {
        error: 'API keys not configured. Set ZERION_API_KEY and CODEX_API_KEY in .env.local',
        code: 'MISSING_API_KEY',
      },
      { status: 500 },
    );
  }

  try {
    // Normalize: lowercase EVM addresses for consistent storage, preserve Solana case
    const address = chain === 'solana' ? walletAddress.trim() : walletAddress.trim().toLowerCase();
    const name = displayName.trim();

    // Check if wallet is already claimed by someone else
    const existingOwner = await getWalletOwner(address, chain);
    if (existingOwner && existingOwner.toLowerCase() !== name.toLowerCase()) {
      return NextResponse.json<AnalyzeErrorResponse>(
        { error: `This wallet is already claimed by "${existingOwner}"`, code: 'NAME_TAKEN' },
        { status: 409 },
      );
    }

    // Check display name availability (globally unique)
    const nameAvailable = await isDisplayNameAvailable(name, address);
    if (!nameAvailable) {
      return NextResponse.json<AnalyzeErrorResponse>(
        { error: `"${name}" is already taken — pick another name`, code: 'NAME_TAKEN' },
        { status: 409 },
      );
    }

    // Run fresh analysis
    const result = await analyzeWalletConference(address, chain);

    // Save to leaderboard if we have any meaningful results:
    // - hasMlot: wallet left money on the table (TP would have helped)
    // - hasPnl: wallet has non-trivial realPnL even if MLOT=0 (good/bad traders, both interesting)
    let rank: number | null = null;
    const hasMlot = result.analyzedTrades > 0 && result.moneyLeftOnTable > 0.01;
    const hasPnl  = result.analyzedTrades > 0 && Math.abs(result.realPnL) > 100 && !hasMlot;
    const hasResults = hasMlot || hasPnl;

    if (hasResults) {
      const entry: LeaderboardEntry = {
        id: '',
        walletAddress: result.walletAddress,
        chain: result.chain,
        realPnL: result.realPnL,
        tpPnL: result.tpPnL,
        moneyLeftOnTable: result.moneyLeftOnTable,
        optimalTp: result.optimalTp,
        analyzedTrades: result.analyzedTrades,
        totalTrades: result.totalTrades,
        displayName: name,
        socialTg: socialTg?.trim() || undefined,
        socialX: socialX?.trim() || undefined,
        socialEmail: socialEmail?.trim() || undefined,
        analyzedAt: result.fetchedAt,
      };
      await submitEntry(entry);

      try {
        if (hasMlot) {
          rank = await getRankByValue(result.moneyLeftOnTable);
        } else if (result.realPnL > 0) {
          // Positive PnL wallets get a rank on the P&L board
          rank = await getRankByPnL(result.realPnL);
        }
        // Negative PnL wallets: no rank shown (they can surface themselves via Amount ↑ sort)
      } catch {
        // rank is best-effort
      }
    }

    return NextResponse.json({ ...result, rank });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[conference/analyze] Error:', message);

    if (err instanceof ZerionWhaleError) {
      return NextResponse.json<AnalyzeErrorResponse>(
        {
          error: 'WHALE_ALERT',
          code: 'API_ERROR',
        },
        { status: 422 },
      );
    }

    if (err instanceof ZerionRateLimitError) {
      const seconds = err.retryAfterSeconds;
      const humanWait = seconds > 3600
        ? `~${Math.ceil(seconds / 3600)} hours`
        : seconds > 60
          ? `~${Math.ceil(seconds / 60)} minutes`
          : `${seconds} seconds`;
      return NextResponse.json<AnalyzeErrorResponse>(
        {
          error: `Daily data quota reached. Resets in ${humanWait} — try again then.`,
          code: 'RATE_LIMITED',
        },
        { status: 429 },
      );
    }

    if (message.includes('No trades') || message.includes('no swap')) {
      return NextResponse.json<AnalyzeErrorResponse>(
        { error: message, code: 'NO_TRADES' },
        { status: 404 },
      );
    }

    // Network/timeout errors from server-side Zerion fetch — give a clear user message
    // rather than leaking the raw "fetch failed" Node.js error string.
    if (message === 'fetch failed' || message.includes('Zerion request failed')) {
      return NextResponse.json<AnalyzeErrorResponse>(
        { error: 'The analysis is taking longer than expected — please try again in a moment.', code: 'API_ERROR' },
        { status: 503 },
      );
    }

    return NextResponse.json<AnalyzeErrorResponse>(
      { error: message, code: 'API_ERROR' },
      { status: 500 },
    );
  }
}
