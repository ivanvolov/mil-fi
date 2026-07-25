import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useParams } from 'react-router-dom';
import type { Threat } from '@shared/schemas/threat';
import type { ThreatType } from '@shared/schemas/threat-type';
import type { LatLng } from '@shared/schemas/common';
import type { LayerFull } from '@shared/schemas/layer-full';
import { useUiStore, isSelected } from '../../../stores/uiStore';
import { useUpdateThreatGeometry } from '../../../queries/useMutations';
import { threatGlyphHtml } from '../glyphs';
import { useOrchestrationFocus } from '../../../lib/orchestrationFocus';

// Chaikin corner-cutting — keeps endpoints, rounds interior corners. Two
// iterations gives a subtle organic curve while staying close to the original
// waypoints, so edit handles on raw points still feel co-located with the line.
function chaikinSmooth(pts: LatLng[], iterations = 2): LatLng[] {
  if (pts.length < 3) return pts.slice();
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const next: LatLng[] = [cur[0]!];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i]!, b = cur[i + 1]!;
      next.push({ lat: a.lat * 0.75 + b.lat * 0.25, lng: a.lng * 0.75 + b.lng * 0.25 });
      next.push({ lat: a.lat * 0.25 + b.lat * 0.75, lng: a.lng * 0.25 + b.lng * 0.75 });
    }
    next.push(cur[cur.length - 1]!);
    cur = next;
  }
  return cur;
}

/** Rectangle corners (sw, ne) for a box of `widthM` × `heightM` centered on `c`. */
function boxBounds(c: { lat: number; lng: number }, widthM: number, heightM: number) {
  const dLat = heightM / 2 / 111320;
  const dLng = widthM / 2 / (111320 * Math.cos((c.lat * Math.PI) / 180));
  return {
    sw: [c.lat - dLat, c.lng - dLng] as [number, number],
    ne: [c.lat + dLat, c.lng + dLng] as [number, number],
  };
}

function drawGeometry(group: L.LayerGroup, t: Threat) {
  const g = t.geometry;
  if (g.pastPath) {
    const smoothed = chaikinSmooth(g.pastPath);
    L.polyline(smoothed.map((p) => [p.lat, p.lng]), {
      color: '#eab308', weight: 2, opacity: 0.9, interactive: false,
    }).addTo(group);
  }
  if (g.futureCruise) {
    L.polyline(g.futureCruise.map((p) => [p.lat, p.lng]), {
      color: '#eab308', weight: 2, opacity: 0.75, dashArray: '5 4', interactive: false,
    }).addTo(group);
  }
  if (g.futureAttack) {
    L.polyline(g.futureAttack.map((p) => [p.lat, p.lng]), {
      color: '#ef4444', weight: 2.5, opacity: 0.9, dashArray: '5 4', interactive: false,
    }).addTo(group);
  }
  if (g.divergence && g.detonation) {
    const { widthM, heightM } = g.divergence;
    const b = boxBounds(g.detonation, widthM, heightM);
    L.rectangle([b.sw, b.ne], {
      color: '#c2410c', weight: 1.4, fillColor: '#c2410c', fillOpacity: 0.05, interactive: false,
    }).addTo(group);
  }
  if (g.detonation) {
    L.circle([g.detonation.lat, g.detonation.lng], {
      radius: g.detonation.radiusM,
      color: '#ef4444', weight: 1.5, fillColor: '#ef4444', fillOpacity: 0.22, interactive: false,
    }).addTo(group);
  }
}

export function ThreatLayer({
  threats,
  data,
}: { threats: Threat[]; threatTypes: ThreatType[]; data: LayerFull }) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const selection = useUiStore((s) => s.selection);
  const selections = useUiStore((s) => s.selections);
  const setSelection = useUiStore((s) => s.setSelection);
  const editMode = useUiStore((s) => s.visibility.edit);
  const { slug = 'vzil-1' } = useParams();
  const { mutate: updateGeom } = useUpdateThreatGeometry(slug);

  // In orchestration focus mode, only the focused threat is drawn — other threats hidden.
  const focus = useOrchestrationFocus(data);

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;
    group.clearLayers();

    for (const t of threats) {
      if (focus && t._id !== focus.threatId) continue;
      drawGeometry(group, t);

      const selected = isSelected(selections, 'threat', t._id);
      const compactHtml = `<div class="threat-compact" data-id="${t._id}">${threatGlyphHtml()}</div>`;
      const icon = L.divIcon({
        className: 'hoc-threat-marker' + (selected ? ' selected' : ''),
        html: compactHtml,
        iconSize: [0, 0], iconAnchor: [0, 0],
      });
      const m = L.marker([t.position.lat, t.position.lng], { icon, draggable: editMode });
      m.on('click', (e) => {
        // Match LeftRail modifier matrix: Shift = additive; ⌘/Ctrl = zoom; stack independently.
        const oe = (e as L.LeafletMouseEvent).originalEvent;
        const shift = !!oe?.shiftKey;
        const cmd = !!(oe && (oe.metaKey || oe.ctrlKey));
        if (shift) { setSelection({ kind: 'threat', id: t._id }, { additive: true, zoom: cmd }); return; }
        const isCurrent = selection?.kind === 'threat' && selection.id === t._id;
        if (cmd) setSelection({ kind: 'threat', id: t._id }, { zoom: true });
        else if (isCurrent) setSelection(null);
        else setSelection({ kind: 'threat', id: t._id });
      });
      m.on('dragend', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        // for intercept=true threats, sync last pastPath point + futureCruise start
        const nextGeom = { ...t.geometry };
        if (nextGeom.pastPath && nextGeom.pastPath.length > 0) {
          nextGeom.pastPath = nextGeom.pastPath.slice();
          nextGeom.pastPath[nextGeom.pastPath.length - 1] = { lat: ll.lat, lng: ll.lng };
          if (nextGeom.futureCruise && nextGeom.futureCruise.length > 0) {
            nextGeom.futureCruise = nextGeom.futureCruise.slice();
            nextGeom.futureCruise[0] = { lat: ll.lat, lng: ll.lng };
          }
        }
        updateGeom({
          layerId: t.layerId,
          id: t._id,
          geometry: nextGeom,
          position: { lat: ll.lat, lng: ll.lng },
          version: t.version,
        });
      });
      m.addTo(group);
    }
  }, [threats, selection, selections, setSelection, map, editMode, updateGeom, focus]);

  useEffect(() => {
    return () => {
      if (groupRef.current) { map.removeLayer(groupRef.current); groupRef.current = null; }
    };
  }, [map]);

  return null;
}
