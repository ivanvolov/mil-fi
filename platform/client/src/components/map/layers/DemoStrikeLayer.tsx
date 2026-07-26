import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { LatLng } from '@shared/schemas/common';
import { haversineKm } from '@shared/distance';
import { MapCornerPanel } from '../../shared/MapCornerPanel';
import { buttonPrimary } from '../../shared/Dialog';

const FLYING_DRONE_SVG =
  '<svg width="16" height="16" viewBox="0 0 14 14"><path d="M7 1 L13 13 L1 13 Z" fill="#f59e0b" stroke="#fff7ed" stroke-width="0.75"/></svg>';
const EXPLOSION_HTML = '<div class="hoc-explosion"></div><div class="hoc-explosion-ring"></div>';

const DURATION_MS = 3200;
const ARM_FRACTION = 0.6;

/** Concatenates a threat's current position + its cruise/attack legs into one flight path,
 *  ending at the detonation point, deduping near-identical adjacent points at leg boundaries. */
function buildFlightPath(position: LatLng, geometry: { futureCruise: LatLng[] | null; futureAttack: LatLng[] | null; detonation: { lat: number; lng: number } }): LatLng[] {
  const raw: LatLng[] = [position, ...(geometry.futureCruise ?? []), ...(geometry.futureAttack ?? []), geometry.detonation];
  const out: LatLng[] = [];
  for (const p of raw) {
    const last = out[out.length - 1];
    if (!last || haversineKm(last, p) > 0.001) out.push(p);
  }
  return out;
}

function cumulativeKm(pts: LatLng[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + haversineKm(pts[i - 1]!, pts[i]!));
  return cum;
}

function pointAtFraction(pts: LatLng[], cum: number[], frac: number): LatLng {
  const total = cum[cum.length - 1]!;
  if (total <= 0) return pts[pts.length - 1]!;
  const target = frac * total;
  for (let i = 1; i < cum.length; i++) {
    if (target <= cum[i]!) {
      const segLen = cum[i]! - cum[i - 1]!;
      const segT = segLen > 0 ? (target - cum[i - 1]!) / segLen : 0;
      const a = pts[i - 1]!, b = pts[i]!;
      return { lat: a.lat + (b.lat - a.lat) * segT, lng: a.lng + (b.lng - a.lng) * segT };
    }
  }
  return pts[pts.length - 1]!;
}

/** Demo-only control: picks a random threat that has a detonation point and animates it
 *  flying its cruise/attack path while the nearest interceptor "tracks" it, ending in a
 *  hit effect at the detonation point. Nothing here touches persisted state. */
export function DemoStrikeLayer({ data }: { data: LayerFull }) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const rafRef = useRef<number | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    groupRef.current = L.layerGroup().addTo(map);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (statusTimeoutRef.current !== null) window.clearTimeout(statusTimeoutRef.current);
      groupRef.current?.remove();
      groupRef.current = null;
    };
  }, [map]);

  function flashStatus(msg: string, ms: number) {
    if (statusTimeoutRef.current !== null) window.clearTimeout(statusTimeoutRef.current);
    setStatus(msg);
    statusTimeoutRef.current = window.setTimeout(() => setStatus(null), ms);
  }

  function onStrike() {
    const group = groupRef.current;
    if (playing || !group) return;

    const candidates = data.threats.filter((t) => t.geometry.detonation);
    if (candidates.length === 0) {
      flashStatus('No live threats — run Threat Simulator first', 2000);
      return;
    }
    const threat = candidates[Math.floor(Math.random() * candidates.length)]!;
    const det = threat.geometry.detonation!;
    const path = buildFlightPath(threat.position, { ...threat.geometry, detonation: det });
    const cum = cumulativeKm(path);
    const shooter = data.interceptors.length
      ? data.interceptors.reduce((closest, i) =>
          haversineKm(i.position, det) < haversineKm(closest.position, det) ? i : closest,
        data.interceptors[0]!)
      : null;

    setPlaying(true);
    flashStatus(`Tracking ${threat.code}…`, DURATION_MS + 400);

    const drone = L.marker([path[0]!.lat, path[0]!.lng], {
      icon: L.divIcon({ className: 'hoc-flying-drone', html: FLYING_DRONE_SVG, iconSize: [0, 0], iconAnchor: [0, 0] }),
      interactive: false,
    }).addTo(group);

    const tracer = shooter
      ? L.polyline([[shooter.position.lat, shooter.position.lng], [shooter.position.lat, shooter.position.lng]], {
          color: '#22c55e', weight: 2, dashArray: '3 4', opacity: 0,
        }).addTo(group)
      : null;

    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const frac = Math.min(1, (now - start) / DURATION_MS);
      const pos = pointAtFraction(path, cum, frac);
      drone.setLatLng([pos.lat, pos.lng]);

      if (tracer && shooter && frac >= ARM_FRACTION) {
        tracer.setLatLngs([[shooter.position.lat, shooter.position.lng], [pos.lat, pos.lng]]);
        tracer.setStyle({ opacity: 0.9 });
      }

      if (frac < 1) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      group.removeLayer(drone);
      if (tracer) group.removeLayer(tracer);
      const boom = L.marker([det.lat, det.lng], {
        icon: L.divIcon({ className: 'hoc-explosion-marker', html: EXPLOSION_HTML, iconSize: [0, 0], iconAnchor: [0, 0] }),
        interactive: false,
      }).addTo(group);
      window.setTimeout(() => group.removeLayer(boom), 900);
      flashStatus(`${threat.code} neutralized`, 2000);
      rafRef.current = null;
      setPlaying(false);
    };
    rafRef.current = requestAnimationFrame(step);
  }

  return (
    <MapCornerPanel style={{ left: '50%', right: 'auto', bottom: 20, transform: 'translateX(-50%)' }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" className={buttonPrimary} disabled={playing} onClick={onStrike}>
          {playing ? 'Engaging…' : '▶ Simulate strike'}
        </button>
        {status && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted whitespace-nowrap">
            {status}
          </span>
        )}
      </div>
    </MapCornerPanel>
  );
}
