import { ObjectId } from 'mongodb';

export function newTimestamps() {
  const now = new Date();
  return { createdAt: now, updatedAt: now, deletedAt: null as Date | null, version: 1 };
}

function serializeValue(v: unknown): unknown {
  if (v instanceof ObjectId) return v.toHexString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(serializeValue);
  if (v && typeof v === 'object') return serializeDoc(v as Record<string, any>);
  return v;
}

/** Convert a Mongo doc (with ObjectId + Date fields, including inside arrays) to a JSON-safe shape for clients. */
export function serializeDoc<T extends Record<string, any>>(doc: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(doc)) {
    out[k] = serializeValue(v);
  }
  return out as T;
}

export function serializeDocs<T extends Record<string, any>>(docs: T[]): T[] {
  return docs.map(serializeDoc);
}

export function asObjectId(v: string | ObjectId): ObjectId {
  return typeof v === 'string' ? new ObjectId(v) : v;
}
