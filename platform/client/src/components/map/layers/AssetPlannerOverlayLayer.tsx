import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useUiStore } from '../../../stores/uiStore';
import { haversineKm } from '@shared/distance';

const METERS_PER_LAT_DEG = 111320;

function metersPerLngDeg(lat: number) {
  return METERS_PER_LAT_DEG * Math.cos((lat * Math.PI) / 180);
}

/** Offset a point due east by `distanceM` meters. */
function offsetEast(center: { lat: number; lng: number }, distanceM: number) {
  return { lat: center.lat, lng: center.lng + distanceM / metersPerLngDeg(center.lat) };
}

const crosshairIcon = L.divIcon({
  className: 'hoc-asset-center',
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
  className: 'hoc-asset-radius-handle',
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

/** Interactive coverage-area picker while the Asset Manager is in the 'place' stage.
 *  Mirrors the Threat Simulator UX: crosshair (center) + cyan square (radius) + dashed circle.
 *  No launcher preview — the optimized layout is only computed on Apply. */
export function AssetPlannerOverlayLayer() {
  const map = useMap();
  const assetStage = useUiStore((s) => s.assetStage);
  const assetCenter = useUiStore((s) => s.assetCenter);
  const assetRadiusKm = useUiStore((s) => s.assetRadiusKm);
  const setAssetCenter = useUiStore((s) => s.setAssetCenter);
  const setAssetRadiusKm = useUiStore((s) => s.setAssetRadiusKm);

  // Stable Leaflet refs — kept alive across renders so a drag isn't interrupted.
  const groupRef = useRef<L.LayerGroup | null>(null);
  const regionRef = useRef<L.Circle | null>(null);
  const crosshairRef = useRef<L.Marker | null>(null);
  const radiusHandleRef = useRef<L.Marker | null>(null);

  const stateRef = useRef({ assetCenter, assetRadiusKm });
  stateRef.current = { assetCenter, assetRadiusKm };
  const draggingRef = useRef<null | 'center' | 'radius'>(null);

  // map click → move region center (only while placing)
  useEffect(() => {
    if (assetStage !== 'place') return;
    const onClick = (e: L.LeafletMouseEvent) => {
      setAssetCenter({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [assetStage, map, setAssetCenter]);

  // Lifecycle: build layers when active, tear down on idle.
  useEffect(() => {
    if (assetStage === 'idle') {
      if (groupRef.current) { groupRef.current.clearLayers(); groupRef.current.remove(); }
      groupRef.current = null;
      regionRef.current = null;
      crosshairRef.current = null;
      radiusHandleRef.current = null;
      return;
    }

    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;

    if (!regionRef.current) {
      regionRef.current = L.circle([0, 0], {
        radius: 0,
        color: '#06b6d4',
        weight: 1,
        fillColor: '#06b6d4',
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(group);
    }

    if (!crosshairRef.current) {
      const m = L.marker([0, 0], { icon: crosshairIcon, draggable: true, autoPan: false }).addTo(group);
      m.on('dragstart', () => { draggingRef.current = 'center'; });
      m.on('drag', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        setAssetCenter({ lat: ll.lat, lng: ll.lng });
      });
      m.on('dragend', () => { draggingRef.current = null; });
      crosshairRef.current = m;
    }

    if (!radiusHandleRef.current) {
      const m = L.marker([0, 0], { icon: radiusHandleIcon, draggable: true, autoPan: false }).addTo(group);
      m.on('dragstart', () => { draggingRef.current = 'radius'; });
      m.on('drag', (e) => {
        const c = stateRef.current.assetCenter;
        if (!c) return;
        const ll = (e.target as L.Marker).getLatLng();
        const km = haversineKm(c, { lat: ll.lat, lng: ll.lng });
        // Round to 10 m so hundreds-of-meters radii are draggable, not just whole km.
        if (km > 0.02) setAssetRadiusKm(Math.round(km * 100) / 100);
      });
      m.on('dragend', () => { draggingRef.current = null; });
      radiusHandleRef.current = m;
    }
  }, [assetStage, map, setAssetCenter, setAssetRadiusKm]);

  // Sync positions whenever state changes.
  useEffect(() => {
    if (assetStage === 'idle' || !assetCenter) return;

    regionRef.current?.setLatLng([assetCenter.lat, assetCenter.lng]);
    regionRef.current?.setRadius(assetRadiusKm * 1000);

    if (crosshairRef.current && draggingRef.current !== 'center') {
      crosshairRef.current.setLatLng([assetCenter.lat, assetCenter.lng]);
    }
    if (radiusHandleRef.current && draggingRef.current !== 'radius') {
      const pos = offsetEast(assetCenter, assetRadiusKm * 1000);
      radiusHandleRef.current.setLatLng([pos.lat, pos.lng]);
    }
  }, [assetStage, assetCenter, assetRadiusKm]);

  return null;
}
