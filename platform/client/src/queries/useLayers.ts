import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/** Sector layers only (kind='sector' + legacy rows with no discriminator).
 *  Kept named `useLayers` for backwards compat with every sector call site. */
export function useLayers() {
  return useQuery({
    queryKey: ['layers', 'sector'],
    queryFn: () => api.getLayers({ kind: 'sector' }),
  });
}
