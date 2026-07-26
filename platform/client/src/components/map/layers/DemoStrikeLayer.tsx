import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useParams } from 'react-router-dom';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { Threat } from '@shared/schemas/threat';
import { haversineKm } from '@shared/distance';
import { useUiStore } from '../../../stores/uiStore';
import { useCreateThreat } from '../../../queries/useMutations';
import {
  DEMO_STRIKE_ARM_FRACTION,
  DEMO_STRIKE_DURATION_MS,
  buildFlightPath,
  buildRandomThreatBody,
  cumulativeKm,
  pickRandomLiveThreat,
  pointAtFraction,
} from '../demoStrike';

const FLYING_DRONE_SVG =
  '<svg width="16" height="16" viewBox="0 0 14 14"><path d="M7 1 L13 13 L1 13 Z" fill="#f59e0b" stroke="#fff7ed" stroke-width="0.75"/></svg>';
const EXPLOSION_HTML = '<div class="hoc-explosion"></div><div class="hoc-explosion-ring"></div>';

/** Headless engine for the demo strike animation on the 2D (Leaflet) map. No UI of its own —
 *  the button lives in LeftRail and drives this via `demoStrikeRequestId` in uiStore, so it
 *  works the same way regardless of which map host is mounted. Picks a random live threat (or
 *  spawns one near the current view if none exist), animates it flying to its detonation point
 *  while the nearest interceptor "tracks" it, ending in a hit effect. */
export function DemoStrikeLayer({ data }: { data: LayerFull }) {
  const map = useMap();
  const { slug = 'vzil-1' } = useParams();
  const createThreat = useCreateThreat(slug);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const lastHandledRef = useRef(useUiStore.getState().demoStrikeRequestId);

  const requestId = useUiStore((s) => s.demoStrikeRequestId);
  const setPlaying = useUiStore((s) => s.setDemoStrikePlaying);
  const setStatus = useUiStore((s) => s.setDemoStrikeStatus);

  useEffect(() => {
    groupRef.current = L.layerGroup().addTo(map);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      groupRef.current?.remove();
      groupRef.current = null;
      // Unmounting mid-animation (e.g. switching to 3D) would otherwise strand the
      // LeftRail button permanently disabled — release the lock.
      if (runningRef.current) {
        runningRef.current = false;
        setPlaying(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  async function runStrike() {
    const group = groupRef.current;
    if (runningRef.current || !group) return;
    runningRef.current = true;
    setPlaying(true);

    let threat: Threat | null = pickRandomLiveThreat(data.threats);
    if (!threat) {
      setStatus('Spawning threat…');
      const center = map.getCenter();
      const body = buildRandomThreatBody(data, { lat: center.lat, lng: center.lng });
      threat = body ? await createThreat.mutateAsync({ layerId: data.layer._id, body }).catch(() => null) : null;
      if (!threat) {
        setStatus('Could not spawn a threat — check threat types are configured');
        setPlaying(false);
        runningRef.current = false;
        window.setTimeout(() => setStatus(null), 2200);
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

    setStatus(`Tracking ${threat.code}…`);

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
      const frac = Math.min(1, (now - start) / DEMO_STRIKE_DURATION_MS);
      const pos = pointAtFraction(path, cum, frac);
      drone.setLatLng([pos.lat, pos.lng]);

      if (tracer && shooter && frac >= DEMO_STRIKE_ARM_FRACTION) {
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
      setStatus(`${threat.code} neutralized`);
      window.setTimeout(() => setStatus(null), 2000);
      rafRef.current = null;
      runningRef.current = false;
      setPlaying(false);
    };
    rafRef.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    if (requestId !== lastHandledRef.current) {
      lastHandledRef.current = requestId;
      void runStrike();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  return null;
}
