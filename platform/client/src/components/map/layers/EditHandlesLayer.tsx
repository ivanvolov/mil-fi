import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useParams } from 'react-router-dom';
import type { Threat } from '@shared/schemas/threat';
import { useUiStore } from '../../../stores/uiStore';
import { useUpdateThreatGeometry } from '../../../queries/useMutations';

type Handle = {
  latlng: [number, number];
  kind: 'round' | 'rect square' | 'detonation round';
  apply: (ll: { lat: number; lng: number }, geom: Threat['geometry']) => Partial<Threat['geometry']> & { _position?: { lat: number; lng: number } };
};

function handlesFor(t: Threat): Handle[] {
  const out: Handle[] = [];
  const g = t.geometry;
  if (g.pastPath) {
    g.pastPath.forEach((pt, idx) => {
      out.push({
        latlng: [pt.lat, pt.lng],
        kind: 'round',
        apply: (ll, geom) => {
          const next = (geom.pastPath ?? []).slice();
          next[idx] = { lat: ll.lat, lng: ll.lng };
          const out: any = { pastPath: next };
          if (idx === next.length - 1) {
            // also drag the cruise start + threat position
            const cruise = (geom.futureCruise ?? []).slice();
            if (cruise.length > 0) {
              cruise[0] = { lat: ll.lat, lng: ll.lng };
              out.futureCruise = cruise;
            }
            out._position = { lat: ll.lat, lng: ll.lng };
          }
          return out;
        },
      });
    });
  }
  if (g.futureCruise && g.futureCruise.length > 0) {
    const endIdx = g.futureCruise.length - 1;
    const end = g.futureCruise[endIdx];
    if (end) {
      out.push({
        latlng: [end.lat, end.lng],
        kind: 'round',
        apply: (ll, geom) => {
          const cruise = (geom.futureCruise ?? []).slice();
          cruise[cruise.length - 1] = { lat: ll.lat, lng: ll.lng };
          const attack = (geom.futureAttack ?? []).slice();
          if (attack.length > 0) attack[0] = { lat: ll.lat, lng: ll.lng };
          return { futureCruise: cruise, futureAttack: attack };
        },
      });
    }
  }
  if (g.detonation) {
    out.push({
      latlng: [g.detonation.lat, g.detonation.lng],
      kind: 'detonation round',
      apply: (ll, geom) => {
        const det = geom.detonation ? { ...geom.detonation, lat: ll.lat, lng: ll.lng } : null;
        const attack = (geom.futureAttack ?? []).slice();
        if (attack.length > 0) attack[attack.length - 1] = { lat: ll.lat, lng: ll.lng };
        return { detonation: det, futureAttack: attack };
      },
    });
  }
  // Divergence zone: one NE-corner handle resizes the width/height box symmetrically
  // around the detonation point.
  if (g.divergence && g.detonation) {
    const det = g.detonation;
    const mPerLat = 111320;
    const mPerLng = 111320 * Math.cos((det.lat * Math.PI) / 180);
    const neLat = det.lat + g.divergence.heightM / 2 / mPerLat;
    const neLng = det.lng + g.divergence.widthM / 2 / mPerLng;
    out.push({
      latlng: [neLat, neLng],
      kind: 'rect square',
      apply: (ll, geom) => {
        const c = geom.detonation;
        if (!c || !geom.divergence) return {};
        const widthM = Math.max(0, Math.abs(ll.lng - c.lng) * 2 * (111320 * Math.cos((c.lat * Math.PI) / 180)));
        const heightM = Math.max(0, Math.abs(ll.lat - c.lat) * 2 * 111320);
        return { divergence: { ...geom.divergence, widthM: Math.round(widthM), heightM: Math.round(heightM) } };
      },
    });
  }
  return out;
}

export function EditHandlesLayer({ threats }: { threats: Threat[] }) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const editMode = useUiStore((s) => s.visibility.edit);
  const selection = useUiStore((s) => s.selection);
  const { slug = 'vzil-1' } = useParams();
  const { mutate: updateGeom } = useUpdateThreatGeometry(slug);

  const selectedThreat = useMemo(
    () => (selection?.kind === 'threat' ? threats.find((t) => t._id === selection.id) ?? null : null),
    [selection, threats],
  );

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;
    group.clearLayers();
    if (!editMode || !selectedThreat) return;

    const handles = handlesFor(selectedThreat);
    for (const h of handles) {
      const icon = L.divIcon({
        className: 'hoc-edit-handle ' + h.kind,
        html: '<div class="h"></div>',
        iconSize: [0, 0], iconAnchor: [0, 0],
      });
      const marker = L.marker(h.latlng, { icon, draggable: true, autoPan: false });
      marker.on('dragend', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        const patch = h.apply({ lat: ll.lat, lng: ll.lng }, selectedThreat.geometry);
        const { _position, ...geomPatch } = patch as any;
        const nextGeom = { ...selectedThreat.geometry, ...geomPatch };
        updateGeom({
          layerId: selectedThreat.layerId,
          id: selectedThreat._id,
          geometry: nextGeom,
          position: _position,
          version: selectedThreat.version,
        });
      });
      marker.addTo(group);
    }
  }, [editMode, selectedThreat, map, updateGeom]);

  useEffect(() => {
    return () => {
      if (groupRef.current) { map.removeLayer(groupRef.current); groupRef.current = null; }
    };
  }, [map]);

  return null;
}
