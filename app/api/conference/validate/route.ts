// app/api/conference/validate/route.ts
// POST /api/conference/validate — pre-flight check for display name + wallet availability.
// Fast (no analysis) — called before the full analyze endpoint.

import { NextRequest, NextResponse } from 'next/server';
import { isDisplayNameAvailable, getWalletOwner } from '@/lib/leaderboard';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { walletAddress, chain, displayName } = body as {
    walletAddress?: string;
    chain?: string;
    displayName?: string;
  };

  if (!displayName || !walletAddress || !chain) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const name = displayName.trim();
  const address = chain === 'solana' ? walletAddress.trim() : walletAddress.trim().toLowerCase();

  // Check if wallet is already claimed by someone else
  const existingOwner = await getWalletOwner(address, chain);
  if (existingOwner && existingOwner.toLowerCase() !== name.toLowerCase()) {
    return NextResponse.json({
      valid: false,
      error: `This wallet is already claimed by "${existingOwner}"`,
    });
  }

  // Check display name availability
  const nameAvailable = await isDisplayNameAvailable(name, address);
  if (!nameAvailable) {
    return NextResponse.json({
      valid: false,
      error: `"${name}" is already taken — pick another name`,
    });
  }

  return NextResponse.json({ valid: true });
}
