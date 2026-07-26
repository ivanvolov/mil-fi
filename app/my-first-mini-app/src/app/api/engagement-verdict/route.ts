import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Interface 3 — receive the 0G engagement verdict from the platform. When both
 * threatConfirmed and killConfirmed are true, the operator's agent is allowed to
 * pull a payout authorization. We only record the verdict; imagery + judging stay
 * on the platform side. Guarded by the shared service token when configured.
 */
export async function POST(req: NextRequest) {
  const token = process.env.WORLD_SERVICE_TOKEN;
  if (token) {
    if (req.headers.get('authorization') !== `Bearer ${token}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const body = (await req.json().catch(() => null)) as {
    engagementId?: string;
    threatConfirmed?: boolean;
    killConfirmed?: boolean;
  } | null;

  if (!body?.engagementId) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  // TODO: persist so authorize-payout can require both flags true for this engagement.
  return NextResponse.json({
    ok: true,
    engagementId: body.engagementId,
    threatConfirmed: !!body.threatConfirmed,
    killConfirmed: !!body.killConfirmed,
  });
}
