/** HashScan (Hedera explorer) link helpers — testnet, matching the live deployment. */

const HASHSCAN_BASE = 'https://hashscan.io/testnet';

export type HashscanKind = 'token' | 'topic' | 'account' | 'transaction';

/** SDK transaction ids come back as `0.0.x@sec.nanos`; HashScan wants `0.0.x-sec-nanos`. */
export function normalizeTxId(txId: string): string {
  const at = txId.indexOf('@');
  if (at === -1) return txId;
  return txId.slice(0, at) + '-' + txId.slice(at + 1).replace(/\./g, '-');
}

export function hashscanUrl(kind: HashscanKind, id: string): string {
  const path = kind === 'transaction' ? normalizeTxId(id) : id;
  return `${HASHSCAN_BASE}/${kind}/${path}`;
}
