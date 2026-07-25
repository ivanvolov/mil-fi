import type { Drawing, DrawingKind } from '@shared/schemas/drawing';

export function drawingGeometryDesc(g: Drawing['geometry']): string {
  if (g.type === 'polygon') return `${g.points.length} pts`;
  if (g.type === 'circle') return `circle · r ${Math.round(g.radiusM)}m`;
  return 'rectangle';
}

export function drawingKindShortLabel(k: DrawingKind): string {
  switch (k) {
    case 'noFlyZone': return 'NFZ';
    case 'noEngagementZone': return 'NIZ';
    case 'noPlacementZone': return 'NPZ';
    case 'sensorCoverage': return 'SEN';
    case 'custom': return 'CST';
  }
}

export function drawingKindFullLabel(k: DrawingKind): string {
  switch (k) {
    case 'noFlyZone': return 'no-fly zone';
    case 'noEngagementZone': return 'no-interception zone';
    case 'noPlacementZone': return 'no-placement zone';
    case 'sensorCoverage': return 'sensor coverage';
    case 'custom': return 'custom';
  }
}
