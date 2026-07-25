import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { LatLng } from '@shared/schemas/common';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import { useUiStore } from '../../../stores/uiStore';
import { allocate } from '@algos/orchestration/orchestration';

const LINK_COLOR = '#15803d'; // tailwind green-700
const THREAT_COLOR = '#ef4444'; // matches threatGlyphHtml red

type Link = { threatId: string; interceptPoint?: LatLng };

/** Predicted-intercept marker: same red as the live threat glyph but unfilled (hollow
 *  triangle) and wrapped in a dashed red square so it reads as "future state of the
 *  threat" rather than the threat itself. */
const interceptIcon = L.divIcon({
  className: 'hoc-intercept-marker',
  html: `<svg width="20" height="20" viewBox="0 0 20 20">
    <rect x="1" y="1" width="18" height="18" fill="none" stroke="${THREAT_COLOR}" stroke-width="1" stroke-dasharray="3 2"/>
    <path d="M10 4 L16 16 L4 16 Z" fill="none" stroke="${THREAT_COLOR}" stroke-width="1.4"/>
  </svg>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/** Draws a dark-green dashed line from the selected launcher to every threat the WTA
 *  allocator assigned it to, plus a solid line + green shahed icon at the predicted
 *  intercept point. Active in bulk orchestration only. MFG launchers are skipped —
 *  they don't fly to intercept, they fire upward into the ring as the threat passes
 *  through. Nothing renders when bulk orchestration is off. */
export function AssignmentLinkLayer({ data }: { data: LayerFull }) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const selection = useUiStore((s) => s.selection);
  const bulkOrchestrate = useUiStore((s) => s.bulkOrchestrate);

  const typesById = useMemo(() => {
    const m = new Map<string, InterceptorType>();
    for (const t of data.types.interceptor) m.set(t._id, t);
    return m;
  }, [data.types.interceptor]);

  const links = useMemo<Link[]>(() => {
    if (selection?.kind !== 'interceptor') return [];
    if (!bulkOrchestrate) return [];
    const launcher = data.interceptors.find((i) => i._id === selection.id);
    if (!launcher) return [];
    const type = typesById.get(launcher.typeId);
    // MFGs don't fly to intercept — no link line, no intercept marker.
    if (type?.category === 'mfg') return [];

    const assignments = allocate(data.threats, data.interceptors, typesById);
    const out: Link[] = [];
    for (const list of assignments.values()) {
      for (const a of list) {
        if (a.launcher._id === launcher._id) {
          out.push({ threatId: a.threatId, interceptPoint: a.interceptPoint });
        }
      }
    }
    return out;
  }, [selection, bulkOrchestrate, data, typesById]);

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;
    group.clearLayers();

    if (selection?.kind !== 'interceptor' || links.length === 0) return;
    const launcher = data.interceptors.find((i) => i._id === selection.id);
    if (!launcher) return;

    for (const link of links) {
      const t = data.threats.find((x) => x._id === link.threatId);
      if (!t) continue;
      // Dashed line: launcher → current threat position (asset assignment).
      L.polyline(
        [[launcher.position.lat, launcher.position.lng], [t.position.lat, t.position.lng]],
        { color: LINK_COLOR, weight: 2, opacity: 0.6, dashArray: '6 4', interactive: false },
      ).addTo(group);
      // Solid line + marker: launcher → predicted intercept point (physics).
      if (link.interceptPoint) {
        L.polyline(
          [
            [launcher.position.lat, launcher.position.lng],
            [link.interceptPoint.lat, link.interceptPoint.lng],
          ],
          { color: LINK_COLOR, weight: 2, opacity: 0.95, interactive: false },
        ).addTo(group);
        L.marker([link.interceptPoint.lat, link.interceptPoint.lng], {
          icon: interceptIcon,
          interactive: false,
        }).addTo(group);
      }
    }
  }, [map, selection, links, data.interceptors, data.threats]);

  useEffect(() => {
    return () => {
      if (groupRef.current) { map.removeLayer(groupRef.current); groupRef.current = null; }
    };
  }, [map]);

  return null;
}
