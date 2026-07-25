import type { FastifyInstance } from 'fastify';

const FUSION_URL = process.env.FUSION_API_URL ?? 'https://fusion-operator-console.onrender.com';

type DetectionsResponse = {
  type: string;
  origin: { latitude: number; longitude: number };
  threats: number;
  radius_m: number;
  seed: number;
  static: boolean;
  detections: Array<{
    id: string;
    position: { latitude: number; longitude: number; altitude_m: number };
    range_m: number;
    bearing_deg: number;
    classification: string;
    confidence: number;
  }>;
};

export async function registerExternalRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      lat: string;
      lon: string;
      threats?: string;
      radius_m?: string;
      seed?: string;
    };
  }>('/external/detections', async (req, reply) => {
    const lat = Number.parseFloat(req.query.lat);
    const lon = Number.parseFloat(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return reply.status(400).send({ code: 'VALIDATION', message: 'lat and lon must be finite floats' });
    }

    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (req.query.threats !== undefined) {
      const t = Number.parseInt(req.query.threats, 10);
      if (!Number.isFinite(t) || t < 0 || t > 500) {
        return reply.status(400).send({ code: 'VALIDATION', message: 'threats must be an integer 0-500' });
      }
      params.set('threats', String(t));
    }
    if (req.query.radius_m !== undefined) {
      const r = Number.parseFloat(req.query.radius_m);
      if (!Number.isFinite(r) || r < 0 || r > 50_000) {
        return reply.status(400).send({ code: 'VALIDATION', message: 'radius_m must be 0-50000' });
      }
      params.set('radius_m', String(r));
    }
    if (req.query.seed !== undefined) params.set('seed', req.query.seed);

    const url = `${FUSION_URL}/api/detections?${params.toString()}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return reply.status(502).send({
          code: 'UPSTREAM_ERROR',
          message: `upstream ${res.status}: ${text.slice(0, 200)}`,
        });
      }
      return (await res.json()) as DetectionsResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'upstream fetch failed';
      return reply.status(502).send({ code: 'UPSTREAM_UNREACHABLE', message: msg });
    } finally {
      clearTimeout(timer);
    }
  });
}
