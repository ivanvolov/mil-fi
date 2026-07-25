import { useMemo } from 'react';
import { useUiStore } from '../stores/uiStore';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import { allocate } from '@algos/orchestration/orchestration';

export type OrchestrationFocus = {
  threatId: string;
  launcherIds: Set<string>;
  teamIds: Set<string>;
};

/** Returns the currently-focused threat + its assigned launchers/teams when the operator is
 *  in the bulk orchestration panel with a threat selected. Layers use this to hide every
 *  entity that isn't the focused threat or one of its assigned launchers/crews.
 *
 *  `launcherIds` are the WTA allocator's picks for this threat (PRI + BKP-N + MFG) —
 *  operationally assigned launchers, not merely capable of engaging. */
export function useOrchestrationFocus(data: LayerFull): OrchestrationFocus | null {
  const bulkOrchestrate = useUiStore((s) => s.bulkOrchestrate);
  const selection = useUiStore((s) => s.selection);

  return useMemo(() => {
    if (!bulkOrchestrate || selection?.kind !== 'threat') return null;
    const threatId = selection.id;
    if (!data.threats.some((t) => t._id === threatId)) return null;

    const typesById = new Map<string, InterceptorType>(
      data.types.interceptor.map((t) => [t._id, t]),
    );
    const assignments = allocate(data.threats, data.interceptors, typesById).get(threatId) ?? [];
    const launcherIds = new Set<string>(assignments.map((a) => a.launcher._id));
    const teamIds = new Set<string>();
    for (const th of data.threads) {
      if (launcherIds.has(th.interceptorId)) teamIds.add(th.teamId);
    }
    return { threatId, launcherIds, teamIds };
  }, [bulkOrchestrate, selection, data]);
}
