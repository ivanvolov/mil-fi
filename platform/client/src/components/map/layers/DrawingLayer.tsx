import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { Drawing } from '@shared/schemas/drawing';

export function DrawingLayer({
  drawings,
  restrictionsVisible = true,
  editMode = false,
}: {
  drawings: Drawing[];
  restrictionsVisible?: boolean;
  editMode?: boolean;
}) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;
    group.clearLayers();

    for (const d of drawings) {
      // NPZ/NIZ zones must stay editable, so edit mode shows them even when
      // the drawing itself (or the restrictions layer toggle) is hidden.
      const forceInEdit =
        editMode && (d.kind === 'noPlacementZone' || d.kind === 'noEngagementZone');
      if (!forceInEdit && !(restrictionsVisible && d.visible)) continue;
      const style = d.style;
      // Kind-driven CSS class so each zone type paints with its own fill pattern/opacity,
      // overriding Leaflet's default full-opacity polygon fill.
      const cssClass =
        d.kind === 'noPlacementZone'
          ? 'no-placement-zone'
          : style?.patternId === 'brick-hatch'
          ? 'no-fly-zone'
          : undefined;
      const opts: L.PathOptions = {
        color: style?.stroke ?? '#888',
        weight: style?.weight ?? 1.5,
        fillColor: style?.fill ?? undefined,
        fillOpacity: 1,
        dashArray: style?.dashArray ?? undefined,
        interactive: false,
        className: cssClass,
      };
      const g = d.geometry;
      if (g.type === 'polygon') {
        L.polygon(g.points.map((p) => [p.lat, p.lng]), opts).addTo(group);
      } else if (g.type === 'circle') {
        L.circle([g.center.lat, g.center.lng], { ...opts, radius: g.radiusM, fillOpacity: 0.06 }).addTo(group);
      } else if (g.type === 'rectangle') {
        L.rectangle([[g.sw.lat, g.sw.lng], [g.ne.lat, g.ne.lng]], opts).addTo(group);
      }
    }
  }, [drawings, restrictionsVisible, editMode, map]);

  useEffect(() => {
    return () => {
      if (groupRef.current) { map.removeLayer(groupRef.current); groupRef.current = null; }
    };
  }, [map]);

  return null;
}
