import { useQuery } from '@tanstack/react-query';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import type { ThreatType } from '@shared/schemas/threat-type';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

export function useInterceptorTypes() {
  return useQuery({
    queryKey: ['types', 'interceptor'],
    queryFn: () => fetchJson<InterceptorType[]>('/api/v1/types/interceptors'),
  });
}

export function useThreatTypes() {
  return useQuery({
    queryKey: ['types', 'threat'],
    queryFn: () => fetchJson<ThreatType[]>('/api/v1/types/threats'),
  });
}
