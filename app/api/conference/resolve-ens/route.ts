// app/api/conference/resolve-ens/route.ts
// GET /api/conference/resolve-ens?name=vitalik.eth
// Resolves an ENS name to a checksummed 0x address.
// Server-side only — keeps the Ethereum RPC call out of the client bundle.

import { NextRequest, NextResponse } from 'next/server';
import { resolveEns, looksLikeEns } from '@/lib/ens';

export interface EnsResolveResponse {
  name: string;
  address: string | null;
  error?: 'not_found' | 'invalid_name' | 'resolution_failed';
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const name = req.nextUrl.searchParams.get('name')?.trim() ?? '';

  if (!name) {
    return NextResponse.json<EnsResolveResponse>(
      { name: '', address: null, error: 'invalid_name' },
      { status: 400 },
    );
  }

  if (!looksLikeEns(name)) {
    return NextResponse.json<EnsResolveResponse>(
      { name, address: null, error: 'invalid_name' },
      { status: 400 },
    );
  }

  const address = await resolveEns(name);

  if (address === null) {
    return NextResponse.json<EnsResolveResponse>(
      { name, address: null, error: 'not_found' },
      { status: 404 },
    );
  }

  return NextResponse.json<EnsResolveResponse>({ name, address });
}
