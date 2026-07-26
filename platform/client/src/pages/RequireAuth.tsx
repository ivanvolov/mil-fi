import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../queries/useMe';
import { WorldVerifyGate } from '../components/auth/WorldVerifyGate';

export function RequireAuth({ children }: { children: ReactNode }) {
  const meQ = useMe();

  if (meQ.isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#0d1117] text-[#8b949e] text-sm">
        Loading…
      </div>
    );
  }

  if (meQ.isError || !meQ.data) return <Navigate to="/login" replace />;

  // World ID is a one-time clearance confirmation, not a login step — every role
  // except admin must complete it once before reaching the app.
  if (meQ.data.role !== 'admin' && !meQ.data.worldVerified) return <WorldVerifyGate />;

  return <>{children}</>;
}
