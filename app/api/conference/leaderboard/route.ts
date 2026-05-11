// app/api/conference/leaderboard/route.ts
// GET /api/conference/leaderboard — paginated, sorted leaderboard.

import { NextRequest, NextResponse } from 'next/server';
import type { AnalyzeErrorResponse, LeaderboardSort } from '@/lib/types';
import { getLeaderboard } from '@/lib/leaderboard';

const VALID_SORTS: LeaderboardSort[] = ['moneyLeftOnTable', 'realPnL', 'tpPnL'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;

  const sortParam = searchParams.get('sort') ?? 'moneyLeftOnTable';
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');

  // Validate sort
  if (!VALID_SORTS.includes(sortParam as LeaderboardSort)) {
    return NextResponse.json<AnalyzeErrorResponse>(
      {
        error: `sort must be one of: ${VALID_SORTS.join(', ')}`,
        code: 'API_ERROR',
      },
      { status: 400 },
    );
  }

  const sort = sortParam as LeaderboardSort;
  const limit = Math.min(Math.max(1, Number(limitParam) || DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, Number(offsetParam) || 0);
  const mlotOnly = searchParams.get('mlotOnly') === 'true';

  try {
    const data = await getLeaderboard(sort, limit, offset, mlotOnly);

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=10' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[conference/leaderboard] Error:', message);

    return NextResponse.json<AnalyzeErrorResponse>(
      { error: message, code: 'API_ERROR' },
      { status: 500 },
    );
  }
}
