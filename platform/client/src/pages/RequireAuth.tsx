import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

type AuthState = 'pending' | 'authed' | 'anon';

export function RequireAuth({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('pending');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/auth/me', { credentials: 'include' })
      .then((res) => {
        if (cancelled) return;
        setState(res.ok ? 'authed' : 'anon');
      })
      .catch(() => {
        if (!cancelled) setState('anon');
      });
    return () => { cancelled = true; };
  }, []);

  if (state === 'pending') {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#0d1117] text-[#8b949e] text-sm">
        Loading…
      </div>
    );
  }
  if (state === 'anon') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
