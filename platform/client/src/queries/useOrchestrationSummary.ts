import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import type {
  OrchestrationSummaryRequest,
  OrchestrationSummaryResponse,
} from '@shared/schemas/ai-orchestration-summary';

async function postSummary(body: OrchestrationSummaryRequest): Promise<OrchestrationSummaryResponse> {
  const res = await fetch('/api/v1/ai/orchestration-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      parsed?.code ?? 'ERROR',
      parsed?.message ?? 'AI request failed',
      parsed,
    );
  }
  return parsed as OrchestrationSummaryResponse;
}

export function useOrchestrationSummary(input: OrchestrationSummaryRequest, enabled: boolean) {
  return useQuery({
    queryKey: ['ai', 'orchestration-summary', input],
    queryFn: () => postSummary(input),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
}
