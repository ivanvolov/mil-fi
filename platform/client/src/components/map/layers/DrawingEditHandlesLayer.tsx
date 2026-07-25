import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useParams } from 'react-router-dom';
import type { Drawing } from '@shared/schemas/drawing';
import { useUiStore } from '../../../stores/uiStore';
import { useUpdateDrawingGeometry } from '../../../queries/useMutations';

export function DrawingEditHandlesLayer({ drawings }: { drawings: Drawing[] }) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const editMode = useUiStore((s) => s.visibility.edit);
  const selection = useUiStore((s) => s.selection);
  const { slug = 'vzil-1' } = useParams();
  const { mutate: updateGeom } = useUpdateDrawingGeometry(slug);

  const selectedDrawing = useMemo(
    () => (selection?.kind === 'drawing' ? drawings.find((d) => d._id === selection.id) ?? null : null),
    [selection, drawings],
  );

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;
    group.clearLayers();
    if (!editMode || !selectedDrawing) return;

    const g = selectedDrawing.geometry;
    const layerId = selectedDrawing.layerId;
    const id = selectedDrawing._id;
    const version = selectedDrawing.version;
    const commit = (geometry: Drawing['geometry']) =>
      updateGeom({ layerId, id, geometry, version });

    const vertexIcon = L.divIcon({
      className: 'hoc-edit-handle round',
      html: '<div class="h"></div>',
      iconSize: [0, 0], iconAnchor: [0, 0],
    });
    const centroidIcon = L.divIcon({
      className: 'hoc-edit-handle detonation round',
      html: '<div class="h"></div>',
      iconSize: [0, 0], iconAnchor: [0, 0],
    });

    if (g.type === 'circle') {
      const marker = L.marker([g.center.lat, g.center.lng], { icon: centroidIcon, draggable: true, autoPan: false });
      marker.on('dragend', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        commit({ ...g, center: { lat: ll.lat, lng: ll.lng } });
      });
      marker.addTo(group);
      return;
    }

    if (g.type === 'polygon') {
      const meanLat = g.points.reduce((a, p) => a + p.lat, 0) / g.points.length;
      const meanLng = g.points.reduce((a, p) => a + p.lng, 0) / g.points.length;
      const centroidMarker = L.marker([meanLat, meanLng], { icon: centroidIcon, draggable: true, autoPan: false });
      centroidMarker.on('dragend', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        const dLat = ll.lat - meanLat;
        const dLng = ll.lng - meanLng;
        commit({ ...g, points: g.points.map((p) => ({ lat: p.lat + dLat, lng: p.lng + dLng })) });
      });
      centroidMarker.addTo(group);

      g.points.forEach((p, idx) => {
        const m = L.marker([p.lat, p.lng], { icon: vertexIcon, draggable: true, autoPan: false });
        m.on('dragend', (e) => {
          const ll = (e.target as L.Marker).getLatLng();
          const next = g.points.slice();
          next[idx] = { lat: ll.lat, lng: ll.lng };
          commit({ ...g, points: next });
        });
        m.addTo(group);
      });
      return;
    }

    if (g.type === 'rectangle') {
      const meanLat = (g.sw.lat + g.ne.lat) / 2;
      const meanLng = (g.sw.lng + g.ne.lng) / 2;
      const centroidMarker = L.marker([meanLat, meanLng], { icon: centroidIcon, draggable: true, autoPan: false });
      centroidMarker.on('dragend', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        const dLat = ll.lat - meanLat;
        const dLng = ll.lng - meanLng;
        commit({
          ...g,
          sw: { lat: g.sw.lat + dLat, lng: g.sw.lng + dLng },
          ne: { lat: g.ne.lat + dLat, lng: g.ne.lng + dLng },
        });
      });
      centroidMarker.addTo(group);

      const swMarker = L.marker([g.sw.lat, g.sw.lng], { icon: vertexIcon, draggable: true, autoPan: false });
      swMarker.on('dragend', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        commit({ ...g, sw: { lat: ll.lat, lng: ll.lng } });
      });
      swMarker.addTo(group);

      const neMarker = L.marker([g.ne.lat, g.ne.lng], { icon: vertexIcon, draggable: true, autoPan: false });
      neMarker.on('dragend', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        commit({ ...g, ne: { lat: ll.lat, lng: ll.lng } });
      });
      neMarker.addTo(group);
    }
  }, [editMode, selectedDrawing, map, updateGeom]);

  useEffect(() => {
    return () => {
      if (groupRef.current) { map.removeLayer(groupRef.current); groupRef.current = null; }
    };
  }, [map]);

  return null;
}
