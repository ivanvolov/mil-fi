/**
 * Source-of-truth weapon & threat specs, mirrored from ./spec.verification.yaml.
 * The YAML is the human-auditable proof; this module is what code reads.
 * Keep both in sync.
 */

export type SpecInterceptorType = {
  key: string;
  displayName: string;
  category: 'interceptor' | 'mfg' | 'manpads';
  requiresCrew: boolean;
  envelope: { rangeKm: number; altMaxM: number; spdMaxKmh: number };
  loadout: { hasReload: boolean; defaultCapacity: number; defaultReloadSec: number };
  notes: string | null;
};

export type SpecThreatType = {
  key: string;
  displayName: string;
  family: 'piston' | 'jet' | 'decoy' | 'cruise' | 'ballistic' | 'other';
  typicalSpeedKmh: number;
  typicalAltitudeM: { min: number; max: number };
  warheadKg: number | null;
  descentPhaseM: number;
  notes: string | null;
};

export const INTERCEPTOR_TYPES: SpecInterceptorType[] = [
  {
    key: 'sting',
    displayName: 'Sting (Wild Hornets)',
    category: 'interceptor',
    requiresCrew: true,
    envelope: { rangeKm: 25, altMaxM: 5000, spdMaxKmh: 343 },
    loadout: { hasReload: true, defaultCapacity: 8, defaultReloadSec: 22 },
    notes: null,
  },
  {
    key: 'p1-sun-long',
    displayName: 'P1-SUN Long (SkyFall)',
    category: 'interceptor',
    requiresCrew: true,
    envelope: { rangeKm: 33, altMaxM: 8000, spdMaxKmh: 450 },
    loadout: { hasReload: true, defaultCapacity: 6, defaultReloadSec: 0 },
    notes: null,
  },
  {
    key: 'merops',
    displayName: 'Merops (Perennial Autonomy, US)',
    category: 'interceptor',
    requiresCrew: true,
    envelope: { rangeKm: 15, altMaxM: 4500, spdMaxKmh: 280 },
    loadout: { hasReload: true, defaultCapacity: 4, defaultReloadSec: 22 },
    notes: null,
  },
  {
    key: 'mfg',
    displayName: 'Mobile Fire Group (12.7 HMG)',
    category: 'mfg',
    requiresCrew: false,
    envelope: { rangeKm: 2, altMaxM: 1500, spdMaxKmh: 300 },
    loadout: { hasReload: false, defaultCapacity: 0, defaultReloadSec: 0 },
    notes: 'M2 Browning · DShK · NSV · KPVT 14.5mm; self-operated by truck crew.',
  },
];

export const THREAT_TYPES: SpecThreatType[] = [
  {
    key: 'shahed-136',
    displayName: 'Shahed-136 / Geran-2 (piston)',
    family: 'piston',
    typicalSpeedKmh: 185,
    typicalAltitudeM: { min: 100, max: 3000 },   // terminal 100m → cruise 3000m
    warheadKg: 50,
    descentPhaseM: 500,
    notes: null,
  },
  {
    key: 'shahed-238-jet',
    displayName: 'Shahed-238 / Geran-3/4/5 (jet)',
    family: 'jet',
    typicalSpeedKmh: 550,
    typicalAltitudeM: { min: 100, max: 4000 },
    warheadKg: 85,
    descentPhaseM: 500,
    notes: null,
  },
];

/** Keys to soft-delete on migration (types that existed before and are no longer in the spec). */
export const RETIRED_INTERCEPTOR_KEYS = ['sting-wh', 'f7-litavr', 'mfg-pkt', 'mfg-zu23', 'manpads-stinger'];
//  ^^^^^^^^^ note: 'sting-wh' was renamed to 'sting' — the migration handles this by *renaming*
//  the existing doc, not deleting it. RETIRED contains the legacy keys that no longer have a
//  matching modern key; sting-wh and mfg-pkt are listed here for the rename map below.

export const RENAMED_INTERCEPTOR_KEYS: Record<string, string> = {
  'sting-wh': 'sting',
  'mfg-pkt': 'mfg',
};
