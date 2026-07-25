import { Console } from '@/components/Console';

/**
 * Desktop web console.
 *
 * NOT a Mini App screen — this runs in a normal browser on a laptop. The operator
 * logs in here by scanning a World ID QR with their phone, completing verification
 * in World App, and watching this page resolve what we know about them.
 *
 * Deliberately outside the `(protected)` route group: the whole point is that a
 * logged-out visitor can reach it and authenticate by scanning.
 */
export default function ConsolePage() {
  return <Console />;
}
