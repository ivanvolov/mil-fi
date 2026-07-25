import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { Interceptor } from '@shared/schemas/interceptor';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import type { Thread } from '@shared/schemas/thread';
import type { LayerFull } from '@shared/schemas/layer-full';
import { useUiStore } from '../../../stores/uiStore';
import { useOrchestrationFocus } from '../../../lib/orchestrationFocus';

const COLORS: Record<string, string> = {
  interceptor: '#06b6d4',
  mfg: '#f59e0b',
  manpads: '#a78bfa',
};

export function CoverageLayer({
  interceptors,
  typesById,
  threads,
  data,
}: {
  interceptors: Interceptor[];
  typesById: Map<string, InterceptorType>;
  threads: Thread[];
  data: LayerFull;
}) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const selections = useUiStore((s) => s.selections);
  const coverageOn = useUiStore((s) => s.visibility.coverage);

  // In bulk orchestration focus mode, rings collapse to just the launchers assigned to
  // the focused threat — matches the launchers that stay visible.
  const focus = useOrchestrationFocus(data);

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;
    group.clearLayers();

    if (!coverageOn) return;

    // Rings render only for an explicit context: bulk-orchestration focus shows just the
    // launchers assigned to the focused threat; otherwise the union over every selected
    // entity — a selected launcher's own ring, a selected crew's launchers' rings
    // (multi-select, #21). No selection → nothing (no default show-all fallback, #20).
    let visibleIds: Set<string>;
    if (focus) {
      visibleIds = focus.launcherIds;
    } else {
      visibleIds = new Set();
      for (const sel of selections) {
        if (sel.kind === 'interceptor') {
          visibleIds.add(sel.id);
        } else if (sel.kind === 'team') {
          for (const th of threads) if (th.teamId === sel.id) visibleIds.add(th.interceptorId);
        }
      }
    }
    if (visibleIds.size === 0) return;

    for (const i of interceptors) {
      if (!visibleIds.has(i._id)) continue;
      const t = typesById.get(i.typeId);
      if (!t) continue;
      const color = COLORS[t.category] ?? '#06b6d4';
      L.circle([i.position.lat, i.position.lng], {
        radius: t.envelope.rangeKm * 1000,
        color,
        weight: 1.4,
        opacity: 0.95,
        fillColor: color,
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(group);
    }
  }, [interceptors, typesById, threads, selections, coverageOn, map, focus]);

  useEffect(() => {
    return () => {
      if (groupRef.current) { map.removeLayer(groupRef.current); groupRef.current = null; }
    };
  }, [map]);

  return null;
}
