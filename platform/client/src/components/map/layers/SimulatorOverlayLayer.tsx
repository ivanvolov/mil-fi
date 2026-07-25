import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useUiStore } from '../../../stores/uiStore';
import { piePolygonPoints } from '@algos/threat-placement/threat-sim';
import { haversineKm } from '@shared/distance';

const METERS_PER_LAT_DEG = 111320;

function metersPerLngDeg(lat: number) {
  return METERS_PER_LAT_DEG * Math.cos((lat * Math.PI) / 180);
}

function bisectorBearingDeg(angleFromDeg: number, angleToDeg: number): number {
  const norm = (d: number) => ((d % 360) + 360) % 360;
  const a = norm(angleFromDeg);
  const b = norm(angleToDeg);
  const sweep = b - a === 0 ? 360 : ((b - a) % 360 + 360) % 360;
  if (sweep === 360) return 0;
  return norm(a + sweep / 2);
}

function offsetMeters(
  center: { lat: number; lng: number },
  distanceM: number,
  bearingDeg: number,
): { lat: number; lng: number } {
  const rad = ((90 - bearingDeg) * Math.PI) / 180;
  const dx = distanceM * Math.cos(rad);
  const dy = distanceM * Math.sin(rad);
  return {
    lat: center.lat + dy / METERS_PER_LAT_DEG,
    lng: center.lng + dx / metersPerLngDeg(center.lat),
  };
}

const crosshairIcon = L.divIcon({
  className: 'hoc-sim-target',
  html: `
    <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="11" stroke="#06b6d4" stroke-width="1.5" fill="none" />
      <line x1="14" y1="2" x2="14" y2="9" stroke="#06b6d4" stroke-width="1.5" />
      <line x1="14" y1="19" x2="14" y2="26" stroke="#06b6d4" stroke-width="1.5" />
      <line x1="2" y1="14" x2="9" y2="14" stroke="#06b6d4" stroke-width="1.5" />
      <line x1="19" y1="14" x2="26" y2="14" stroke="#06b6d4" stroke-width="1.5" />
      <circle cx="14" cy="14" r="2" fill="#06b6d4" />
    </svg>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const radiusHandleIcon = L.divIcon({
  className: 'hoc-sim-radius-handle',
  html: `
    <div style="
      width: 16px; height: 16px;
      background: #06b6d4; border: 2px solid #0b1416;
      box-shadow: 0 0 8px rgba(6,182,212,0.8);
      cursor: move;
    "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const fromHandleIcon = L.divIcon({
  className: 'hoc-sim-angle-handle',
  html: `
    <div style="
      width: 14px; height: 14px; border-radius: 50%;
      background: #eab308; border: 2px solid #0b1416;
      box-shadow: 0 0 6px rgba(234,179,8,0.7);
      cursor: grab;
    "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const toHandleIcon = L.divIcon({
  className: 'hoc-sim-angle-handle',
  html: `
    <div style="
      width: 14px; height: 14px; border-radius: 50%;
      background: #f59e0b; border: 2px solid #0b1416;
      box-shadow: 0 0 6px rgba(245,158,11,0.7);
      cursor: grab;
    "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function bearingFromTo(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  // returns degrees from north, clockwise
  const dLng = (to.lng - from.lng) * metersPerLngDeg(from.lat);
  const dLat = (to.lat - from.lat) * METERS_PER_LAT_DEG;
  const rad = Math.atan2(dLng, dLat);
  return ((rad * 180) / Math.PI + 360) % 360;
}

/** Live preview + interactive controls while the Threat Simulator is active. */
export function SimulatorOverlayLayer() {
  const map = useMap();
  const simStage = useUiStore((s) => s.simStage);
  const simTarget = useUiStore((s) => s.simTarget);
  const simSector = useUiStore((s) => s.simSector);
  const setSimTarget = useUiStore((s) => s.setSimTarget);
  const setSimSector = useUiStore((s) => s.setSimSector);

  // Stable Leaflet object refs — kept alive across re-renders so drag isn't interrupted.
  const groupRef = useRef<L.LayerGroup | null>(null);
  const polygonRef = useRef<L.Polygon | null>(null);
  const crosshairRef = useRef<L.Marker | null>(null);
  const radiusHandleRef = useRef<L.Marker | null>(null);
  const fromHandleRef = useRef<L.Marker | null>(null);
  const toHandleRef = useRef<L.Marker | null>(null);

  // Latest state mirror for drag handlers (avoid stale closures).
  const stateRef = useRef({ simTarget, simSector });
  stateRef.current = { simTarget, simSector };

  // Track which handle is being dragged so the sync effect doesn't yank the marker out from under the mouse.
  const draggingRef = useRef<null | 'target' | 'radius' | 'from' | 'to'>(null);

  // map click → move target (only while we're in the placement stage)
  useEffect(() => {
    if (simStage !== 'place') return;
    const onClick = (e: L.LeafletMouseEvent) => {
      setSimTarget({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [simStage, map, setSimTarget]);

  // Lifecycle: create the layer group + visible layers when stage becomes non-idle; tear down on idle.
  useEffect(() => {
    if (simStage === 'idle') {
      if (groupRef.current) {
        groupRef.current.clearLayers();
        groupRef.current.remove();
      }
      groupRef.current = null;
      polygonRef.current = null;
      crosshairRef.current = null;
      radiusHandleRef.current = null;
      fromHandleRef.current = null;
      toHandleRef.current = null;
      return;
    }

    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;

    if (!polygonRef.current) {
      polygonRef.current = L.polygon([], {
        color: '#06b6d4',
        weight: 1,
        fillColor: '#06b6d4',
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(group);
    }

    if (!crosshairRef.current) {
      const m = L.marker([0, 0], { icon: crosshairIcon, draggable: true, autoPan: false }).addTo(group);
      m.on('dragstart', () => { draggingRef.current = 'target'; });
      m.on('drag', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        setSimTarget({ lat: ll.lat, lng: ll.lng });
      });
      m.on('dragend', () => { draggingRef.current = null; });
      crosshairRef.current = m;
    }
    // Enable drag only in 'place' stage; disable in 'setup' so the dialog overlay doesn't fight it.
    const drag = (crosshairRef.current as any).dragging;
    if (drag) {
      if (simStage === 'place') drag.enable();
      else drag.disable();
    }

    // Interactive handles only in the 'place' stage.
    if (simStage === 'place') {
      if (!radiusHandleRef.current) {
        const m = L.marker([0, 0], { icon: radiusHandleIcon, draggable: true, autoPan: false }).addTo(group);
        m.on('dragstart', () => { draggingRef.current = 'radius'; });
        m.on('drag', (e) => {
          const t = stateRef.current.simTarget;
          if (!t) return;
          const ll = (e.target as L.Marker).getLatLng();
          const km = haversineKm(t, { lat: ll.lat, lng: ll.lng });
          if (km > 0.05) {
            setSimSector({ ...stateRef.current.simSector, radiusKm: Math.round(km * 10) / 10 });
          }
        });
        m.on('dragend', () => { draggingRef.current = null; });
        radiusHandleRef.current = m;
      }
      if (!fromHandleRef.current) {
        const m = L.marker([0, 0], { icon: fromHandleIcon, draggable: true, autoPan: false }).addTo(group);
        m.on('dragstart', () => { draggingRef.current = 'from'; });
        m.on('drag', (e) => {
          const t = stateRef.current.simTarget;
          if (!t) return;
          const ll = (e.target as L.Marker).getLatLng();
          const deg = Math.round(bearingFromTo(t, { lat: ll.lat, lng: ll.lng }));
          setSimSector({ ...stateRef.current.simSector, angleFromDeg: deg });
        });
        m.on('dragend', () => { draggingRef.current = null; });
        fromHandleRef.current = m;
      }
      if (!toHandleRef.current) {
        const m = L.marker([0, 0], { icon: toHandleIcon, draggable: true, autoPan: false }).addTo(group);
        m.on('dragstart', () => { draggingRef.current = 'to'; });
        m.on('drag', (e) => {
          const t = stateRef.current.simTarget;
          if (!t) return;
          const ll = (e.target as L.Marker).getLatLng();
          const deg = Math.round(bearingFromTo(t, { lat: ll.lat, lng: ll.lng }));
          setSimSector({ ...stateRef.current.simSector, angleToDeg: deg });
        });
        m.on('dragend', () => { draggingRef.current = null; });
        toHandleRef.current = m;
      }
    } else {
      // 'setup' stage: handles should not exist (overlay should be passive preview)
      for (const ref of [radiusHandleRef, fromHandleRef, toHandleRef]) {
        if (ref.current) {
          ref.current.remove();
          ref.current = null;
        }
      }
    }
  }, [simStage, map, setSimSector]);

  // Sync positions whenever state changes (cheap — just setLatLng / setLatLngs on existing layers).
  useEffect(() => {
    if (simStage === 'idle' || !simTarget) return;
    const ring = piePolygonPoints(
      simTarget,
      simSector.radiusKm,
      simSector.angleFromDeg,
      simSector.angleToDeg,
    );
    polygonRef.current?.setLatLngs(ring.map((p) => [p.lat, p.lng]) as L.LatLngExpression[]);
    if (crosshairRef.current && draggingRef.current !== 'target') {
      crosshairRef.current.setLatLng(simTarget);
    }

    // Skip position resets on handles being actively dragged — the mouse owns them mid-drag.
    if (radiusHandleRef.current && draggingRef.current !== 'radius') {
      const bearing = bisectorBearingDeg(simSector.angleFromDeg, simSector.angleToDeg);
      const pos = offsetMeters(simTarget, simSector.radiusKm * 1000, bearing);
      radiusHandleRef.current.setLatLng([pos.lat, pos.lng]);
    }
    if (fromHandleRef.current && draggingRef.current !== 'from') {
      const pos = offsetMeters(simTarget, simSector.radiusKm * 1000, simSector.angleFromDeg);
      fromHandleRef.current.setLatLng([pos.lat, pos.lng]);
    }
    if (toHandleRef.current && draggingRef.current !== 'to') {
      const pos = offsetMeters(simTarget, simSector.radiusKm * 1000, simSector.angleToDeg);
      toHandleRef.current.setLatLng([pos.lat, pos.lng]);
    }
  }, [simStage, simTarget, simSector]);

  return null;
}
