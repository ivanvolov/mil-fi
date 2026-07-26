import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useParams } from 'react-router-dom';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { LatLng } from '@shared/schemas/common';
import type { Interceptor } from '@shared/schemas/interceptor';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import type { Threat } from '@shared/schemas/threat';
import { useUiStore, isSelected } from '../../stores/uiStore';
import {
  useUpdateInterceptorPosition,
  useUpdateTeamPosition,
  useUpdateThreatGeometry,
  useCreateThreat,
} from '../../queries/useMutations';
import { useOrchestrationFocus } from '../../lib/orchestrationFocus';
import { useMe } from '../../queries/useMe';
import { glyphHtml, threatGlyphHtml } from './glyphs';
import { haversineKm } from '@shared/distance';
import {
  DEMO_STRIKE_ARM_FRACTION,
  DEMO_STRIKE_DURATION_MS,
  buildFlightPath,
  buildRandomThreatBody,
  cumulativeKm,
  pickRandomLiveThreat,
  pointAtFraction,
} from './demoStrike';

const FLYING_DRONE_SVG =
  '<svg width="16" height="16" viewBox="0 0 14 14"><path d="M7 1 L13 13 L1 13 Z" fill="#f59e0b" stroke="#fff7ed" stroke-width="0.75"/></svg>';
const EXPLOSION_HTML = '<div class="hoc-explosion"></div><div class="hoc-explosion-ring"></div>';

/** CARTO GL basemaps (OpenMapTiles schema, no API key).
 *  day = Voyager (full-color), night = Dark Matter (matches the app's dark UI). */
const BASEMAP = {
  day: {
    styleUrl: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    background: '#e8e4de',
    buildings: '#d9d0c9',
    hillshade: { exaggeration: 0.3, shadow: '#473b24', highlight: '#ffffff', accent: '#8a7a5a' },
  },
  night: {
    styleUrl: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    background: '#0a0d12',
    buildings: '#39414d',
    hillshade: { exaggeration: 0.45, shadow: '#000000', highlight: '#5a6a7a', accent: '#1a2028' },
  },
} as const;

/** MapLibre GL zoom levels sit one below Leaflet's for the same visual scale (512px tiles).
 *  All persisted views + layer.mapZoom are Leaflet-scale, so convert at the boundary. */
const toGl = (leafletZoom: number) => leafletZoom - 1;
const fromGl = (glZoom: number) => glZoom + 1;

const COVERAGE_COLORS: Record<string, string> = {
  interceptor: '#06b6d4',
  mfg: '#f59e0b',
  manpads: '#a78bfa',
};

// ---------- geometry helpers ----------

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

function circlePolygon(center: LatLng, radiusM: number, steps = 64): number[][] {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180));
  const ring: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([center.lng + Math.cos(a) * dLng, center.lat + Math.sin(a) * dLat]);
  }
  return ring;
}

function boxRing(c: LatLng, widthM: number, heightM: number): number[][] {
  const dLat = heightM / 2 / 111320;
  const dLng = widthM / 2 / (111320 * Math.cos((c.lat * Math.PI) / 180));
  return [
    [c.lng - dLng, c.lat - dLat],
    [c.lng + dLng, c.lat - dLat],
    [c.lng + dLng, c.lat + dLat],
    [c.lng - dLng, c.lat + dLat],
    [c.lng - dLng, c.lat - dLat],
  ];
}

const lineFeature = (pts: LatLng[], props: Record<string, unknown>) => ({
  type: 'Feature' as const,
  properties: props,
  geometry: { type: 'LineString' as const, coordinates: pts.map((p) => [p.lng, p.lat]) },
});

const polygonFeature = (ring: number[][], props: Record<string, unknown>) => ({
  type: 'Feature' as const,
  properties: props,
  geometry: { type: 'Polygon' as const, coordinates: [ring] },
});

const fc = (features: any[]) => ({ type: 'FeatureCollection' as const, features });

function ensureGeojsonSource(map: maplibregl.Map, id: string, data: any) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(data);
  else map.addSource(id, { type: 'geojson', data });
}

// ---------- marker HTML (same CSS classes as the 2D Leaflet divIcons) ----------

function interceptorStateText(i: Interceptor, t: InterceptorType | undefined) {
  if (!t) return i.state.toUpperCase();
  if (t.category === 'interceptor' || t.category === 'manpads') {
    if (i.state === 'reload' && i.ammo) return `RELOAD · ${i.ammo.reloadEtaSec ?? '?'}s`;
    if (i.ammo) return `READY · ${i.ammo.ready}/${i.ammo.capacity}`;
  }
  return i.state === 'reload' ? 'RELOAD' : 'READY';
}

function interceptorSubtitle(t: InterceptorType | undefined): string {
  if (!t) return '';
  return t.displayName.split(/[\s(/]/)[0] ?? t.displayName;
}

export function Map3DHost({ data }: { data: LayerFull }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [styleReady, setStyleReady] = useState(false);

  const styleMode = useUiStore((s) => s.mapStyleMode);
  const visibility = useUiStore((s) => s.visibility);
  // Opsec: spotters (civilian level 2) never see air-defense assets on the map.
  const assetsHidden = useMe().data?.role === 'spotter';
  const selection = useUiStore((s) => s.selection);
  const selections = useUiStore((s) => s.selections);
  const setSelection = useUiStore((s) => s.setSelection);
  const selectionZoom = useUiStore((s) => s.selectionZoom);
  const setMapView = useUiStore((s) => s.setMapView);
  const editMode = visibility.edit;

  const { slug = 'vzil-1' } = useParams();
  const { mutate: updateInterceptorPos } = useUpdateInterceptorPosition(slug);
  const { mutate: updateTeamPos } = useUpdateTeamPosition(slug);
  const { mutate: updateThreatGeom } = useUpdateThreatGeometry(slug);
  const createThreat = useCreateThreat(slug);

  const focus = useOrchestrationFocus(data);

  // ---------- demo strike animation (headless — button lives in LeftRail) ----------
  const demoStrikeRunningRef = useRef(false);
  const demoStrikeRafRef = useRef<number | null>(null);
  const demoStrikeLastHandledRef = useRef(useUiStore.getState().demoStrikeRequestId);
  const demoStrikeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const demoStrikeRequestId = useUiStore((s) => s.demoStrikeRequestId);
  const setDemoStrikePlaying = useUiStore((s) => s.setDemoStrikePlaying);
  const setDemoStrikeStatus = useUiStore((s) => s.setDemoStrikeStatus);

  const typesById = useMemo(() => {
    const m = new Map<string, InterceptorType>();
    for (const t of data.types.interceptor) m.set(t._id, t);
    return m;
  }, [data.types.interceptor]);

  const threadCountByInterceptor = useMemo(() => {
    const m = new Map<string, number>();
    for (const th of data.threads) m.set(th.interceptorId, (m.get(th.interceptorId) ?? 0) + 1);
    return m;
  }, [data.threads]);

  const threadCountByTeam = useMemo(() => {
    const m = new Map<string, number>();
    for (const th of data.threads) m.set(th.teamId, (m.get(th.teamId) ?? 0) + 1);
    return m;
  }, [data.threads]);

  const layerId = data.layer._id;

  // ---------- map lifecycle (one map per sector + palette; palette change remounts) ----------
  useEffect(() => {
    if (!containerRef.current) return;

    const palette = BASEMAP[styleMode];
    const persisted = useUiStore.getState().mapViewByLayer[layerId];
    const center = persisted?.center ?? data.layer.mapCenter;
    const zoom = toGl(persisted?.zoom ?? data.layer.mapZoom);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: palette.styleUrl,
      center: [center.lng, center.lat],
      zoom,
      pitch: 55,
      bearing: -15,
      maxPitch: 75,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.touchZoomRotate.enableRotation();

    map.on('load', () => {
      const style = map.getStyle();
      const vectorSource = Object.entries(style.sources).find(([, s]) => (s as any).type === 'vector')?.[0];
      const firstSymbol = style.layers.find((l: { type: string }) => l.type === 'symbol')?.id;

      // Real 3D terrain from the open Mapzen/Terrarium elevation tileset (AWS Open Data,
      // no key). Two separate DEM sources: MapLibre can't share one between setTerrain
      // and a hillshade layer. Exaggeration >1 because Lisbon's hills are ~100-200 m.
      const DEM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];
      if (!map.getSource('hoc-terrain-dem')) {
        map.addSource('hoc-terrain-dem', {
          type: 'raster-dem', tiles: DEM_TILES, encoding: 'terrarium',
          tileSize: 256, maxzoom: 14,
          attribution: 'Terrain © Mapzen/USGS/SRTM',
        });
        map.addSource('hoc-hillshade-dem', {
          type: 'raster-dem', tiles: DEM_TILES, encoding: 'terrarium',
          tileSize: 256, maxzoom: 14,
        });
        map.setTerrain({ source: 'hoc-terrain-dem', exaggeration: 1.5 });
        // hillshade makes the relief readable even at city-wide zoom / low pitch
        map.addLayer(
          {
            id: 'hoc-hillshade',
            type: 'hillshade',
            source: 'hoc-hillshade-dem',
            paint: {
              'hillshade-exaggeration': palette.hillshade.exaggeration,
              'hillshade-shadow-color': palette.hillshade.shadow,
              'hillshade-highlight-color': palette.hillshade.highlight,
              'hillshade-accent-color': palette.hillshade.accent,
            },
          },
          firstSymbol,
        );
      }

      // 3D building extrusions from the basemap's own vector tiles (OpenMapTiles
      // `building` layer). Inserted under the first symbol layer so labels stay on top.
      if (vectorSource && !map.getLayer('hoc-3d-buildings')) {
        map.addLayer(
          {
            id: 'hoc-3d-buildings',
            type: 'fill-extrusion',
            source: vectorSource,
            'source-layer': 'building',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': palette.buildings,
              'fill-extrusion-height': [
                'coalesce',
                ['to-number', ['get', 'render_height']],
                ['to-number', ['get', 'height']],
                12,
              ],
              'fill-extrusion-base': ['coalesce', ['to-number', ['get', 'render_min_height']], 0],
              'fill-extrusion-opacity': 0.85,
            },
          },
          firstSymbol,
        );
      }
      // mountain button: toggles the terrain mesh on/off (hillshade stays either way)
      map.addControl(
        new maplibregl.TerrainControl({ source: 'hoc-terrain-dem', exaggeration: 1.5 }),
        'bottom-right',
      );

      setStyleReady(true);
    });

    // reuse the Leaflet zoom-level container classes so compact/full marker CSS applies
    const applyZoomClass = () => {
      const z = Math.round(fromGl(map.getZoom()));
      const el = map.getContainer();
      el.className = el.className
        .split(' ')
        .filter((c) => !c.startsWith('leaflet-zoom-level-'))
        .concat([`leaflet-zoom-level-${z}`])
        .join(' ');
    };
    applyZoomClass();
    map.on('zoomend', applyZoomClass);

    // persist view in the same store slot the 2D map reads (Leaflet-scale zoom)
    const save = () => {
      const c = map.getCenter();
      setMapView(layerId, { center: { lat: c.lat, lng: c.lng }, zoom: fromGl(map.getZoom()) });
    };
    map.on('moveend', save);

    mapRef.current = map;
    if (import.meta.env.DEV) (window as any).__hocMap3d = map;
    return () => {
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      mapRef.current = null;
      setStyleReady(false);
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, styleMode]);

  // ---------- markers (interceptors + teams + threats) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const wireClick = (el: HTMLElement, kind: 'interceptor' | 'team' | 'threat', id: string) => {
      el.addEventListener('click', (oe) => {
        oe.stopPropagation();
        const shift = oe.shiftKey;
        const cmd = oe.metaKey || oe.ctrlKey;
        const cur = useUiStore.getState().selection;
        if (shift) { setSelection({ kind, id }, { additive: true, zoom: cmd }); return; }
        const isCurrent = cur?.kind === kind && cur.id === id;
        if (cmd) setSelection({ kind, id }, { zoom: true });
        else if (isCurrent) setSelection(null);
        else setSelection({ kind, id });
      });
    };

    if (visibility.interceptors && !assetsHidden) {
      for (const i of data.interceptors) {
        if (focus && !focus.launcherIds.has(i._id)) continue;
        const t = typesById.get(i.typeId);
        const cat = t?.category ?? 'interceptor';
        const selected = isSelected(selections, 'interceptor', i._id);
        const needsCrew = t?.requiresCrew && (threadCountByInterceptor.get(i._id) ?? 0) === 0;
        const stateClass = i.state === 'reload' ? 'reload' : i.state === 'offline' ? 'offline' : '';
        const el = document.createElement('div');
        el.className = ['hoc-marker', selected ? 'selected' : '', needsCrew ? 'not-operational' : '']
          .filter(Boolean).join(' ');
        el.innerHTML = `
          <div class="marker-compact" data-id="${i._id}">
            ${glyphHtml(cat, 12)}
            <span class="id">${i.code}</span>
          </div>
          <div class="marker-full" data-id="${i._id}">
            <div class="marker-glyph">${glyphHtml(cat, 20)}</div>
            <div class="marker-label">
              <div class="id">${i.code}</div>
              <div class="sub">${interceptorSubtitle(t)}</div>
              <div class="state ${stateClass}">${interceptorStateText(i, t)}</div>
            </div>
          </div>`;
        wireClick(el, 'interceptor', i._id);
        const marker = new maplibregl.Marker({ element: el, draggable: editMode })
          .setLngLat([i.position.lng, i.position.lat])
          .addTo(map);
        if (editMode) {
          marker.on('dragend', () => {
            const ll = marker.getLngLat();
            updateInterceptorPos({
              layerId: i.layerId, id: i._id,
              position: { lat: ll.lat, lng: ll.lng },
              version: i.version,
            });
          });
        }
        markersRef.current.push(marker);
      }
    }

    if (visibility.teams && !assetsHidden) {
      for (const c of data.teams) {
        if (focus && !focus.teamIds.has(c._id)) continue;
        const selected = isSelected(selections, 'team', c._id);
        const n = threadCountByTeam.get(c._id) ?? 0;
        const el = document.createElement('div');
        el.className = 'hoc-crew-marker' + (selected ? ' selected' : '');
        el.innerHTML = `
          <div class="crew-compact" data-id="${c._id}"><span class="id">${c.code}</span></div>
          <div class="crew-full" data-id="${c._id}">
            <div class="crew-glyph">${c.code}</div>
            <div class="crew-label">
              <div class="id">${c.code}</div>
              <div class="sub">${n} launcher${n === 1 ? '' : 's'}</div>
            </div>
          </div>`;
        wireClick(el, 'team', c._id);
        const marker = new maplibregl.Marker({ element: el, draggable: editMode })
          .setLngLat([c.position.lng, c.position.lat])
          .addTo(map);
        if (editMode) {
          marker.on('dragend', () => {
            const ll = marker.getLngLat();
            updateTeamPos({
              layerId: c.layerId, id: c._id,
              position: { lat: ll.lat, lng: ll.lng },
              version: c.version,
            });
          });
        }
        markersRef.current.push(marker);
      }
    }

    if (visibility.threats) {
      for (const t of data.threats) {
        if (focus && t._id !== focus.threatId) continue;
        const selected = isSelected(selections, 'threat', t._id);
        const el = document.createElement('div');
        el.className = 'hoc-threat-marker' + (selected ? ' selected' : '');
        el.innerHTML = `<div class="threat-compact" data-id="${t._id}">${threatGlyphHtml()}</div>`;
        wireClick(el, 'threat', t._id);
        const marker = new maplibregl.Marker({ element: el, draggable: editMode })
          .setLngLat([t.position.lng, t.position.lat])
          .addTo(map);
        if (editMode) {
          marker.on('dragend', () => {
            const ll = marker.getLngLat();
            // keep pastPath tail + futureCruise head glued to the live position (same as 2D)
            const nextGeom = { ...t.geometry };
            if (nextGeom.pastPath && nextGeom.pastPath.length > 0) {
              nextGeom.pastPath = nextGeom.pastPath.slice();
              nextGeom.pastPath[nextGeom.pastPath.length - 1] = { lat: ll.lat, lng: ll.lng };
              if (nextGeom.futureCruise && nextGeom.futureCruise.length > 0) {
                nextGeom.futureCruise = nextGeom.futureCruise.slice();
                nextGeom.futureCruise[0] = { lat: ll.lat, lng: ll.lng };
              }
            }
            updateThreatGeom({
              layerId: t.layerId, id: t._id,
              geometry: nextGeom,
              position: { lat: ll.lat, lng: ll.lng },
              version: t.version,
            });
          });
        }
        markersRef.current.push(marker);
      }
    }
  }, [
    data, typesById, threadCountByInterceptor, threadCountByTeam, visibility.interceptors,
    visibility.teams, visibility.threats, selections, setSelection, editMode, focus,
    updateInterceptorPos, updateTeamPos, updateThreatGeom, styleReady, assetsHidden,
  ]);

  // ---------- threat geometry (paths, divergence box, detonation) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    const lines: any[] = [];
    const polys: any[] = [];
    if (visibility.threats) {
      for (const t of data.threats) {
        if (focus && t._id !== focus.threatId) continue;
        const g = t.geometry;
        if (g.pastPath) lines.push(lineFeature(chaikinSmooth(g.pastPath), { role: 'past' }));
        if (g.futureCruise) lines.push(lineFeature(g.futureCruise, { role: 'cruise' }));
        if (g.futureAttack) lines.push(lineFeature(g.futureAttack, { role: 'attack' }));
        if (g.divergence && g.detonation) {
          polys.push(polygonFeature(
            boxRing(g.detonation, g.divergence.widthM, g.divergence.heightM),
            { role: 'divergence' },
          ));
        }
        if (g.detonation) {
          polys.push(polygonFeature(
            circlePolygon({ lat: g.detonation.lat, lng: g.detonation.lng }, g.detonation.radiusM),
            { role: 'detonation' },
          ));
        }
      }
    }

    ensureGeojsonSource(map, 'hoc-threat-lines', fc(lines));
    ensureGeojsonSource(map, 'hoc-threat-areas', fc(polys));

    if (!map.getLayer('hoc-threat-detonation-fill')) {
      map.addLayer({
        id: 'hoc-threat-detonation-fill', type: 'fill', source: 'hoc-threat-areas',
        filter: ['==', ['get', 'role'], 'detonation'],
        paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.22 },
      });
      map.addLayer({
        id: 'hoc-threat-divergence-fill', type: 'fill', source: 'hoc-threat-areas',
        filter: ['==', ['get', 'role'], 'divergence'],
        paint: { 'fill-color': '#c2410c', 'fill-opacity': 0.05 },
      });
      map.addLayer({
        id: 'hoc-threat-areas-line', type: 'line', source: 'hoc-threat-areas',
        paint: {
          'line-color': ['case', ['==', ['get', 'role'], 'detonation'], '#ef4444', '#c2410c'],
          'line-width': 1.5,
        },
      });
      map.addLayer({
        id: 'hoc-threat-past', type: 'line', source: 'hoc-threat-lines',
        filter: ['==', ['get', 'role'], 'past'],
        paint: { 'line-color': '#eab308', 'line-width': 2, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'hoc-threat-cruise', type: 'line', source: 'hoc-threat-lines',
        filter: ['==', ['get', 'role'], 'cruise'],
        paint: { 'line-color': '#eab308', 'line-width': 2, 'line-opacity': 0.75, 'line-dasharray': [2.5, 2] },
      });
      map.addLayer({
        id: 'hoc-threat-attack', type: 'line', source: 'hoc-threat-lines',
        filter: ['==', ['get', 'role'], 'attack'],
        paint: { 'line-color': '#ef4444', 'line-width': 2.5, 'line-opacity': 0.9, 'line-dasharray': [2.5, 2] },
      });
    }
  }, [data.threats, visibility.threats, focus, styleReady]);

  // ---------- drawings (restriction zones etc.) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    const feats: any[] = [];
    for (const d of data.drawings) {
      const forceInEdit = editMode && (d.kind === 'noPlacementZone' || d.kind === 'noEngagementZone');
      if (!forceInEdit && !(visibility.restrictions && d.visible)) continue;
      // brick-hatch SVG pattern is Leaflet-only — approximate with a translucent fill
      const fillOpacity = d.kind === 'noPlacementZone' ? 0.18 : d.style?.patternId === 'brick-hatch' ? 0.16 : 0.06;
      const props = {
        stroke: d.style?.stroke ?? '#888',
        fill: d.kind === 'noPlacementZone' ? '#a855f7' : d.style?.fill ?? d.style?.stroke ?? '#888',
        weight: d.style?.weight ?? 1.5,
        fillOpacity,
      };
      const g = d.geometry;
      if (g.type === 'polygon') {
        const ring = g.points.map((p) => [p.lng, p.lat]);
        if (ring.length > 0) ring.push(ring[0]!);
        feats.push(polygonFeature(ring, props));
      } else if (g.type === 'circle') {
        feats.push(polygonFeature(circlePolygon(g.center, g.radiusM), props));
      } else if (g.type === 'rectangle') {
        feats.push(polygonFeature(boxRing(
          { lat: (g.sw.lat + g.ne.lat) / 2, lng: (g.sw.lng + g.ne.lng) / 2 },
          Math.abs(g.ne.lng - g.sw.lng) * 111320 * Math.cos((((g.sw.lat + g.ne.lat) / 2) * Math.PI) / 180),
          Math.abs(g.ne.lat - g.sw.lat) * 111320,
        ), props));
      }
    }

    ensureGeojsonSource(map, 'hoc-drawings', fc(feats));
    if (!map.getLayer('hoc-drawings-fill')) {
      map.addLayer({
        id: 'hoc-drawings-fill', type: 'fill', source: 'hoc-drawings',
        paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': ['get', 'fillOpacity'] },
      });
      map.addLayer({
        id: 'hoc-drawings-line', type: 'line', source: 'hoc-drawings',
        paint: { 'line-color': ['get', 'stroke'], 'line-width': ['get', 'weight'] },
      });
    }
  }, [data.drawings, visibility.restrictions, editMode, styleReady]);

  // ---------- coverage rings (selection-driven, same rules as the 2D layer) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    const feats: any[] = [];
    if (visibility.coverage && !assetsHidden) {
      let visibleIds: Set<string>;
      if (focus) {
        visibleIds = focus.launcherIds;
      } else {
        visibleIds = new Set();
        for (const sel of selections) {
          if (sel.kind === 'interceptor') visibleIds.add(sel.id);
          else if (sel.kind === 'team') {
            for (const th of data.threads) if (th.teamId === sel.id) visibleIds.add(th.interceptorId);
          }
        }
      }
      for (const i of data.interceptors) {
        if (!visibleIds.has(i._id)) continue;
        const t = typesById.get(i.typeId);
        if (!t) continue;
        const color = COVERAGE_COLORS[t.category] ?? '#06b6d4';
        feats.push(polygonFeature(circlePolygon(i.position, t.envelope.rangeKm * 1000, 96), { color }));
      }
    }

    ensureGeojsonSource(map, 'hoc-coverage', fc(feats));
    if (!map.getLayer('hoc-coverage-fill')) {
      map.addLayer({
        id: 'hoc-coverage-fill', type: 'fill', source: 'hoc-coverage',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.06 },
      });
      map.addLayer({
        id: 'hoc-coverage-line', type: 'line', source: 'hoc-coverage',
        paint: { 'line-color': ['get', 'color'], 'line-width': 1.4, 'line-opacity': 0.95 },
      });
    }
  }, [data.interceptors, data.threads, typesById, selections, visibility.coverage, focus, styleReady, assetsHidden]);

  // ---------- control-thread lines (crew ↔ launcher) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    const feats: any[] = [];
    if (visibility.controls && visibility.teams && visibility.interceptors && !assetsHidden) {
      const teamById = new Map(data.teams.map((t) => [t._id, t]));
      const interById = new Map(data.interceptors.map((i) => [i._id, i]));
      for (const th of data.threads) {
        const team = teamById.get(th.teamId);
        const inter = interById.get(th.interceptorId);
        if (!team || !inter) continue;
        feats.push(lineFeature([team.position, inter.position], { kind: th.kind }));
      }
    }

    ensureGeojsonSource(map, 'hoc-controls', fc(feats));
    if (!map.getLayer('hoc-controls-primary')) {
      map.addLayer({
        id: 'hoc-controls-primary', type: 'line', source: 'hoc-controls',
        filter: ['!=', ['get', 'kind'], 'override'],
        paint: { 'line-color': '#06b6d4', 'line-width': 1, 'line-opacity': 0.55 },
      });
      map.addLayer({
        id: 'hoc-controls-override', type: 'line', source: 'hoc-controls',
        filter: ['==', ['get', 'kind'], 'override'],
        paint: { 'line-color': '#06b6d4', 'line-width': 1, 'line-opacity': 0.7, 'line-dasharray': [2.5, 2] },
      });
    }
  }, [data.teams, data.interceptors, data.threads, visibility.controls, visibility.teams, visibility.interceptors, styleReady, assetsHidden]);

  // ---------- ⌘-click selection framing ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectionZoom) return;

    const pts: [number, number][] = []; // [lng, lat]
    const push = (p?: LatLng | null) => { if (p) pts.push([p.lng, p.lat]); };

    const collect = (item: { kind: string; id: string }) => {
      if (item.kind === 'interceptor') {
        const i = data.interceptors.find((x) => x._id === item.id);
        push(i?.position);
        if (i) {
          const crewIds = new Set(data.threads.filter((th) => th.interceptorId === i._id).map((th) => th.teamId));
          for (const tm of data.teams) if (crewIds.has(tm._id)) push(tm.position);
        }
      } else if (item.kind === 'team') {
        const t = data.teams.find((x) => x._id === item.id);
        push(t?.position);
        if (t) {
          const interIds = new Set(data.threads.filter((th) => th.teamId === t._id).map((th) => th.interceptorId));
          for (const i of data.interceptors) if (interIds.has(i._id)) push(i.position);
        }
      } else if (item.kind === 'threat') {
        const t = data.threats.find((x) => x._id === item.id);
        if (!t) return;
        push(t.position);
        if (t.geometry.detonation) push({ lat: t.geometry.detonation.lat, lng: t.geometry.detonation.lng });
        for (const p of t.geometry.pastPath ?? []) push(p);
        for (const p of t.geometry.futureCruise ?? []) push(p);
        for (const p of t.geometry.futureAttack ?? []) push(p);
      } else if (item.kind === 'drawing') {
        const d = data.drawings.find((x) => x._id === item.id);
        if (!d) return;
        const g = d.geometry;
        if (g.type === 'polygon') for (const p of g.points) push(p);
        else if (g.type === 'rectangle') { push(g.sw); push(g.ne); }
        else if (g.type === 'circle') {
          const ring = circlePolygon(g.center, g.radiusM, 8);
          for (const c of ring) pts.push([c[0]!, c[1]!]);
        }
      }
    };

    if (selection) collect(selection);
    else for (const s of selections) collect(s);
    if (pts.length === 0) return;

    // Weapons/crews zoom in tight (~200 m scale); threats/drawings frame their geometry wide.
    const kind = selection?.kind;
    const maxZoom = toGl(kind === 'interceptor' || kind === 'team' ? 18 : 12.5);

    if (pts.length === 1) {
      map.flyTo({ center: pts[0]!, zoom: maxZoom, duration: 900 });
      return;
    }
    const bounds = pts.reduce(
      (b, p) => b.extend(p as [number, number]),
      new maplibregl.LngLatBounds(pts[0]!, pts[0]!),
    );
    map.fitBounds(bounds, { padding: 80, maxZoom, duration: 900 });
  }, [selection, selections, selectionZoom, data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (demoStrikeRequestId === demoStrikeLastHandledRef.current) return;
    demoStrikeLastHandledRef.current = demoStrikeRequestId;
    void runDemoStrike3D(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoStrikeRequestId, styleReady]);

  async function runDemoStrike3D(map: maplibregl.Map) {
    if (demoStrikeRunningRef.current) return;
    demoStrikeRunningRef.current = true;
    setDemoStrikePlaying(true);

    let threat: Threat | null = pickRandomLiveThreat(data.threats);
    if (!threat) {
      setDemoStrikeStatus('Spawning threat…');
      const c = map.getCenter();
      const body = buildRandomThreatBody(data, { lat: c.lat, lng: c.lng });
      threat = body ? await createThreat.mutateAsync({ layerId: data.layer._id, body }).catch(() => null) : null;
      if (!threat) {
        setDemoStrikeStatus('Could not spawn a threat — check threat types are configured');
        setDemoStrikePlaying(false);
        demoStrikeRunningRef.current = false;
        window.setTimeout(() => setDemoStrikeStatus(null), 2200);
        return;
      }
    }

    const det = threat.geometry.detonation!;
    const path = buildFlightPath(threat.position, { ...threat.geometry, detonation: det });
    const cum = cumulativeKm(path);
    const shooter = data.interceptors.length
      ? data.interceptors.reduce((closest, i) =>
          haversineKm(i.position, det) < haversineKm(closest.position, det) ? i : closest,
        data.interceptors[0]!)
      : null;

    setDemoStrikeStatus(`Tracking ${threat.code}…`);

    const droneEl = document.createElement('div');
    droneEl.className = 'hoc-flying-drone';
    droneEl.innerHTML = FLYING_DRONE_SVG;
    const drone = new maplibregl.Marker({ element: droneEl })
      .setLngLat([path[0]!.lng, path[0]!.lat])
      .addTo(map);
    demoStrikeMarkersRef.current.push(drone);

    ensureGeojsonSource(map, 'hoc-demo-tracer', fc([]));
    if (!map.getLayer('hoc-demo-tracer-line')) {
      map.addLayer({
        id: 'hoc-demo-tracer-line', type: 'line', source: 'hoc-demo-tracer',
        paint: { 'line-color': '#22c55e', 'line-width': 2, 'line-dasharray': [3, 4], 'line-opacity': 0.9 },
      });
    }

    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const frac = Math.min(1, (now - start) / DEMO_STRIKE_DURATION_MS);
      const pos = pointAtFraction(path, cum, frac);
      drone.setLngLat([pos.lng, pos.lat]);

      if (shooter && frac >= DEMO_STRIKE_ARM_FRACTION) {
        ensureGeojsonSource(map, 'hoc-demo-tracer', fc([lineFeature([shooter.position, pos], {})]));
      }

      if (frac < 1) {
        demoStrikeRafRef.current = requestAnimationFrame(step);
        return;
      }

      drone.remove();
      demoStrikeMarkersRef.current = demoStrikeMarkersRef.current.filter((m) => m !== drone);
      ensureGeojsonSource(map, 'hoc-demo-tracer', fc([]));

      const boomEl = document.createElement('div');
      boomEl.className = 'hoc-explosion-marker';
      boomEl.innerHTML = EXPLOSION_HTML;
      const boom = new maplibregl.Marker({ element: boomEl }).setLngLat([det.lng, det.lat]).addTo(map);
      demoStrikeMarkersRef.current.push(boom);
      window.setTimeout(() => {
        boom.remove();
        demoStrikeMarkersRef.current = demoStrikeMarkersRef.current.filter((m) => m !== boom);
      }, 900);

      setDemoStrikeStatus(`${threat.code} neutralized`);
      window.setTimeout(() => setDemoStrikeStatus(null), 2000);
      demoStrikeRafRef.current = null;
      demoStrikeRunningRef.current = false;
      setDemoStrikePlaying(false);
    };
    demoStrikeRafRef.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    return () => {
      if (demoStrikeRafRef.current !== null) cancelAnimationFrame(demoStrikeRafRef.current);
      for (const m of demoStrikeMarkersRef.current) m.remove();
      demoStrikeMarkersRef.current = [];
      // Unmounting mid-animation (e.g. switching back to 2D) would otherwise strand the
      // LeftRail button permanently disabled — release the lock.
      if (demoStrikeRunningRef.current) {
        demoStrikeRunningRef.current = false;
        setDemoStrikePlaying(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full hoc-map3d"
      style={{ background: BASEMAP[styleMode].background }}
    />
  );
}
