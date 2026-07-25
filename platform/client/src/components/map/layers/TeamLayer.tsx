import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useParams } from 'react-router-dom';
import type { Team } from '@shared/schemas/team';
import type { Thread } from '@shared/schemas/thread';
import type { LayerFull } from '@shared/schemas/layer-full';
import { useUiStore, isSelected } from '../../../stores/uiStore';
import { useUpdateTeamPosition } from '../../../queries/useMutations';
import { useOrchestrationFocus } from '../../../lib/orchestrationFocus';

export function TeamLayer({
  teams,
  threads,
  data,
}: { teams: Team[]; threads: Thread[]; data: LayerFull }) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const selection = useUiStore((s) => s.selection);
  const selections = useUiStore((s) => s.selections);
  const setSelection = useUiStore((s) => s.setSelection);
  const editMode = useUiStore((s) => s.visibility.edit);
  const { slug = 'vzil-1' } = useParams();
  const { mutate: updatePos } = useUpdateTeamPosition(slug);

  const countByTeam = useMemo(() => {
    const m = new Map<string, number>();
    for (const th of threads) m.set(th.teamId, (m.get(th.teamId) ?? 0) + 1);
    return m;
  }, [threads]);

  // In orchestration focus mode, only the teams that control the focused threat's assigned
  // launchers are drawn — other crews are hidden along with unassigned launchers.
  const focus = useOrchestrationFocus(data);

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;
    group.clearLayers();

    for (const c of teams) {
      if (focus && !focus.teamIds.has(c._id)) continue;
      const selected = isSelected(selections, 'team', c._id);
      const n = countByTeam.get(c._id) ?? 0;
      const compactHtml = `<div class="crew-compact" data-id="${c._id}"><span class="id">${c.code}</span></div>`;
      const fullHtml = `
        <div class="crew-full" data-id="${c._id}">
          <div class="crew-glyph">${c.code}</div>
          <div class="crew-label">
            <div class="id">${c.code}</div>
            <div class="sub">${n} launcher${n === 1 ? '' : 's'}</div>
          </div>
        </div>`;
      const icon = L.divIcon({
        className: 'hoc-crew-marker' + (selected ? ' selected' : ''),
        html: compactHtml + fullHtml,
        iconSize: [0, 0], iconAnchor: [0, 0],
      });
      const m = L.marker([c.position.lat, c.position.lng], { icon, draggable: editMode });
      m.on('click', (e) => {
        // Match LeftRail modifier matrix: Shift = additive; ⌘/Ctrl = zoom; stack independently.
        const oe = (e as L.LeafletMouseEvent).originalEvent;
        const shift = !!oe?.shiftKey;
        const cmd = !!(oe && (oe.metaKey || oe.ctrlKey));
        if (shift) { setSelection({ kind: 'team', id: c._id }, { additive: true, zoom: cmd }); return; }
        const isCurrent = selection?.kind === 'team' && selection.id === c._id;
        if (cmd) setSelection({ kind: 'team', id: c._id }, { zoom: true });
        else if (isCurrent) setSelection(null);
        else setSelection({ kind: 'team', id: c._id });
      });
      m.on('dragend', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        updatePos({
          layerId: c.layerId,
          id: c._id,
          position: { lat: ll.lat, lng: ll.lng },
          version: c.version,
        });
      });
      m.addTo(group);
    }
  }, [teams, countByTeam, selection, selections, setSelection, map, editMode, updatePos, focus]);

  useEffect(() => {
    return () => {
      if (groupRef.current) { map.removeLayer(groupRef.current); groupRef.current = null; }
    };
  }, [map]);

  return null;
}
