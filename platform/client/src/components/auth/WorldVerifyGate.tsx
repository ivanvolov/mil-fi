import {
  any,
  CredentialRequest,
  IDKitRequestWidget,
  type IDKitResult,
  type RpContext,
} from '@worldcoin/idkit';
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * One-time World ID identity confirmation, shown once per account (never for admin)
 * right after password login. Not a login step — see server/src/auth/worldVerify.ts.
 * `any()` lets World App present the choice of Selfie / Passport / Orb itself after
 * the scan; we don't build a custom chooser. Ported from the proven flow in
 * app/my-first-mini-app/src/components/Console/index.tsx.
 */
const VERIFICATION_OPTIONS = any(
  CredentialRequest('selfie'),
  CredentialRequest('passport'),
  CredentialRequest('proof_of_human'),
);

/** Must match WORLD_ACTION in server/src/auth/worldVerify.ts. */
const ACTION = 'test-action';

const WORLD_APP_ID = import.meta.env.VITE_WORLD_APP_ID as `app_${string}` | undefined;

type Phase =
  | { name: 'idle' }
  | { name: 'preparing' }
  | { name: 'scanning'; rpContext: RpContext }
  | { name: 'verifying' }
  | { name: 'error'; message: string };

export function WorldVerifyGate() {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const queryClient = useQueryClient();

  const startVerification = useCallback(async () => {
    setPhase({ name: 'preparing' });
    try {
      const response = await fetch('/api/v1/auth/world/rp-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(`Could not start verification (${response.status})`);

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
        message: error instanceof Error ? error.message : 'Could not start verification',
      });
    }
  }, []);

  const onSuccess = useCallback(
    async (result: IDKitResult) => {
      setPhase({ name: 'verifying' });
      try {
        const response = await fetch('/api/v1/auth/world/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ idkitResponse: result }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? 'Verification rejected');

        // Re-fetch /auth/me — RequireAuth re-renders once worldVerified flips true.
        await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      } catch (error) {
        setPhase({
          name: 'error',
          message: error instanceof Error ? error.message : 'Verification failed',
        });
      }
    },
    [queryClient],
  );

  return (
    <div className="min-h-full flex items-center justify-center bg-[#0d1117] text-[#e7e9ea] p-6">
      <div className="w-full max-w-md bg-[#161b22] border border-[#21262d] rounded-lg p-6 shadow-lg flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold mb-1">One-time identity check</h1>
          <p className="text-sm text-[#8b949e]">
            Confirm your clearance with World ID — this only happens once. Scan the QR
            with World App, then complete whichever method it offers you (Selfie,
            Passport, or Orb).
          </p>
        </div>

        {phase.name === 'idle' && (
          <button
            type="button"
            onClick={startVerification}
            disabled={!WORLD_APP_ID}
            className="w-fit rounded-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-[#21262d] disabled:text-[#8b949e] disabled:cursor-not-allowed text-white font-medium px-6 py-3 transition"
          >
            Verify with World ID
          </button>
        )}

        {!WORLD_APP_ID && (
          <p className="text-xs text-red-400">
            VITE_WORLD_APP_ID is not configured — verification cannot start.
          </p>
        )}

        {phase.name === 'preparing' && (
          <p className="text-sm text-[#8b949e]">Preparing your verification request…</p>
        )}

        {phase.name === 'scanning' && WORLD_APP_ID && (
          <>
            <p className="text-sm text-[#8b949e]">
              Scan with your phone, then choose how you want to verify.
            </p>
            <IDKitRequestWidget
              open
              onOpenChange={(open) => {
                if (!open) setPhase({ name: 'idle' });
              }}
              app_id={WORLD_APP_ID}
              action={ACTION}
              rp_context={phase.rpContext}
              constraints={VERIFICATION_OPTIONS}
              allow_legacy_proofs
              // Staging adds a "use the simulator" link (simulator.worldcoin.org), so this
              // is testable without a physical Orb/passport.
              environment="staging"
              onSuccess={onSuccess}
              onError={(code) =>
                setPhase({ name: 'error', message: `World ID error: ${code}` })
              }
            />
          </>
        )}

        {phase.name === 'verifying' && (
          <p className="text-sm text-[#8b949e]">Verifying your proof…</p>
        )}

        {phase.name === 'error' && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-red-400">{phase.message}</p>
            <button
              type="button"
              onClick={() => setPhase({ name: 'idle' })}
              className="rounded-full border border-[#30363d] px-4 py-2 text-sm"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
