import { NextResponse } from 'next/server';
import { signerAddress } from '../../../lib/authz';

export const runtime = 'nodejs';

/**
 * Convenience: expose the payout-authorization signer's public address so it can
 * be copied into the platform's WORLD_SIGNER_ADDRESS. No secret is revealed.
 */
export async function GET() {
  const addr = signerAddress();
  return NextResponse.json({ signerAddress: addr, configured: Boolean(addr) });
}
