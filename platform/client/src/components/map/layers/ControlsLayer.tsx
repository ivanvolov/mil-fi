import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { Interceptor } from '@shared/schemas/interceptor';
import type { Team } from '@shared/schemas/team';
import type { Thread } from '@shared/schemas/thread';
import { useUiStore } from '../../../stores/uiStore';

export function ControlsLayer({
  threads,
  interceptors,
  teams,
}: {
  threads: Thread[];
  interceptors: Interceptor[];
  teams: Team[];
}) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const selections = useUiStore((s) => s.selections);
  const bulkOrchestrate = useUiStore((s) => s.bulkOrchestrate);

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;
    group.clearLayers();

    const iById = new Map(interceptors.map((i) => [i._id, i] as const));
    const tById = new Map(teams.map((t) => [t._id, t] as const));

    // Filter threads by selection, unioned across the (multi-)selection: launcher → its
    // threads, crew → its threads, threat/drawing → none. Selecting a threat used to
    // light up the WHOLE mesh, which read as the threat activating a crew's control
    // lines whenever their display codes collided (#24) — a threat's visuals are its
    // own geometry, not the command structure.
    // Bulk orchestration → none (focus stays on candidate launchers), no selection →
    // none (was "show all", but the full thread mesh is too busy).
    let visible: typeof threads;
    if (bulkOrchestrate) {
      visible = [];
    } else {
      const launcherIds = new Set(selections.filter((sel) => sel.kind === 'interceptor').map((sel) => sel.id));
      const teamIds = new Set(selections.filter((sel) => sel.kind === 'team').map((sel) => sel.id));
      visible = threads.filter((th) => launcherIds.has(th.interceptorId) || teamIds.has(th.teamId));
    }

    for (const th of visible) {
      const i = iById.get(th.interceptorId);
      const tm = tById.get(th.teamId);
      if (!i || !tm) continue;
      L.polyline(
        [
          [tm.position.lat, tm.position.lng],
          [i.position.lat, i.position.lng],
        ],
        {
          color: '#06b6d4',
          weight: 1,
          opacity: th.kind === 'override' ? 0.7 : 0.55,
          dashArray: th.kind === 'override' ? '5 4' : undefined,
          interactive: false,
        },
      ).addTo(group);
    }
  }, [threads, interceptors, teams, map, selections, bulkOrchestrate]);

  useEffect(() => {
    return () => {
      if (groupRef.current) { map.removeLayer(groupRef.current); groupRef.current = null; }
    };
  }, [map]);

  return null;
}
