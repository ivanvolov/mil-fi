import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { FlaskConical, HelpCircle } from 'lucide-react';
import type { LatLng } from '@shared/schemas/common';
import type { InterceptorType } from '@shared/schemas/interceptor-type';
import type { ThreatType } from '@shared/schemas/threat-type';
import { useUiStore } from '../stores/uiStore';
import { useInterceptorTypes, useThreatTypes } from '../queries/useTypes';
import { computeIntercept } from '../lib/intercept';
import { haversineKm } from '@shared/distance';
import { glyphHtml, threatGlyphHtml } from '../components/map/glyphs';
import { AppRail } from '../components/AppRail';

const COLORS = {
  cyan: '#06b6d4',
  red: '#ef4444',
  amber: '#f59e0b',
  green: '#15803d',
  muted: '#8b949e',
};

const ATTACK_FRACTION = 0.8; // cruise leg covers 0..80% of the threat path; attack covers 80..100%
const FILLET_MAX_KM = 0.5;   // longest the corner-smoothing fillet can span on either segment
const FILLET_FRACTION = 0.1; // …or 10 % of the shorter adjacent segment, whichever is less

function fractionAlong(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Quadratic-Bezier sampler used for the small corner fillet between two straight segments. */
function bezierQuad(p0: LatLng, p1: LatLng, p2: LatLng, steps: number): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      lat: u * u * p0.lat + 2 * u * t * p1.lat + t * t * p2.lat,
      lng: u * u * p0.lng + 2 * u * t * p1.lng + t * t * p2.lng,
    });
  }
  return out;
}

/** Find the polyline vertex index whose cumulative arc length is closest to `fraction × total`.
 *  Used to colour the attack-leg portion at the last 20 % of the rendered path. */
function indexAtArcFraction(path: LatLng[], fraction: number): number {
  if (path.length < 2) return 0;
  let total = 0;
  const segLens: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const l = haversineKm(path[i - 1]!, path[i]!);
    segLens.push(l);
    total += l;
  }
  if (total <= 0) return path.length - 1;
  const target = total * fraction;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    acc += segLens[i]!;
    if (acc >= target) return i + 1;
  }
  return path.length - 1;
}

/** Build the polyline the threat will travel. Linear = straight to target. Evasive =
 *  straight threatPos → break (= threatTarget), small smoothing fillet at the corner, then
 *  straight to evasion endpoint. Returns the full path (used by physics) and the index
 *  where the attack-leg colouring starts. */
function buildThreatPath(s: {
  threatPos: LatLng;
  threatTarget: LatLng;
  threatEvasion: LatLng;
  flightProfile: 'linear' | 'evasive';
}): { path: LatLng[]; attackStartIdx: number; detonation: LatLng } {
  if (s.flightProfile === 'evasive') {
    const segA = haversineKm(s.threatPos, s.threatTarget);
    const segB = haversineKm(s.threatTarget, s.threatEvasion);
    const smoothKm = Math.max(0, Math.min(FILLET_MAX_KM, segA * FILLET_FRACTION, segB * FILLET_FRACTION));
    if (smoothKm < 0.01 || segA <= 0 || segB <= 0) {
      // Degenerate geometry — fall back to a single polyline kink.
      const path = [s.threatPos, s.threatTarget, s.threatEvasion];
      return { path, attackStartIdx: indexAtArcFraction(path, ATTACK_FRACTION), detonation: s.threatEvasion };
    }
    const pA = fractionAlong(s.threatPos, s.threatTarget, (segA - smoothKm) / segA);
    const pB = fractionAlong(s.threatTarget, s.threatEvasion, smoothKm / segB);
    // Small Bezier fillet: tangent at pA points along seg A, tangent at pB along seg B.
    // 12 steps is plenty for a <=0.5 km arc and keeps the polyline lightweight.
    const fillet = bezierQuad(pA, s.threatTarget, pB, 12);
    const path: LatLng[] = [s.threatPos, ...fillet, s.threatEvasion];
    return { path, attackStartIdx: indexAtArcFraction(path, ATTACK_FRACTION), detonation: s.threatEvasion };
  }
  const attackStart = fractionAlong(s.threatPos, s.threatTarget, ATTACK_FRACTION);
  return {
    path: [s.threatPos, attackStart, s.threatTarget],
    attackStartIdx: 1,
    detonation: s.threatTarget,
  };
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Resolve the launcher range, interceptor speed, and threat speed used by the sandbox.
 *  Sandbox-only overrides win over the type catalog's defaults. */
function effectiveValues(
  sandbox: { launcherRangeKmOverride: number | null; launcherSpeedKmhOverride: number | null; threatSpeedKmhOverride: number | null },
  launcherType: InterceptorType | undefined,
  threatType: ThreatType | undefined,
): { launcherRangeKm: number; launcherSpeedKmh: number; threatSpeedKmh: number } {
  return {
    launcherRangeKm: sandbox.launcherRangeKmOverride ?? launcherType?.envelope.rangeKm ?? 0,
    launcherSpeedKmh: sandbox.launcherSpeedKmhOverride ?? launcherType?.envelope.spdMaxKmh ?? 0,
    threatSpeedKmh: sandbox.threatSpeedKmhOverride ?? threatType?.typicalSpeedKmh ?? 0,
  };
}

function makeLauncherIcon(category: string) {
  return L.divIcon({
    className: 'hoc-sandbox-launcher',
    html: `<div style="cursor:move">${glyphHtml(category as 'interceptor' | 'mfg' | 'manpads', 22)}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

const threatIcon = L.divIcon({
  className: 'hoc-sandbox-threat',
  html: `<div style="cursor:move">${threatGlyphHtml(18)}</div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const targetIcon = L.divIcon({
  className: 'hoc-sandbox-target',
  html: `<svg width="20" height="20" viewBox="0 0 20 20" style="cursor:move"><circle cx="10" cy="10" r="8" fill="none" stroke="${COLORS.red}" stroke-width="1.5"/><line x1="10" y1="2" x2="10" y2="6" stroke="${COLORS.red}" stroke-width="1.5"/><line x1="10" y1="14" x2="10" y2="18" stroke="${COLORS.red}" stroke-width="1.5"/><line x1="2" y1="10" x2="6" y2="10" stroke="${COLORS.red}" stroke-width="1.5"/><line x1="14" y1="10" x2="18" y2="10" stroke="${COLORS.red}" stroke-width="1.5"/></svg>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const evasionIcon = L.divIcon({
  className: 'hoc-sandbox-evasion',
  html: `<svg width="20" height="20" viewBox="0 0 20 20" style="cursor:move"><circle cx="10" cy="10" r="8" fill="none" stroke="${COLORS.amber}" stroke-width="1.5" stroke-dasharray="3 2"/><line x1="10" y1="2" x2="10" y2="6" stroke="${COLORS.amber}" stroke-width="1.5"/><line x1="10" y1="14" x2="10" y2="18" stroke="${COLORS.amber}" stroke-width="1.5"/><line x1="2" y1="10" x2="6" y2="10" stroke="${COLORS.amber}" stroke-width="1.5"/><line x1="14" y1="10" x2="18" y2="10" stroke="${COLORS.amber}" stroke-width="1.5"/></svg>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const interceptIcon = L.divIcon({
  className: 'hoc-sandbox-intercept',
  html: `<svg width="20" height="20" viewBox="0 0 20 20">
    <rect x="1" y="1" width="18" height="18" fill="none" stroke="${COLORS.red}" stroke-width="1" stroke-dasharray="3 2"/>
    <path d="M10 4 L16 16 L4 16 Z" fill="none" stroke="${COLORS.red}" stroke-width="1.4"/>
  </svg>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/** Single combined map layer for the sandbox — three draggable markers + threat track
 *  + launcher coverage ring + (when feasible) intercept line + intercept marker. */
function SandboxLayer({
  launcherType,
  threatType,
}: {
  launcherType: InterceptorType | undefined;
  threatType: ThreatType | undefined;
}) {
  const map = useMap();
  const sandbox = useUiStore((s) => s.sandbox);
  const setSandbox = useUiStore((s) => s.setSandbox);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const launcherMarkerRef = useRef<L.Marker | null>(null);
  const threatMarkerRef = useRef<L.Marker | null>(null);
  const targetMarkerRef = useRef<L.Marker | null>(null);
  const evasionMarkerRef = useRef<L.Marker | null>(null);

  // Mirror latest state for drag handlers (avoid stale closures).
  const stateRef = useRef({ sandbox, setSandbox });
  stateRef.current = { sandbox, setSandbox };
  const draggingRef = useRef<null | 'launcher' | 'threat' | 'target' | 'evasion'>(null);

  // Bumps every time the viewport changes so the past-path tail re-extends past the new bounds.
  const [viewTick, setViewTick] = useState(0);
  useEffect(() => {
    const bump = () => setViewTick((v) => v + 1);
    map.on('moveend', bump);
    return () => { map.off('moveend', bump); };
  }, [map]);

  // Lifecycle: build the layer once.
  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;

    if (!launcherMarkerRef.current) {
      const m = L.marker([0, 0], { draggable: true, autoPan: false, icon: makeLauncherIcon('interceptor') }).addTo(group);
      m.on('dragstart', () => { draggingRef.current = 'launcher'; });
      m.on('drag', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        stateRef.current.setSandbox({ launcherPos: { lat: ll.lat, lng: ll.lng } });
      });
      m.on('dragend', () => { draggingRef.current = null; });
      launcherMarkerRef.current = m;
    }
    if (!threatMarkerRef.current) {
      const m = L.marker([0, 0], { draggable: true, autoPan: false, icon: threatIcon }).addTo(group);
      m.on('dragstart', () => { draggingRef.current = 'threat'; });
      m.on('drag', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        stateRef.current.setSandbox({ threatPos: { lat: ll.lat, lng: ll.lng } });
      });
      m.on('dragend', () => { draggingRef.current = null; });
      threatMarkerRef.current = m;
    }
    if (!targetMarkerRef.current) {
      const m = L.marker([0, 0], { draggable: true, autoPan: false, icon: targetIcon }).addTo(group);
      m.on('dragstart', () => { draggingRef.current = 'target'; });
      m.on('drag', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        stateRef.current.setSandbox({ threatTarget: { lat: ll.lat, lng: ll.lng } });
      });
      m.on('dragend', () => { draggingRef.current = null; });
      targetMarkerRef.current = m;
    }
    if (!evasionMarkerRef.current) {
      const m = L.marker([0, 0], { draggable: true, autoPan: false, icon: evasionIcon }).addTo(group);
      m.on('dragstart', () => { draggingRef.current = 'evasion'; });
      m.on('drag', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        stateRef.current.setSandbox({ threatEvasion: { lat: ll.lat, lng: ll.lng } });
      });
      m.on('dragend', () => { draggingRef.current = null; });
      evasionMarkerRef.current = m;
    }

    return () => {
      if (groupRef.current) { groupRef.current.remove(); groupRef.current = null; }
      launcherMarkerRef.current = null;
      threatMarkerRef.current = null;
      targetMarkerRef.current = null;
      evasionMarkerRef.current = null;
    };
  }, [map]);

  // Swap the launcher icon when its category changes (interceptor ↔ manpads).
  useEffect(() => {
    if (launcherMarkerRef.current && launcherType) {
      launcherMarkerRef.current.setIcon(makeLauncherIcon(launcherType.category));
    }
  }, [launcherType?.category]);

  // Re-render the dynamic bits (lines, ring, intercept marker) every time anything relevant changes.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    // Remove only the dynamic shapes — markers stay put so drag isn't interrupted.
    group.eachLayer((l) => {
      if (
        l !== launcherMarkerRef.current
        && l !== threatMarkerRef.current
        && l !== targetMarkerRef.current
        && l !== evasionMarkerRef.current
      ) {
        group.removeLayer(l);
      }
    });

    if (launcherMarkerRef.current && draggingRef.current !== 'launcher') {
      launcherMarkerRef.current.setLatLng(sandbox.launcherPos);
    }
    if (threatMarkerRef.current && draggingRef.current !== 'threat') {
      threatMarkerRef.current.setLatLng(sandbox.threatPos);
    }
    if (targetMarkerRef.current && draggingRef.current !== 'target') {
      targetMarkerRef.current.setLatLng(sandbox.threatTarget);
    }
    if (evasionMarkerRef.current && draggingRef.current !== 'evasion') {
      evasionMarkerRef.current.setLatLng(sandbox.threatEvasion);
    }
    // Show the evasion marker only in evasive mode — hide via opacity so it stays mounted.
    if (evasionMarkerRef.current) {
      const el = evasionMarkerRef.current.getElement();
      if (el) el.style.display = sandbox.flightProfile === 'evasive' ? '' : 'none';
    }

    // Effective speeds/range = sandbox overrides ?? type defaults.
    const eff = effectiveValues(sandbox, launcherType, threatType);

    // Launcher coverage ring — uses the effective (possibly overridden) range.
    if (launcherType && eff.launcherRangeKm > 0) {
      L.circle([sandbox.launcherPos.lat, sandbox.launcherPos.lng], {
        radius: eff.launcherRangeKm * 1000,
        color: COLORS.cyan,
        weight: 1.2,
        opacity: 0.85,
        fillColor: COLORS.cyan,
        fillOpacity: 0.05,
        interactive: false,
      }).addTo(group);
    }

    // Build the threat track (linear or bezier-evasive). Both produce a polyline + a
    // detonation point + an index that splits cruise (yellow) from attack (red).
    const { path, attackStartIdx, detonation } = buildThreatPath(sandbox);

    // Past path: solid gold tail extending backward from the threat's current position
    // along the negative of its initial heading, far enough to leave the visible map bounds.
    {
      const next = path[1] ?? sandbox.threatTarget;
      const dx = next.lng - sandbox.threatPos.lng;
      const dy = next.lat - sandbox.threatPos.lat;
      const len = Math.hypot(dx, dy);
      if (len > 1e-9) {
        const ux = dx / len;
        const uy = dy / len;
        const b = map.getBounds();
        const diag = Math.hypot(
          b.getEast() - b.getWest(),
          b.getNorth() - b.getSouth(),
        );
        const extend = diag * 1.5;
        const tail = {
          lat: sandbox.threatPos.lat - uy * extend,
          lng: sandbox.threatPos.lng - ux * extend,
        };
        L.polyline(
          [[tail.lat, tail.lng], [sandbox.threatPos.lat, sandbox.threatPos.lng]],
          { color: '#eab308', weight: 2, opacity: 0.9, interactive: false },
        ).addTo(group);
      }
    }

    // Cruise leg (dashed yellow) — path[0..attackStartIdx], inclusive of the split point.
    const cruisePts = path.slice(0, attackStartIdx + 1).map((p) => [p.lat, p.lng] as [number, number]);
    if (cruisePts.length >= 2) {
      L.polyline(cruisePts, {
        color: '#eab308', weight: 2, opacity: 0.75, dashArray: '5 4', interactive: false,
      }).addTo(group);
    }
    // Attack leg (dashed red) — path[attackStartIdx..end].
    const attackPts = path.slice(attackStartIdx).map((p) => [p.lat, p.lng] as [number, number]);
    if (attackPts.length >= 2) {
      L.polyline(attackPts, {
        color: COLORS.red, weight: 2.5, opacity: 0.9, dashArray: '5 4', interactive: false,
      }).addTo(group);
    }
    // Detonation circle at the actual landing point (target in linear mode, evasion in evasive).
    L.circle([detonation.lat, detonation.lng], {
      radius: 180,
      color: COLORS.red,
      weight: 1.5,
      fillColor: COLORS.red,
      fillOpacity: 0.18,
      interactive: false,
    }).addTo(group);

    // Intercept (only when both types are loaded and the geometry produces a feasible point).
    if (launcherType && threatType) {
      const r = computeIntercept({
        launcherPos: sandbox.launcherPos,
        launcherRangeKm: eff.launcherRangeKm,
        launcherSpeedKmh: eff.launcherSpeedKmh,
        threatPath: path,
        threatSpeedKmh: eff.threatSpeedKmh,
        launchDelaySec: sandbox.launchDelaySec,
      });
      if (r.kind === 'feasible') {
        L.polyline(
          [
            [sandbox.launcherPos.lat, sandbox.launcherPos.lng],
            [r.point.lat, r.point.lng],
          ],
          { color: COLORS.green, weight: 2, opacity: 0.95, interactive: false },
        ).addTo(group);
        L.marker([r.point.lat, r.point.lng], { icon: interceptIcon, interactive: false }).addTo(group);
      }
    }
  // viewTick is in deps so the past-path tail re-extends when the user pans / zooms.
  }, [sandbox, launcherType, threatType, viewTick, map]);

  return null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-line">
      <div className="text-[10px] uppercase tracking-[0.08em] font-mono text-muted mb-2">{title}</div>
      {children}
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-1 mb-2">
      <span className="text-muted text-[10px] uppercase tracking-wider font-mono">{label}</span>
      <select
        className="bg-bg border border-line text-ink font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-cyan"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/** Tooltip that opens to the LEFT of the trigger icon, portaled to document.body so it
 *  isn't clipped by the inspector's overflow:auto and isn't covered by Leaflet's overlay
 *  panes (which use z-index up to 700). */
function HoverHint({ text }: { text: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const iconRef = useRef<HTMLSpanElement>(null);

  const show = () => {
    if (!iconRef.current) return;
    const r = iconRef.current.getBoundingClientRect();
    setPos({ top: r.top + r.height / 2, left: r.left });
  };
  const hide = () => setPos(null);

  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        className="text-muted/60 hover:text-cyan cursor-help inline-flex"
      >
        <HelpCircle size={10} />
      </span>
      {pos && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left - 8,
            transform: 'translate(-100%, -50%)',
            zIndex: 9999,
          }}
          className="w-56 bg-bg border border-cyan/70 shadow-lg text-ink font-mono text-[10px] leading-snug normal-case tracking-normal px-2 py-1.5 pointer-events-none whitespace-normal"
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}

function Metric({
  k, v, color, hint,
}: { k: string; v: React.ReactNode; color?: string; hint?: string }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-x-3 py-0.5 font-mono text-xs items-center">
      <span className="text-muted uppercase text-[10px] tracking-wider inline-flex items-center gap-1">
        {k}
        {hint && <HoverHint text={hint} />}
      </span>
      <span style={color ? { color } : undefined} className="text-ink">{v}</span>
    </div>
  );
}

function SliderRow({
  k, hint, value, min, max, step, unit, overridden, onChange,
}: {
  k: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  /** true when this slider is showing a sandbox override rather than the type default. */
  overridden: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className="py-0.5">
      <div className="flex items-center justify-between font-mono text-[10px]">
        <span className="text-muted uppercase tracking-wider inline-flex items-center gap-1">
          {k}
          {hint && <HoverHint text={hint} />}
        </span>
        <span className={`tabular-nums ${overridden ? 'text-amber' : 'text-ink'}`}>
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        className="w-full accent-cyan"
      />
    </div>
  );
}

function SandboxInspector({
  launcherTypes, threatTypes,
}: { launcherTypes: InterceptorType[]; threatTypes: ThreatType[] }) {
  const sandbox = useUiStore((s) => s.sandbox);
  const setSandbox = useUiStore((s) => s.setSandbox);

  const launcherType = useMemo(
    () => launcherTypes.find((t) => t.key === sandbox.launcherTypeKey),
    [launcherTypes, sandbox.launcherTypeKey],
  );
  const threatType = useMemo(
    () => threatTypes.find((t) => t.key === sandbox.threatTypeKey),
    [threatTypes, sandbox.threatTypeKey],
  );

  // Live intercept result for the sidebar — uses the same path the map renders and the
  // same effective (override-aware) speeds/range the map layer uses.
  const { path: threatPath, detonation } = useMemo(() => buildThreatPath(sandbox), [sandbox]);
  const eff = useMemo(
    () => effectiveValues(sandbox, launcherType, threatType),
    [sandbox, launcherType, threatType],
  );
  const intercept = useMemo(() => {
    if (!launcherType || !threatType) return null;
    return computeIntercept({
      launcherPos: sandbox.launcherPos,
      launcherRangeKm: eff.launcherRangeKm,
      launcherSpeedKmh: eff.launcherSpeedKmh,
      threatPath,
      threatSpeedKmh: eff.threatSpeedKmh,
      launchDelaySec: sandbox.launchDelaySec,
    });
  }, [sandbox.launcherPos, sandbox.launchDelaySec, threatPath, launcherType, threatType, eff]);

  // Reset launcher overrides when the launcher type changes (skip the no-op initial render).
  const prevLauncherKey = useRef(sandbox.launcherTypeKey);
  useEffect(() => {
    if (prevLauncherKey.current === sandbox.launcherTypeKey) return;
    prevLauncherKey.current = sandbox.launcherTypeKey;
    setSandbox({ launcherRangeKmOverride: null, launcherSpeedKmhOverride: null });
  }, [sandbox.launcherTypeKey, setSandbox]);
  const prevThreatKey = useRef(sandbox.threatTypeKey);
  useEffect(() => {
    if (prevThreatKey.current === sandbox.threatTypeKey) return;
    prevThreatKey.current = sandbox.threatTypeKey;
    setSandbox({ threatSpeedKmhOverride: null });
  }, [sandbox.threatTypeKey, setSandbox]);

  // Total path length for the "Route" metric — sum of segment lengths along the rendered path.
  const threatRouteKm = useMemo(() => {
    let km = 0;
    for (let i = 1; i < threatPath.length; i++) km += haversineKm(threatPath[i - 1]!, threatPath[i]!);
    return km;
  }, [threatPath]);
  void detonation; // (kept around in case we surface "lands at" coords later)

  return (
    <aside className="w-[324px] border-l border-line bg-panel flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-line">
        <div className="flex items-center gap-1.5 text-cyan">
          <FlaskConical size={12} />
          <span className="text-[10px] uppercase tracking-[0.08em] font-mono">Intercept sandbox</span>
        </div>
        <div className="text-2xl font-bold font-mono mt-1 text-ink">1 vs 1</div>
        <div className="text-[10px] text-muted mt-1 font-mono">
          Drag the launcher / threat / target on the map. Calculations update in real time.
        </div>
      </div>

      <Section title="Assets">
        <SelectField
          label="Launcher type"
          value={sandbox.launcherTypeKey ?? ''}
          onChange={(v) => setSandbox({ launcherTypeKey: v })}
          options={launcherTypes
            .filter((t) => t.category !== 'mfg')
            .map((t) => ({ value: t.key, label: `${t.displayName} · ${t.category}` }))}
        />
        <SelectField
          label="Threat type"
          value={sandbox.threatTypeKey ?? ''}
          onChange={(v) => setSandbox({ threatTypeKey: v })}
          options={threatTypes.map((t) => ({ value: t.key, label: t.displayName }))}
        />
        <SelectField
          label="Flight profile"
          value={sandbox.flightProfile}
          onChange={(v) => setSandbox({ flightProfile: v as 'linear' | 'evasive' })}
          options={[
            { value: 'linear',  label: 'Linear · straight to target' },
            { value: 'evasive', label: 'Evasive · curve toward evasion' },
          ]}
        />
        {sandbox.flightProfile === 'evasive' && (
          <div className="text-[10px] text-muted font-mono mt-1">
            Two straight legs with a small smoothing turn at the corner. Red crosshair = break
            point (where the threat changes course); amber crosshair = where it ends up.
          </div>
        )}
      </Section>

      <Section title="Operator">
        <label className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <span className="text-muted text-[10px] uppercase tracking-wider font-mono">Launch delay</span>
            <span className="text-ink text-[11px] font-mono">{sandbox.launchDelaySec}s</span>
          </div>
          <input
            type="range"
            min={0}
            max={120}
            step={1}
            value={sandbox.launchDelaySec}
            onChange={(e) => setSandbox({ launchDelaySec: Number.parseInt(e.target.value, 10) })}
            className="w-full accent-cyan"
          />
        </label>
      </Section>

      <Section title="Geometry">
        {launcherType && (
          <SliderRow
            k="Range"
            unit=" km"
            min={1}
            max={100}
            step={1}
            value={Math.round(eff.launcherRangeKm)}
            overridden={sandbox.launcherRangeKmOverride != null}
            hint="Sandbox-only override of the launcher's max engagement range. Resets to the type default when you switch launcher type. Type catalog is not modified."
            onChange={(n) => setSandbox({ launcherRangeKmOverride: n })}
          />
        )}
        {launcherType && (
          <SliderRow
            k="Int speed"
            unit=" km/h"
            min={50}
            max={2000}
            step={10}
            value={Math.round(eff.launcherSpeedKmh)}
            overridden={sandbox.launcherSpeedKmhOverride != null}
            hint="Sandbox-only override of the interceptor missile's max speed. Resets on launcher-type change. Type catalog is not modified."
            onChange={(n) => setSandbox({ launcherSpeedKmhOverride: n })}
          />
        )}
        {threatType && (
          <SliderRow
            k="Thr speed"
            unit=" km/h"
            min={50}
            max={1000}
            step={10}
            value={Math.round(eff.threatSpeedKmh)}
            overridden={sandbox.threatSpeedKmhOverride != null}
            hint="Sandbox-only override of the threat's cruise speed. Resets on threat-type change. Type catalog is not modified."
            onChange={(n) => setSandbox({ threatSpeedKmhOverride: n })}
          />
        )}
        <Metric
          k="Route"
          v={`${threatRouteKm.toFixed(1)} km`}
          hint="Total path length from the threat's current position to its target."
        />
      </Section>

      <Section title="Result">
        {intercept?.kind === 'feasible' && (
          <>
            <Metric
              k="Status"
              v={<span style={{ color: COLORS.green }}>FEASIBLE</span>}
              hint="FEASIBLE if some point on the threat's path is inside the launcher's range AND the interceptor can reach it before the threat does."
            />
            <Metric
              k="TTI"
              v={formatSec(intercept.ttiSec)}
              hint="Time-to-intercept — seconds from now until the engagement, i.e. the threat's time-to-reach the engagement point along its path."
            />
            <Metric
              k="Flight"
              v={formatSec(intercept.flightSec)}
              hint="Seconds the interceptor missile needs to fly from the launcher to the engagement point."
            />
            <Metric
              k="Launch slack"
              v={formatSec(intercept.slackSec)}
              hint="TTI − flight − launch delay. Spare seconds the crew has after deciding to fire; negative means the threat would arrive first."
            />
            <Metric
              k="L→intercept"
              v={`${intercept.distKm.toFixed(2)} km`}
              hint="Straight-line distance from the launcher to the engagement point."
            />
            <Metric
              k="Point"
              v={<span className="font-mono">{intercept.point.lat.toFixed(4)} · {intercept.point.lng.toFixed(4)}</span>}
              hint="Latitude · longitude of the predicted engagement point on the threat's track."
            />
          </>
        )}
        {intercept?.kind === 'infeasible' && (
          <Metric
            k="Status"
            v={<span style={{ color: COLORS.amber }} className="uppercase">{intercept.reason}</span>}
            hint="OUT OF RANGE: the threat path never enters the launcher ring. TOO LATE: it enters the ring, but the threat arrives before the interceptor + launch delay could get there."
          />
        )}
        {!intercept && (
          <div className="text-[11px] text-muted font-mono">— pick a launcher and threat type —</div>
        )}
      </Section>
    </aside>
  );
}

/** Tiny topbar mirroring the main App but stripped — no layer selector, no edit toggle. */
function SandboxTopBar() {
  return (
    <header className="h-12 border-b border-line bg-panel flex items-center gap-3 px-5 shrink-0">
      <div className="text-lg font-bold tracking-[0.25em]">MilFi</div>
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted">/ Sandbox · single intercept</span>
      <div className="flex-1" />
    </header>
  );
}

/** Persists the sandbox map's center+zoom to the store on every `moveend`. */
function ViewSaver() {
  const map = useMap();
  const setSandboxMapView = useUiStore((s) => s.setSandboxMapView);
  useEffect(() => {
    const save = () => {
      const c = map.getCenter();
      setSandboxMapView({ center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() });
    };
    map.on('moveend', save);
    return () => { map.off('moveend', save); };
  }, [map, setSandboxMapView]);
  return null;
}

export function SandboxPage() {
  const interceptorTypesQ = useInterceptorTypes();
  const threatTypesQ = useThreatTypes();
  const sandbox = useUiStore((s) => s.sandbox);
  const setSandbox = useUiStore((s) => s.setSandbox);

  // Seed default type selections from the loaded catalogs on first render.
  useEffect(() => {
    if (!interceptorTypesQ.data || !threatTypesQ.data) return;
    const patch: Partial<typeof sandbox> = {};
    if (!sandbox.launcherTypeKey) {
      const first = interceptorTypesQ.data.find((t) => t.category !== 'mfg');
      if (first) patch.launcherTypeKey = first.key;
    }
    if (!sandbox.threatTypeKey) {
      const first = threatTypesQ.data[0];
      if (first) patch.threatTypeKey = first.key;
    }
    if (Object.keys(patch).length > 0) setSandbox(patch);
  }, [interceptorTypesQ.data, threatTypesQ.data, sandbox.launcherTypeKey, sandbox.threatTypeKey, setSandbox]);

  const launcherTypes = interceptorTypesQ.data ?? [];
  const threatTypes = threatTypesQ.data ?? [];
  const launcherType = launcherTypes.find((t) => t.key === sandbox.launcherTypeKey);
  const threatType = threatTypes.find((t) => t.key === sandbox.threatTypeKey);

  // MapContainer reads center/zoom only at mount — snapshot the persisted view once.
  const persistedView = useUiStore.getState().sandboxMapView;
  const initialCenter: [number, number] = persistedView
    ? [persistedView.center.lat, persistedView.center.lng]
    : [
        (sandbox.launcherPos.lat + sandbox.threatPos.lat) / 2,
        (sandbox.launcherPos.lng + sandbox.threatPos.lng) / 2,
      ];
  const initialZoom = persistedView?.zoom ?? 10;

  return (
    <div className="h-screen flex flex-col">
      <SandboxTopBar />
      <div className="flex-1 flex min-h-0">
        <AppRail />
        <main className="flex-1 relative min-w-0">
          <MapContainer
            center={initialCenter}
            zoom={initialZoom}
            zoomSnap={0.25}
            zoomDelta={0.5}
            wheelPxPerZoomLevel={120}
            zoomControl={false}
            attributionControl={false}
            className="h-full w-full"
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" maxZoom={19} />
            <ViewSaver />
            <SandboxLayer launcherType={launcherType} threatType={threatType} />
          </MapContainer>
        </main>
        <SandboxInspector launcherTypes={launcherTypes} threatTypes={threatTypes} />
      </div>
    </div>
  );
}
