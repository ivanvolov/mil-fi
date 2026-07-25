import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { LatLng } from '@shared/schemas/common';
import { useUiStore } from '../../../stores/uiStore';
import { computeMfgHeatmap, type MfgHeatmap } from '@algos/placement/mfg-placement';
import { npzRingsKm, currentDescentLengthKm, maxMfgRangeKm } from '../../../lib/assetPlanning';

const KM_PER_LAT_DEG = 111.32;
function offsetEastLng(lat: number, lng: number, km: number): number {
  const kmPerLng = KM_PER_LAT_DEG * Math.cos((lat * Math.PI) / 180) || KM_PER_LAT_DEG;
  return lng + km / kmPerLng;
}

function strokeRing(
  ctx: CanvasRenderingContext2D,
  map: L.Map,
  center: LatLng,
  rKm: number,
  color: string,
): void {
  if (rKm <= 0) return;
  const N = 72;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * 2 * Math.PI;
    const lat = center.lat + (rKm * Math.cos(th)) / KM_PER_LAT_DEG;
    const lng = offsetEastLng(center.lat, center.lng, rKm * Math.sin(th));
    const p = map.latLngToContainerPoint([lat, lng]);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

type Model = MfgHeatmap & { center: LatLng };

/**
 * Always-on diagnostic overlay (Layers → Heatmap, off by default). Two things at once:
 *  - GREEN = the donut [R_p, R_p + L] the MFG groups must cover (the coverage requirement).
 *  - BLUE = the placement field, every legal spot shaded by how much donut a fire group there would
 *    cover — the surface the greedy climbs. Reaches 1.5× the MFG range past the donut, minus NPZ.
 * No-placement zones are carved straight out of both (holes). Anchored to the protection point set
 * in Manage Assets (falls back to the sector's map center). Matches Apply: same inputs.
 */
export function MfgHeatmapLayer({ data }: { data: LayerFull }) {
  const map = useMap();
  const on = useUiStore((s) => s.visibility.heatmap);
  const assetCenter = useUiStore((s) => s.assetCenter);
  const assetRadiusKm = useUiStore((s) => s.assetRadiusKm);
  const heatmapCellKm = useUiStore((s) => s.heatmapCellKm);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const model = useMemo<Model | null>(() => {
    if (!on) return null;
    const center = assetCenter ?? data.layer.mapCenter;
    const descentKm = currentDescentLengthKm(data.threats, data.types.threat);
    const mfgRange = maxMfgRangeKm(data.types.interceptor);
    const exclusions = npzRingsKm(data.drawings, center);
    const h = computeMfgHeatmap(center, Math.max(0, assetRadiusKm), descentKm, mfgRange, exclusions, heatmapCellKm);
    return { center, ...h };
    // assetCenter compared by value so a drag/edit re-computes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, assetCenter?.lat, assetCenter?.lng, assetRadiusKm, heatmapCellKm, data.layer.mapCenter, data.types.interceptor, data.types.threat, data.threats, data.drawings]);

  useEffect(() => {
    if (!model) {
      if (canvasRef.current) { canvasRef.current.remove(); canvasRef.current = null; }
      return;
    }

    if (!canvasRef.current) {
      // `leaflet-zoom-animated`: canvas is NOT auto-hidden on zoom. Our zoomanim
      // handler scales it smoothly instead — this is what makes manual wheel/pinch
      // zoom look right. The programmatic pan case (flyTo, click-to-focus setView)
      // is handled separately by the `move` listener below.
      const c = L.DomUtil.create('canvas', 'leaflet-zoom-animated') as HTMLCanvasElement;
      c.style.position = 'absolute';
      c.style.pointerEvents = 'none';
      c.style.zIndex = '350'; // above tiles (200), below vector shapes/markers (400+)
      map.getPanes().overlayPane.appendChild(c);
      canvasRef.current = c;
    }
    const canvas = canvasRef.current;
    const { center } = model;

    const draw = () => {
      const size = map.getSize();
      // setPosition writes translate3d(...) into style.transform — this fully replaces any
      // leftover scale/translate from a mid-flight zoomanim, so no explicit clear needed
      // (and clearing AFTER this would blow away the position, pinning the canvas at 0,0).
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      canvas.width = size.x;
      canvas.height = size.y;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, size.x, size.y);

      // pixel size of one grid cell, from projecting a cell-width east of center
      const p0 = map.latLngToContainerPoint([center.lat, center.lng]);
      const pE = map.latLngToContainerPoint([center.lat, offsetEastLng(center.lat, center.lng, model.cellKm)]);
      const cellPx = Math.max(2, Math.abs(pE.x - p0.x));
      // Snap every cell to integer pixels + a fixed integer footprint. Sub-pixel fillRect
      // gets antialiased by the browser and adjacent cells' fuzzed edges add up unevenly —
      // that's what makes the grid look "some bigger, some smaller." Rounded stride +
      // Math.ceil(cellPx) + 1 gives a consistent 1-px overlap between neighbours, so
      // every visible cell has the same footprint.
      const cellSizePx = Math.ceil(cellPx) + 1;
      const half = cellPx / 2;

      // BLUE placement field first (gain shading) …
      for (const cell of model.candidateCells) {
        const t = cell.gain / model.maxGain;
        const p = map.latLngToContainerPoint([cell.lat, cell.lng]);
        ctx.fillStyle = `rgba(59, 130, 246, ${0.10 + t * 0.5})`;
        ctx.fillRect(Math.round(p.x - half), Math.round(p.y - half), cellSizePx, cellSizePx);
      }
      // … then the GREEN donut requirement on top, so the ring the MFGs must cover reads clearly.
      ctx.fillStyle = 'rgba(63, 184, 79, 0.32)';
      for (const cell of model.demandCells) {
        const p = map.latLngToContainerPoint([cell.lat, cell.lng]);
        ctx.fillRect(Math.round(p.x - half), Math.round(p.y - half), cellSizePx, cellSizePx);
      }

      // reference rings: inner = protected radius, outer = donut edge (both green)
      strokeRing(ctx, map, center, model.rInnerKm, 'rgba(63,184,79,0.85)');
      strokeRing(ctx, map, center, model.rOuterKm, 'rgba(63,184,79,0.9)');
    };

    // Smooth manual zoom (wheel, pinch, dblclick, setView with animate). Leaflet fires
    // zoomanim once with target zoom+center; scale+translate the canvas to match.
    // `_latLngToNewLayerPoint` is private but stable — same call L.SVG uses.
    const onZoomAnim = (e: L.LeafletEvent & { zoom: number; center: L.LatLng }) => {
      const scale = map.getZoomScale(e.zoom, map.getZoom());
      const nwLatLng = map.containerPointToLatLng([0, 0]);
      const newTopLeft = (map as unknown as {
        _latLngToNewLayerPoint(latlng: L.LatLng, zoom: number, center: L.LatLng): L.Point;
      })._latLngToNewLayerPoint(nwLatLng, e.zoom, e.center);
      L.DomUtil.setTransform(canvas, newTopLeft, scale);
    };

    // Programmatic pan (flyTo, click-to-focus) fires `move` per frame but no zoomanim,
    // so the canvas would sit frozen at its old anchor until moveend. Redraw each frame
    // to keep it glued to the map. Two guards:
    //  - hand-drag: canvas rides overlayPane's own transform, no redraw needed
    //  - real zoom animation: zoomanim handler owns the transform; redraw would fight it
    let isDragging = false;
    const onDragStart = () => { isDragging = true; };
    const onDragEnd = () => { isDragging = false; };
    const onMove = () => {
      if (isDragging) return;
      if ((map as unknown as { _animatingZoom?: boolean })._animatingZoom) return;
      draw();
    };

    draw();
    map.on('moveend zoomend resize viewreset', draw);
    map.on('zoomanim', onZoomAnim);
    map.on('dragstart', onDragStart);
    map.on('dragend', onDragEnd);
    map.on('move', onMove);
    return () => {
      map.off('moveend zoomend resize viewreset', draw);
      map.off('zoomanim', onZoomAnim);
      map.off('dragstart', onDragStart);
      map.off('dragend', onDragEnd);
      map.off('move', onMove);
    };
  }, [model, map]);

  // teardown on unmount
  useEffect(
    () => () => {
      if (canvasRef.current) { canvasRef.current.remove(); canvasRef.current = null; }
    },
    [],
  );

  return null;
}
