import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useParams } from 'react-router-dom';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { Threat } from '@shared/schemas/threat';
import { useUiStore } from '../../../stores/uiStore';
import { useCreateThreat } from '../../../queries/useMutations';
import {
  DEMO_STRIKE_DURATION_MS,
  EXPLOSION_HTML,
  FLYING_DRONE_SVG,
  INTERCEPTOR_ICON_SVG,
  buildFlightPath,
  buildRandomThreatBody,
  cumulativeKm,
  pickInterceptFraction,
  pickRandomLiveThreat,
  pickShooter,
  pointAtFraction,
} from '../demoStrike';

/** Headless engine for the demo strike animation on the 2D (Leaflet) map. No UI of its own —
 *  the button lives in LeftRail and drives this via `demoStrikeRequestId` in uiStore, so it
 *  works the same way regardless of which map host is mounted. Picks a random live threat (or
 *  spawns one near the current view if none exist), launches an interceptor (L-2 by preference)
 *  to meet it partway, and detonates both at the intercept point — before the threat ever
 *  reaches its original target. */
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
    const interceptFrac = pickInterceptFraction();
    const interceptPoint = pointAtFraction(path, cum, interceptFrac);
    const shooter = pickShooter(data.interceptors, interceptPoint, 'L-2');

    setStatus(shooter ? `${shooter.code} launching on ${threat.code}…` : `Tracking ${threat.code}…`);

    const drone = L.marker([path[0]!.lat, path[0]!.lng], {
      icon: L.divIcon({ className: 'hoc-flying-drone', html: FLYING_DRONE_SVG, iconSize: [0, 0], iconAnchor: [0, 0] }),
      interactive: false,
    }).addTo(group);

    const interceptorPath = shooter ? [shooter.position, interceptPoint] : null;
    const interceptorCum = interceptorPath ? cumulativeKm(interceptorPath) : null;
    const interceptor = shooter
      ? L.marker([shooter.position.lat, shooter.position.lng], {
          icon: L.divIcon({ className: 'hoc-interceptor-missile', html: INTERCEPTOR_ICON_SVG, iconSize: [0, 0], iconAnchor: [0, 0] }),
          interactive: false,
        }).addTo(group)
      : null;
    const trail = shooter
      ? L.polyline([[shooter.position.lat, shooter.position.lng], [shooter.position.lat, shooter.position.lng]], {
          color: '#06b6d4', weight: 2, dashArray: '2 3', opacity: 0.85,
        }).addTo(group)
      : null;

    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const frac = Math.min(1, (now - start) / DEMO_STRIKE_DURATION_MS);
      // The threat only ever flies as far as the intercept point — it never reaches `det`.
      const dronePos = pointAtFraction(path, cum, frac * interceptFrac);
      drone.setLatLng([dronePos.lat, dronePos.lng]);

      if (interceptor && interceptorPath && interceptorCum) {
        const iPos = pointAtFraction(interceptorPath, interceptorCum, frac);
        interceptor.setLatLng([iPos.lat, iPos.lng]);
        trail?.setLatLngs([[shooter!.position.lat, shooter!.position.lng], [iPos.lat, iPos.lng]]);
      }

      if (frac < 1) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      group.removeLayer(drone);
      if (interceptor) group.removeLayer(interceptor);
      if (trail) group.removeLayer(trail);
      const boom = L.marker([interceptPoint.lat, interceptPoint.lng], {
        icon: L.divIcon({ className: 'hoc-explosion-marker', html: EXPLOSION_HTML, iconSize: [0, 0], iconAnchor: [0, 0] }),
        interactive: false,
      }).addTo(group);
      window.setTimeout(() => group.removeLayer(boom), 900);
      setStatus(shooter ? `${threat.code} intercepted by ${shooter.code}` : `${threat.code} neutralized`);
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
