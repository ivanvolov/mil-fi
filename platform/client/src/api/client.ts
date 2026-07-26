import type { Layer, LayerCreate, LayerKind, LayerPatch } from '@shared/schemas/layer';
import type { LayerFull } from '@shared/schemas/layer-full';
import type { Interceptor, InterceptorCreate, InterceptorPatch } from '@shared/schemas/interceptor';
import type { Team, TeamCreate, TeamPatch } from '@shared/schemas/team';
import type { Threat, ThreatCreate, ThreatPatch } from '@shared/schemas/threat';
import type { Thread } from '@shared/schemas/thread';
import type { Drawing, DrawingCreate } from '@shared/schemas/drawing';
import type { InterceptorType, InterceptorTypePatch } from '@shared/schemas/interceptor-type';
import type { ThreatType, ThreatTypeCreate, ThreatTypePatch } from '@shared/schemas/threat-type';
import type { LatLng } from '@shared/schemas/common';
import type {
  Engagement,
  LedgerResponse,
  MyUnit,
  OnboardBody,
  ReportSpotBody,
  RunEngagementBody,
  SettlementStatus,
  Spot,
  Unit,
  UnitBalance,
} from '../types/settlement';

export type AffectedReport = { instanceCount: number; layerBreakdown: Array<{ layerId: string; layerName: string; count: number }> };

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public payload?: any) {
    super(message);
  }
}

async function http<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: { body?: unknown; ifMatch?: number; operator?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  // Only declare a JSON content-type when we actually send a body — Fastify
  // rejects a request that advertises `application/json` with an empty body.
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.ifMatch !== undefined) headers['If-Match'] = String(opts.ifMatch);
  if (opts.operator) headers['X-Operator'] = opts.operator;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    // Session vanished mid-app (expired, revoked, server restart with new secret).
    // Kick to /login so React state is reset cleanly.
    if (window.location.pathname !== '/login') window.location.href = '/login';
  }
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, parsed?.code ?? 'ERROR', parsed?.message ?? text ?? 'request failed', parsed);
  }
  return parsed as T;
}

export const api = {
  getLayers: (opts?: { kind?: LayerKind }) =>
    http<Layer[]>('GET', opts?.kind ? `/layers?kind=${opts.kind}` : '/layers'),
  getLayerFull: (slug: string) => http<LayerFull>('GET', `/layers/${encodeURIComponent(slug)}/full`),
  createLayer: (body: LayerCreate, operator?: string) =>
    http<Layer>('POST', '/layers', { body, operator }),
  patchLayer: (id: string, patch: LayerPatch, version: number, operator?: string) =>
    http<Layer>('PATCH', `/layers/${id}`, { body: patch, ifMatch: version, operator }),
  duplicateLayer: (id: string, body: { name?: string; slug?: string }, operator?: string) =>
    http<Layer>('POST', `/layers/${id}/duplicate`, { body, operator }),
  deleteLayer: (id: string, operator?: string) =>
    http<{ ok: true }>('DELETE', `/layers/${id}`, { operator }),

  patchInterceptorPosition: (
    layerId: string,
    id: string,
    position: LatLng,
    version: number,
    operator?: string,
  ) =>
    http<Interceptor>('PATCH', `/layers/${layerId}/interceptors/${id}/position`, {
      body: { position },
      ifMatch: version,
      operator,
    }),

  patchTeamPosition: (
    layerId: string,
    id: string,
    position: LatLng,
    version: number,
    operator?: string,
  ) =>
    http<Team>('PATCH', `/layers/${layerId}/teams/${id}/position`, {
      body: { position },
      ifMatch: version,
      operator,
    }),

  patchThreatGeometry: (
    layerId: string,
    id: string,
    geometry: Threat['geometry'],
    position: LatLng | undefined,
    version: number,
    operator?: string,
  ) =>
    http<Threat>('PATCH', `/layers/${layerId}/threats/${id}/geometry`, {
      body: position ? { geometry, position } : { geometry },
      ifMatch: version,
      operator,
    }),

  createInterceptor: (layerId: string, body: InterceptorCreate, operator?: string) =>
    http<Interceptor>('POST', `/layers/${layerId}/interceptors`, { body, operator }),

  createThreat: (layerId: string, body: ThreatCreate, operator?: string) =>
    http<Threat>('POST', `/layers/${layerId}/threats`, { body, operator }),

  createTeam: (layerId: string, body: TeamCreate, operator?: string) =>
    http<Team>('POST', `/layers/${layerId}/teams`, { body, operator }),

  createDrawing: (layerId: string, body: DrawingCreate, operator?: string) =>
    http<Drawing>('POST', `/layers/${layerId}/drawings`, { body, operator }),

  createThread: (
    layerId: string,
    body: { teamId: string; interceptorId: string; kind: 'primary' | 'override' },
    operator?: string,
  ) => http<Thread>('POST', `/layers/${layerId}/threads`, { body, operator }),

  deleteThread: (layerId: string, id: string, operator?: string) =>
    http<{ ok: true }>('DELETE', `/layers/${layerId}/threads/${id}`, { operator }),

  patchInterceptor: (layerId: string, id: string, patch: InterceptorPatch, version: number, operator?: string) =>
    http<Interceptor>('PATCH', `/layers/${layerId}/interceptors/${id}`, { body: patch, ifMatch: version, operator }),

  patchTeam: (layerId: string, id: string, patch: TeamPatch, version: number, operator?: string) =>
    http<Team>('PATCH', `/layers/${layerId}/teams/${id}`, { body: patch, ifMatch: version, operator }),

  patchThreat: (layerId: string, id: string, patch: ThreatPatch, version: number, operator?: string) =>
    http<Threat>('PATCH', `/layers/${layerId}/threats/${id}`, { body: patch, ifMatch: version, operator }),

  getInterceptorTypeAffected: (id: string) =>
    http<AffectedReport>('GET', `/types/interceptors/${id}/affected`),

  getThreatTypeAffected: (id: string) =>
    http<AffectedReport>('GET', `/types/threats/${id}/affected`),

  deleteInterceptor: (layerId: string, id: string, operator?: string) =>
    http<{ ok: true }>('DELETE', `/layers/${layerId}/interceptors/${id}`, { operator }),

  deleteTeam: (layerId: string, id: string, operator?: string) =>
    http<{ ok: true }>('DELETE', `/layers/${layerId}/teams/${id}`, { operator }),

  deleteThreat: (layerId: string, id: string, operator?: string) =>
    http<{ ok: true }>('DELETE', `/layers/${layerId}/threats/${id}`, { operator }),

  deleteDrawing: (layerId: string, id: string, operator?: string) =>
    http<{ ok: true }>('DELETE', `/layers/${layerId}/drawings/${id}`, { operator }),

  patchDrawing: (
    layerId: string,
    id: string,
    patch: Record<string, unknown>,
    version: number,
    operator?: string,
  ) => http<unknown>('PATCH', `/layers/${layerId}/drawings/${id}`, { body: patch, ifMatch: version, operator }),

  patchInterceptorType: (
    id: string,
    body: { patch: InterceptorTypePatch; expectedAffectedCount: number },
    version: number,
    operator?: string,
  ) => http<InterceptorType>('PATCH', `/types/interceptors/${id}`, { body, ifMatch: version, operator }),

  patchThreatType: (
    id: string,
    body: { patch: ThreatTypePatch; expectedAffectedCount: number },
    version: number,
    operator?: string,
  ) => http<ThreatType>('PATCH', `/types/threats/${id}`, { body, ifMatch: version, operator }),

  // Plain patch (no affected-count gate) — for editing a threat type's own fields from the catalog.
  patchThreatTypeFields: (id: string, patch: ThreatTypePatch, version: number, operator?: string) =>
    http<ThreatType>('PATCH', `/types/threats/${id}`, { body: patch, ifMatch: version, operator }),

  createThreatType: (body: ThreatTypeCreate, operator?: string) =>
    http<ThreatType>('POST', '/types/threats', { body, operator }),

  // Fusion Operator Console detections proxy — returns drones around a queried lat/lon.
  // radiusM is the scatter radius in metres (upstream max 50 000); omit for the default 2 km.
  getExternalDetections: (lat: number, lng: number, threats = 3, radiusM?: number) => {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lng), threats: String(threats) });
    if (radiusM !== undefined) params.set('radius_m', String(Math.min(Math.max(radiusM, 0), 50_000)));
    return http<{
      origin: { latitude: number; longitude: number };
      detections: Array<{
        id: string;
        position: { latitude: number; longitude: number; altitude_m: number };
        range_m: number;
        bearing_deg: number;
        classification: string;
        confidence: number;
      }>;
    }>('GET', `/external/detections?${params.toString()}`);
  },

  // --- settlement console (Hedera + 0G engagement pipeline) ---
  getSettlementStatus: () => http<SettlementStatus>('GET', '/settlement/status'),

  onboardUnit: (body: OnboardBody) => http<Unit>('POST', '/settlement/onboard', { body }),

  getUnits: () => http<Unit[]>('GET', '/settlement/units'),

  getMyUnit: () => http<MyUnit>('GET', '/settlement/my-unit'),

  getUnitBalance: (id: string) =>
    http<UnitBalance>('GET', `/settlement/units/${encodeURIComponent(id)}/balance`),

  // 2 live 0G inference calls + Hedera writes — expect ~20-30s.
  runEngagement: (body: RunEngagementBody) =>
    http<Engagement>('POST', '/settlement/engagements', { body }),

  getEngagements: () => http<Engagement[]>('GET', '/settlement/engagements'),

  // Spotter flow: 1 live 0G inference call — expect ~5-15s.
  reportSpot: (body: ReportSpotBody) => http<Spot>('POST', '/settlement/spots', { body }),

  getSpots: () => http<Spot[]>('GET', '/settlement/spots'),

  getEngagement: (id: string) =>
    http<Engagement>('GET', `/settlement/engagements/${encodeURIComponent(id)}`),

  getLedger: (opts: { engagementId?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.engagementId) params.set('engagementId', opts.engagementId);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return http<LedgerResponse>('GET', `/settlement/ledger${qs ? `?${qs}` : ''}`);
  },
};
