import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useParams } from 'react-router-dom';
import type { Interceptor } from '@shared/schemas/interceptor';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import type { Thread } from '@shared/schemas/thread';
import { useUiStore, isSelected } from '../../../stores/uiStore';
import { useUpdateInterceptorPosition } from '../../../queries/useMutations';
import { glyphHtml } from '../glyphs';
import type { LayerFull } from '@shared/schemas/layer-full';
import { useOrchestrationFocus } from '../../../lib/orchestrationFocus';

function stateText(i: Interceptor, t: InterceptorType | undefined) {
  if (!t) return i.state.toUpperCase();
  if (t.category === 'interceptor' || t.category === 'manpads') {
    if (i.state === 'reload' && i.ammo) return `RELOAD · ${i.ammo.reloadEtaSec ?? '?'}s`;
    if (i.ammo) return `READY · ${i.ammo.ready}/${i.ammo.capacity}`;
  }
  return i.state === 'reload' ? 'RELOAD' : 'READY';
}

function subtitle(t: InterceptorType | undefined): string {
  if (!t) return '';
  return t.displayName.split(/[\s(/]/)[0] ?? t.displayName;
}

export function InterceptorLayer({
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
  const selection = useUiStore((s) => s.selection);
  const selections = useUiStore((s) => s.selections);
  const setSelection = useUiStore((s) => s.setSelection);
  const editMode = useUiStore((s) => s.visibility.edit);
  const { slug = 'vzil-1' } = useParams();
  const { mutate: updatePos } = useUpdateInterceptorPosition(slug);

  const threadCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const th of threads) m.set(th.interceptorId, (m.get(th.interceptorId) ?? 0) + 1);
    return m;
  }, [threads]);

  // In bulk orchestration focus mode (a threat selected in the panel), only the launchers
  // the WTA allocator assigned to that threat are rendered — everything else is hidden.
  const focus = useOrchestrationFocus(data);

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;
    group.clearLayers();

    for (const i of interceptors) {
      if (focus && !focus.launcherIds.has(i._id)) continue;
      const t = typesById.get(i.typeId);
      const cat = t?.category ?? 'interceptor';
      const selected = isSelected(selections, 'interceptor', i._id);
      const needsCrew = t?.requiresCrew && (threadCounts.get(i._id) ?? 0) === 0;
      const klass = [
        'hoc-marker',
        selected ? 'selected' : '',
        needsCrew ? 'not-operational' : '',
      ].filter(Boolean).join(' ');

      const stateClass = i.state === 'reload' ? 'reload' : i.state === 'offline' ? 'offline' : '';
      const compactHtml = `
        <div class="marker-compact" data-id="${i._id}">
          ${glyphHtml(cat, 12)}
          <span class="id">${i.code}</span>
        </div>`;
      const fullHtml = `
        <div class="marker-full" data-id="${i._id}">
          <div class="marker-glyph">${glyphHtml(cat, 20)}</div>
          <div class="marker-label">
            <div class="id">${i.code}</div>
            <div class="sub">${subtitle(t)}</div>
            <div class="state ${stateClass}">${stateText(i, t)}</div>
          </div>
        </div>`;
      const icon = L.divIcon({
        className: klass,
        html: compactHtml + fullHtml,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const m = L.marker([i.position.lat, i.position.lng], { icon, draggable: editMode });
      m.on('click', (e) => {
        // Match LeftRail modifier matrix: Shift = additive; ⌘/Ctrl = zoom; stack independently.
        const oe = (e as L.LeafletMouseEvent).originalEvent;
        const shift = !!oe?.shiftKey;
        const cmd = !!(oe && (oe.metaKey || oe.ctrlKey));
        if (shift) { setSelection({ kind: 'interceptor', id: i._id }, { additive: true, zoom: cmd }); return; }
        const isCurrent = selection?.kind === 'interceptor' && selection.id === i._id;
        if (cmd) setSelection({ kind: 'interceptor', id: i._id }, { zoom: true });
        else if (isCurrent) setSelection(null);
        else setSelection({ kind: 'interceptor', id: i._id });
      });
      m.on('dragend', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        updatePos({
          layerId: i.layerId,
          id: i._id,
          position: { lat: ll.lat, lng: ll.lng },
          version: i.version,
        });
      });
      m.addTo(group);
    }
  }, [interceptors, typesById, threadCounts, selection, selections, setSelection, map, editMode, updatePos, focus]);

  useEffect(() => {
    return () => {
      if (groupRef.current) { map.removeLayer(groupRef.current); groupRef.current = null; }
    };
  }, [map]);

  return null;
}
