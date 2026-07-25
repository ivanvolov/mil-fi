import { useCallback, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { LatLng } from '@shared/schemas/common';
import { useUiStore } from '../../stores/uiStore';
import { InterceptorLayer } from './layers/InterceptorLayer';
import { TeamLayer } from './layers/TeamLayer';
import { ThreatLayer } from './layers/ThreatLayer';
import { DrawingLayer } from './layers/DrawingLayer';
import { ControlsLayer } from './layers/ControlsLayer';
import { CoverageLayer } from './layers/CoverageLayer';
import { EditHandlesLayer } from './layers/EditHandlesLayer';
import { DrawingEditHandlesLayer } from './layers/DrawingEditHandlesLayer';
import { SimulatorOverlayLayer } from './layers/SimulatorOverlayLayer';
import { AssetPlannerOverlayLayer } from './layers/AssetPlannerOverlayLayer';
import { MfgHeatmapLayer } from './layers/MfgHeatmapLayer';
import { AssignmentLinkLayer } from './layers/AssignmentLinkLayer';

/** Side-effect: inject the brick-hatch SVG pattern into Leaflet's overlay <svg defs>. */
function BrickHatchPattern() {
  const map = useMap();
  useEffect(() => {
    function ensure() {
      const SVG_NS = 'http://www.w3.org/2000/svg';
      const overlaySvg = map.getContainer().querySelector('.leaflet-overlay-pane svg') as SVGSVGElement | null;
      if (!overlaySvg) return;
      if (overlaySvg.querySelector('#brick-hatch')) return;
      let defs = overlaySvg.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS(SVG_NS, 'defs');
        overlaySvg.insertBefore(defs, overlaySvg.firstChild);
      }
      const pattern = document.createElementNS(SVG_NS, 'pattern');
      pattern.setAttribute('id', 'brick-hatch');
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      pattern.setAttribute('width', '5');
      pattern.setAttribute('height', '5');
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', '2.5');
      dot.setAttribute('cy', '2.5');
      dot.setAttribute('r', '0.55');
      dot.setAttribute('fill', '#b04a3a');
      dot.setAttribute('fill-opacity', '0.85');
      pattern.appendChild(dot);
      defs.appendChild(pattern);
    }
    ensure();
    const t = setTimeout(ensure, 50);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

/** Side-effect: keep a .leaflet-zoom-level-N class on the container so CSS can swap compact/full markers. */
function ZoomLevelClass() {
  const map = useMap();
  useEffect(() => {
    const apply = () => {
      const z = Math.round(map.getZoom());
      const el = map.getContainer();
      el.className = el.className
        .split(' ')
        .filter((c) => !c.startsWith('leaflet-zoom-level-'))
        .concat([`leaflet-zoom-level-${z}`])
        .join(' ');
    };
    apply();
    map.on('zoomend', apply);
    return () => { map.off('zoomend', apply); };
  }, [map]);
  return null;
}

/** Side-effect: Leaflet only tracks window resizes, so layout-driven container resizes
 *  (e.g. collapsing the right inspector) leave stale tile geometry — observe the
 *  container directly and invalidate. */
function ResizeInvalidator() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => { map.invalidateSize(); });
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/** Persists map center+zoom per layer, and animates the view ONLY when a selection is
 *  made with ⌘/Ctrl held (selectionZoom flag in the store). Default clicks just select.
 *  - ⌘+click threat → flyToBounds of path
 *  - ⌘+click launcher → frame launcher + its controlling crews
 *  - ⌘+click crew → frame crew + its launchers
 *  - ⌘+click drawing → fit the shape
 *  - subsequent selection change after a zoomed view → flyTo the persisted local view
 *  Manual pans/zooms are saved to the store; programmatic flies are not.
 */
function ViewController({ data }: { data: LayerFull }) {
  const map = useMap();
  const layerId = data.layer._id;
  const selection = useUiStore((s) => s.selection);
  const selections = useUiStore((s) => s.selections);
  const selectionZoom = useUiStore((s) => s.selectionZoom);
  const setMapView = useUiStore((s) => s.setMapView);
  const autoZoomRef = useRef(false);

  const flyToPoints = useCallback((pts: [number, number][], maxZoom: number) => {
    if (pts.length === 0) return;
    autoZoomRef.current = true;
    if (pts.length === 1) {
      map.flyTo(pts[0]!, maxZoom, { duration: 0.6 });
      return;
    }
    const size = map.getSize();
    map.flyToBounds(L.latLngBounds(pts), {
      paddingTopLeft: [Math.round(size.x * 0.15), Math.round(size.y * 0.2)],
      paddingBottomRight: [Math.round(size.x * 0.15), Math.round(size.y * 0.2)],
      maxZoom,
      duration: 0.6,
    });
  }, [map]);

  // persist pan/zoom — skip writes triggered by our own animated flies
  useEffect(() => {
    const save = () => {
      if (autoZoomRef.current) { autoZoomRef.current = false; return; }
      const c = map.getCenter();
      setMapView(layerId, { center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() });
    };
    map.on('moveend', save);
    return () => { map.off('moveend', save); };
  }, [layerId, map, setMapView]);

  // selection-driven zoom (only fires when ⌘/Ctrl was held during the click).
  // Plain click / Shift-only / deselect: `selectionZoom` is false → no-op. The map
  // stays where the user left it; the persisted `mapViewByLayer` is only consulted
  // at layer mount (via `MapContainer`'s initialCenter/initialZoom below), never
  // mid-session, so nothing chases clicks back to a "default focus."
  useEffect(() => {
    if (!selectionZoom) return;

    // Shift-click case: no single `selection` (it goes null when >1 are selected), but
    // `selections` has ≥2 entities. Fit the map to every one of them so the user sees
    // exactly what they've picked. Each drawing contributes its own bounding pair; other
    // entities contribute their position point.
    if (!selection && selections.length > 1) {
      const pts: [number, number][] = [];
      for (const s of selections) {
        if (s.kind === 'interceptor') {
          const i = data.interceptors.find((x) => x._id === s.id);
          if (i) pts.push([i.position.lat, i.position.lng]);
        } else if (s.kind === 'team') {
          const t = data.teams.find((x) => x._id === s.id);
          if (t) pts.push([t.position.lat, t.position.lng]);
        } else if (s.kind === 'threat') {
          const th = data.threats.find((x) => x._id === s.id);
          if (th) pts.push([th.position.lat, th.position.lng]);
        } else if (s.kind === 'drawing') {
          const d = data.drawings.find((x) => x._id === s.id);
          if (!d) continue;
          const g = d.geometry;
          if (g.type === 'polygon') {
            for (const p of g.points) pts.push([p.lat, p.lng]);
          } else if (g.type === 'rectangle') {
            pts.push([g.sw.lat, g.sw.lng], [g.ne.lat, g.ne.lng]);
          } else if (g.type === 'circle') {
            const latDeg = g.radiusM / 111320;
            const lngDeg = g.radiusM / (111320 * Math.cos((g.center.lat * Math.PI) / 180));
            pts.push([g.center.lat - latDeg, g.center.lng - lngDeg]);
            pts.push([g.center.lat + latDeg, g.center.lng + lngDeg]);
          }
        }
      }
      flyToPoints(pts, 13);
      return;
    }

    const newKind = selection?.kind ?? null;

    if (newKind === 'threat' && selection) {
      const t = data.threats.find((x) => x._id === selection.id);
      if (!t) return;
      const pts: [number, number][] = [];
      const push = (p?: LatLng | null) => { if (p) pts.push([p.lat, p.lng]); };
      push(t.position);
      if (t.geometry.detonation) push({ lat: t.geometry.detonation.lat, lng: t.geometry.detonation.lng });
      for (const p of t.geometry.pastPath ?? []) push(p);
      for (const p of t.geometry.futureCruise ?? []) push(p);
      for (const p of t.geometry.futureAttack ?? []) push(p);
      flyToPoints(pts, 12.5);
      return;
    }

    if (newKind === 'interceptor' && selection) {
      const inter = data.interceptors.find((x) => x._id === selection.id);
      if (!inter) return;
      const crewIds = new Set(
        data.threads.filter((th) => th.interceptorId === inter._id).map((th) => th.teamId),
      );
      const pts: [number, number][] = [[inter.position.lat, inter.position.lng]];
      for (const tm of data.teams) if (crewIds.has(tm._id)) pts.push([tm.position.lat, tm.position.lng]);
      flyToPoints(pts, 18); // tight (~200 m scale) on the weapon
      return;
    }

    if (newKind === 'team' && selection) {
      const team = data.teams.find((x) => x._id === selection.id);
      if (!team) return;
      const interIds = new Set(
        data.threads.filter((th) => th.teamId === team._id).map((th) => th.interceptorId),
      );
      const pts: [number, number][] = [[team.position.lat, team.position.lng]];
      for (const inter of data.interceptors) if (interIds.has(inter._id)) pts.push([inter.position.lat, inter.position.lng]);
      flyToPoints(pts, 18); // tight (~200 m scale) on the crew + its weapons
      return;
    }

    if (newKind === 'drawing' && selection) {
      const d = data.drawings.find((x) => x._id === selection.id);
      if (!d) return;
      const pts: [number, number][] = [];
      const g = d.geometry;
      if (g.type === 'polygon') {
        for (const p of g.points) pts.push([p.lat, p.lng]);
      } else if (g.type === 'rectangle') {
        pts.push([g.sw.lat, g.sw.lng], [g.ne.lat, g.ne.lng]);
      } else if (g.type === 'circle') {
        const latDeg = g.radiusM / 111320;
        const lngDeg = g.radiusM / (111320 * Math.cos((g.center.lat * Math.PI) / 180));
        pts.push([g.center.lat - latDeg, g.center.lng - lngDeg]);
        pts.push([g.center.lat + latDeg, g.center.lng + lngDeg]);
      }
      flyToPoints(pts, 12.5);
      return;
    }

    // selectionZoom was true but selection.kind didn't match any branch (e.g. null) — no-op
    void newKind;
  }, [selection, selections, selectionZoom, data, layerId, map, flyToPoints]);

  return null;
}

export function MapHost({ data }: { data: LayerFull }) {
  const visibility = useUiStore((s) => s.visibility);
  const styleMode = useUiStore((s) => s.mapStyleMode);
  const simulating = useUiStore((s) => s.simStage !== 'idle');
  const planning = useUiStore((s) => s.assetStage !== 'idle');
  // Either overlay (threat sim or asset planner) takes over the map and hides the live layers.
  const overlayActive = simulating || planning;

  // pull a snapshot of the persisted view ONCE per layer mount — MapContainer
  // only honors center/zoom at mount time, so we key the container on layerId.
  const persisted = useUiStore.getState().mapViewByLayer[data.layer._id];
  const initialCenter: [number, number] = persisted
    ? [persisted.center.lat, persisted.center.lng]
    : [data.layer.mapCenter.lat, data.layer.mapCenter.lng];
  const initialZoom = persisted?.zoom ?? data.layer.mapZoom;

  const typesById = useMemo(() => {
    const m = new Map<string, (typeof data.types.interceptor)[number]>();
    for (const t of data.types.interceptor) m.set(t._id, t);
    return m;
  }, [data.types.interceptor]);

  const mapRef = useRef<L.Map | null>(null);

  return (
    <MapContainer
      key={data.layer._id}
      ref={(m) => { if (m) mapRef.current = m; }}
      center={initialCenter}
      zoom={initialZoom}
      zoomSnap={0.25}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={120}
      zoomControl={false}
      attributionControl={false}
      className="h-full w-full"
    >
      <TileLayer
        key={styleMode}
        url={styleMode === 'day'
          ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'}
        maxZoom={19}
      />
      <BrickHatchPattern />
      <ZoomLevelClass />
      <ResizeInvalidator />
      <ViewController data={data} />

      <DrawingLayer
        drawings={data.drawings}
        restrictionsVisible={visibility.restrictions}
        editMode={!overlayActive && visibility.edit}
      />

      {!overlayActive && <CoverageLayer interceptors={data.interceptors} typesById={typesById} threads={data.threads} data={data} />}
      {!overlayActive && visibility.controls && visibility.teams && visibility.interceptors && (
        <ControlsLayer threads={data.threads} interceptors={data.interceptors} teams={data.teams} />
      )}
      {!overlayActive && visibility.threats && <ThreatLayer threats={data.threats} threatTypes={data.types.threat} data={data} />}
      {!overlayActive && visibility.interceptors && <InterceptorLayer interceptors={data.interceptors} typesById={typesById} threads={data.threads} data={data} />}
      {!overlayActive && visibility.teams && <TeamLayer teams={data.teams} threads={data.threads} data={data} />}
      {!overlayActive && <EditHandlesLayer threats={data.threats} />}
      {!overlayActive && <DrawingEditHandlesLayer drawings={data.drawings} />}
      {!overlayActive && <AssignmentLinkLayer data={data} />}
      <SimulatorOverlayLayer />
      <AssetPlannerOverlayLayer />
      <MfgHeatmapLayer data={data} />
    </MapContainer>
  );
}
