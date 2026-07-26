import { createAgentkitClient, type AgentkitClient, type AgentkitFetchEvent } from '@worldcoin/agentkit';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../config.js';

/**
 * The unit's claim-agent identity (World AgentKit).
 *
 * The agent holds one EVM key — its identity anchor, registered once in
 * AgentBook on World Chain via `npx @worldcoin/agentkit-cli register <address>`
 * (a human approves that registration in World App; docs/06-agentkit.md). It
 * never holds funds: payouts stay on Hedera. The key only signs the SIWE
 * challenge the World service issues on `/api/authorize-payout`, proving the
 * claim comes from a registered, human-backed agent rather than a bot.
 *
 * With no AGENT_WALLET_KEY configured this returns null and the claim call
 * falls back to a bare fetch — which the World service answers with 402/403.
 * That is not a soft failure, it IS the negative case: unidentified caller,
 * no authorization, no payout.
 */

let cached: AgentkitClient | null | undefined;

export function claimAgentClient(): AgentkitClient | null {
  if (cached !== undefined) return cached;
  const key = config.world.agentWalletKey;
  if (!key) {
    cached = null;
    return cached;
  }
  const account = privateKeyToAccount((key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`);
  cached = createAgentkitClient({
    signer: {
      address: account.address,
      chainId: config.world.agentChainId,
      type: 'eip191',
      signMessage: (message) => account.signMessage({ message }),
    },
    onEvent: (event: AgentkitFetchEvent) => {
      console.log(`[claim-agent] ${event.type}`, 'url' in event ? event.url : '');
    },
  });
  return cached;
}

/** Public address of the claim-agent — the one to register in AgentBook. */
export function claimAgentAddress(): string | null {
  const key = config.world.agentWalletKey;
  if (!key) return null;
  return privateKeyToAccount((key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`).address;
}
