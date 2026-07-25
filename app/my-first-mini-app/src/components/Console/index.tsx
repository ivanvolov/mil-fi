'use client';

import {
  any,
  CredentialRequest,
  IDKitRequestWidget,
  type IDKitResult,
  type RpContext,
} from '@worldcoin/idkit';
import { useCallback, useState } from 'react';

/**
 * The three ways an operator may prove themselves, offered as a single OR
 * constraint.
 *
 * `any()` is what makes World App present the choice ITSELF after the scan — we
 * do not build a chooser. Note this forces the 4.0 `CredentialRequest` API rather
 * than the `*Legacy` presets: presets go through `.preset()` and carry exactly one
 * credential, so they cannot express "any of these three".
 *
 * Order here is effort-ascending. It is not a ranking of the person.
 */
const VERIFICATION_OPTIONS = any(
  CredentialRequest('selfie'),
  CredentialRequest('passport'),
  CredentialRequest('proof_of_human'),
);

/** Matches the action registered in the Developer Portal. */
const ACTION = 'test-action';

type Phase =
  | { name: 'idle' }
  | { name: 'preparing' }
  | { name: 'scanning'; rpContext: RpContext }
  | { name: 'verifying' }
  | { name: 'done'; profile: unknown }
  | { name: 'error'; message: string };

export const Console = () => {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });

  /**
   * The RP signature is fetched from our own backend rather than assembled here:
   * signing needs `RP_SIGNING_KEY`, which must never reach the browser.
   */
  const startLogin = useCallback(async () => {
    setPhase({ name: 'preparing' });
    try {
      const response = await fetch('/api/rp-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: ACTION }),
      });

      if (!response.ok) {
        throw new Error(`RP signature request failed (${response.status})`);
      }

      const signed = await response.json();
      setPhase({
        name: 'scanning',
        rpContext: {
          rp_id: signed.rp_id,
          nonce: signed.nonce,
          created_at: signed.created_at,
          expires_at: signed.expires_at,
          signature: signed.sig,
        },
      });
    } catch (error) {
      setPhase({
        name: 'error',
        message: error instanceof Error ? error.message : 'Could not start login',
      });
    }
  }, []);

  /**
   * Runs once World App reports success. The proof is still untrusted at this
   * point — it is the SERVER's verification that decides anything, which is why
   * the result is posted to /api/verify-proof rather than read directly.
   *
   * Wired in sub-batch 3b/3c; for 3a it only has to prove the QR round-trips.
   */
  const onSuccess = useCallback(async (result: IDKitResult) => {
    setPhase({ name: 'verifying' });
    try {
      const response = await fetch('/api/console-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idkitResponse: result }),
      });

      const profile = await response.json();

      if (!response.ok) {
        throw new Error(profile?.error ?? 'Verification rejected');
      }

      setPhase({ name: 'done', profile });
    } catch (error) {
      setPhase({
        name: 'error',
        message:
          error instanceof Error ? error.message : 'Verification failed',
      });
    }
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">MilFi Console</h1>
        <p className="mt-1 text-sm text-gray-500">
          Sign in with World ID to see your clearance.
        </p>
      </header>

      {phase.name === 'idle' && (
        <button
          type="button"
          onClick={startLogin}
          className="w-fit rounded-full bg-gray-900 px-6 py-3 font-medium text-white"
        >
          Log in with World ID
        </button>
      )}

      {phase.name === 'preparing' && (
        <p className="text-sm text-gray-500">Preparing your sign-in request…</p>
      )}

      {phase.name === 'scanning' && (
        <>
          <p className="text-sm text-gray-500">
            Scan with your phone, then choose how you want to verify.
          </p>
          <IDKitRequestWidget
            open
            onOpenChange={(open) => {
              if (!open) setPhase({ name: 'idle' });
            }}
            app_id={process.env.NEXT_PUBLIC_APP_ID as `app_${string}`}
            action={ACTION}
            rp_context={phase.rpContext}
            constraints={VERIFICATION_OPTIONS}
            // Accept v3 proofs too: operators may hold older credentials, and
            // rejecting them would look like a broken app rather than a policy.
            allow_legacy_proofs
            onSuccess={onSuccess}
            onError={(code) =>
              setPhase({ name: 'error', message: `World ID error: ${code}` })
            }
          />
        </>
      )}

      {phase.name === 'verifying' && (
        <p className="text-sm text-gray-500">Verifying your proof…</p>
      )}

      {phase.name === 'done' && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">What we know about you</h2>
          <pre className="overflow-x-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-900">
            {JSON.stringify(phase.profile, null, 2)}
          </pre>
        </section>
      )}

      {phase.name === 'error' && (
        <section className="flex flex-col items-start gap-3">
          <p className="text-sm text-red-600">{phase.message}</p>
          <button
            type="button"
            onClick={() => setPhase({ name: 'idle' })}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm"
          >
            Try again
          </button>
        </section>
      )}
    </main>
  );
};
