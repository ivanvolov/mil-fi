import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function useLayerFull(slug: string) {
  return useQuery({
    queryKey: ['layer-full', slug],
    queryFn: () => api.getLayerFull(slug),
  });
}
