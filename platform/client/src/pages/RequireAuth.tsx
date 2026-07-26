import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../queries/useMe';
import { WorldVerifyGate } from '../components/auth/WorldVerifyGate';

export function RequireAuth({ children }: { children: ReactNode }) {
  const meQ = useMe();
  const [skipped, setSkipped] = useState(false);

  if (meQ.isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#0d1117] text-[#8b949e] text-sm">
        Loading…
      </div>
    );
  }

  if (meQ.isError || !meQ.data) return <Navigate to="/login" replace />;

  // World ID is the status system, not a login step: the credential you complete
  // (Selfie/Passport/Orb) is your clearance. Always on offer to every role except
  // admin — no persisted "already asked" memory, so it's there every time you land
  // here. "Continue with current status" just lets you through for this view; actions
  // above your status (like payout authorization) are still refused.
  if (meQ.data.role !== 'admin' && !meQ.data.worldVerified && !skipped) {
    return <WorldVerifyGate onSkip={() => setSkipped(true)} />;
  }

  return <>{children}</>;
}
