import { createAgentkitClient } from '@worldcoin/agentkit';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { config } from '../config.js';
import { getPayoutAuthorization } from '../world/client.js';
import { claimAgentAddress } from '../world/claimAgent.js';

/**
 * AgentKit smoke — three callers, three outcomes (npm run agentkit:smoke):
 *
 *   1. bot        — bare fetch, never answers the 402 challenge  → NO payout
 *   2. impostor   — signs correctly with a fresh unregistered key → 403
 *                   not_human_backed (signature verified, AgentBook has nobody)
 *   3. claim-agent — AGENT_WALLET_KEY, registered in AgentBook (or listed in
 *                   the World service's AGENTKIT_DEV_BACKED_ADDRESSES while the
 *                   registration tap is pending) → signed authorization
 *
 * Target is config.world.baseUrl — override for a local run:
 *   WORLD_BASE_URL=http://localhost:3000 npm run agentkit:smoke
 */

const url = `${config.world.baseUrl}/api/authorize-payout`;

function claimBody(suffix: string): string {
  return JSON.stringify({
    engagementId: `agentkit-smoke-${suffix}-${Date.now()}`,
    tier: 3,
    nullifier: '0xsmoke-operator',
    amount: '100',
  });
}

const baseHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${config.world.serviceToken}`,
};

async function show(label: string, res: Response, expect: string): Promise<void> {
  const text = await res.text();
  let summary = text.slice(0, 200);
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    summary = JSON.stringify({
      authorized: json.authorized,
      error: json.error,
      agent: json.agent,
    });
  } catch {
    /* non-JSON body, keep raw slice */
  }
  console.log(`  status=${res.status} ${summary}`);
  console.log(`  expected: ${expect}\n`);
}

async function main(): Promise<void> {
  console.log(`AgentKit smoke against ${url}\n`);

  console.log('=== 1. bot (no AgentKit client — cannot answer the challenge) ===');
  const botRes = await fetch(url, { method: 'POST', headers: baseHeaders, body: claimBody('bot') });
  await show('bot', botRes, '402 agentkit_signature_required — and a bot stops here');

  console.log('=== 2. impostor agent (valid signature, fresh key, not in AgentBook) ===');
  const impostorKey = generatePrivateKey();
  const impostor = privateKeyToAccount(impostorKey);
  const impostorClient = createAgentkitClient({
    signer: {
      address: impostor.address,
      chainId: config.world.agentChainId,
      type: 'eip191',
      signMessage: (message) => impostor.signMessage({ message }),
    },
  });
  const impostorRes = await impostorClient.fetch(url, {
    method: 'POST',
    headers: baseHeaders,
    body: claimBody('impostor'),
  });
  await show('impostor', impostorRes, '403 not_human_backed — no human behind this agent');

  console.log('=== 3. claim-agent (AGENT_WALLET_KEY, via the real settle path) ===');
  const address = claimAgentAddress();
  if (!address) {
    console.log('  AGENT_WALLET_KEY not set — skipping the positive case.\n');
  } else {
    console.log(`  agent address: ${address}`);
    const pulled = await getPayoutAuthorization({
      engagementId: `agentkit-smoke-claim-${Date.now()}`,
      nullifier: '0xsmoke-operator',
      tier: 3,
    });
    if (pulled) {
      console.log(`  AUTHORIZED humanId=${pulled.authorization.humanId} sig=${pulled.signature.slice(0, 18)}…`);
      console.log('  expected: authorization when the address is AgentBook-registered or dev-stub listed\n');
    } else {
      console.log('  REFUSED (null) — agent not registered/listed, or World service unreachable\n');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
