import { useMutation } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import type {
  AssetSuggestRequest,
  AssetSuggestResponse,
} from '@shared/schemas/ai-asset-suggest';

async function postAssetSuggest(body: AssetSuggestRequest): Promise<AssetSuggestResponse> {
  const res = await fetch('/api/v1/ai/asset-suggest', {
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
  return parsed as AssetSuggestResponse;
}

export function useAssetSuggest() {
  return useMutation({
    mutationFn: postAssetSuggest,
  });
}
