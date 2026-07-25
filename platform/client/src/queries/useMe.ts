import { useQuery } from '@tanstack/react-query';

export type Role = 'admin' | 'government' | 'military' | 'spotter';

export type Me = { label: string; role: Role };

/** The logged-in session (label + role). Role gates which flow buttons, map layers,
 *  and tools render; the server enforces the same rules on every mutation, so this
 *  is presentation-only gating. While loading, consumers should render the most
 *  restricted view (role undefined → hide gated UI). */
export function useMe() {
  return useQuery<Me>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await fetch('/api/v1/auth/me', { credentials: 'include' });
      if (!res.ok) throw new Error('unauthenticated');
      return res.json();
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}
