import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LatLng } from '@shared/schemas/common';
import {
  type FeatureFlags,
  type PipelineItem,
  DEFAULT_VERSION_ID,
  seedPipeline,
} from '../lib/releases-mock';

export type SelectionKind = 'interceptor' | 'team' | 'threat' | 'drawing';
export type SelectionItem = { kind: SelectionKind; id: string };
export type Selection = SelectionItem | null;

export function isSelected(selections: SelectionItem[], kind: SelectionKind, id: string): boolean {
  return selections.some((s) => s.kind === kind && s.id === id);
}

export type Visibility = {
  threats: boolean;
  interceptors: boolean;
  teams: boolean;
  controls: boolean;
  coverage: boolean;
  restrictions: boolean;
  /** Diagnostic MFG donut-coverage heatmap, shown during Manage Assets. Off by default. */
  heatmap: boolean;
  edit: boolean;
};

export type MapView = { center: LatLng; zoom: number };
export type EditTarget = { kind: SelectionKind; id: string } | null;

interface UiStore {
  // transient
  /** Every selected entity. Plain click keeps one item; Shift-click accumulates/toggles. */
  selections: SelectionItem[];
  /** Single-item view: the item when EXACTLY one entity is selected, else null. Consumers
   *  that only make sense for one entity (inspector, edit handles, zoom framing) read this;
   *  multi-aware consumers (row/marker highlights, coverage, control lines) read `selections`. */
  selection: Selection;
  /** true iff the last setSelection was called with { zoom: true } — drives ViewController. */
  selectionZoom: boolean;
  /** null clears everything; `additive` (Shift) toggles the item in/out of the current set;
   *  otherwise the set is replaced with just this item. */
  setSelection: (sel: Selection, opts?: { zoom?: boolean; additive?: boolean }) => void;
  editing: EditTarget;
  openEditor: (target: EditTarget) => void;
  closeEditor: () => void;
  // persisted
  visibility: Visibility;
  toggleVisibility: (key: keyof Visibility) => void;
  mapViewByLayer: Record<string, MapView>;
  setMapView: (layerId: string, view: MapView) => void;
  lastLayerSlug: string | null;
  setLastLayerSlug: (slug: string) => void;
  restrictionPolygonPoints: number;
  setRestrictionPolygonPoints: (n: number) => void;
  heatmapCellKm: number;
  setHeatmapCellKm: (n: number) => void;
  bulkOrchestrate: boolean;
  setBulkOrchestrate: (v: boolean) => void;
  /** Tablet-friendly: the right inspector collapses to a slim strip to free up map width. */
  rightPanelCollapsed: boolean;
  toggleRightPanel: () => void;
  // threat simulator (ephemeral — not persisted)
  simStage: 'idle' | 'setup' | 'place';
  setSimStage: (s: 'idle' | 'setup' | 'place') => void;
  simTarget: LatLng | null;
  setSimTarget: (p: LatLng | null) => void;
  simSector: {
    radiusKm: number;
    angleFromDeg: number;
    angleToDeg: number;
    /** Mean time-to-target the generated threats start at, in minutes. */
    etaMinutes: number;
    /** ± uniform variance applied to each threat's ETA, in seconds. */
    etaVarianceSec: number;
  };
  setSimSector: (s: UiStore['simSector']) => void;
  /** Where generated positions come from: local random (default) or the Fusion detections API. */
  simSource: 'random' | 'api';
  setSimSource: (s: 'random' | 'api') => void;
  // asset manager (ephemeral — not persisted). Wipes & re-places launchers/crews for max coverage.
  assetStage: 'idle' | 'setup' | 'place';
  setAssetStage: (s: 'idle' | 'setup' | 'place') => void;
  /** Center of the circular region to cover. */
  assetCenter: LatLng | null;
  setAssetCenter: (p: LatLng | null) => void;
  /** Radius (km) of the region to cover. */
  assetRadiusKm: number;
  setAssetRadiusKm: (km: number) => void;
  /** Per-launcher ranges + categories for the live placement preview, in launcher order. */
  assetPlan: { ranges: number[]; categories: string[] } | null;
  setAssetPlan: (p: UiStore['assetPlan']) => void;
  // releases dashboard — feature flags + selected version (persisted); the pipeline queue is
  // ephemeral mock state that survives route nav but resets on reload.
  featureFlags: FeatureFlags;
  selectedVersionId: string;
  selectVersion: (id: string, flags: FeatureFlags) => void;
  pipelineItems: PipelineItem[];
  addPipelineItem: (item: PipelineItem) => void;
  // sandbox simulation panel (persisted — single launcher vs single threat)
  sandbox: {
    launcherTypeKey: string | null;
    threatTypeKey: string | null;
    launcherPos: LatLng;
    threatPos: LatLng;
    threatTarget: LatLng;
    /** Operator launch-prep delay before the interceptor leaves the launcher, in seconds. */
    launchDelaySec: number;
    /** 'linear' = straight current→target. 'evasive' = smooth quadratic curve current →
     *  (target as bezier control) → evasion endpoint, so the threat's initial heading still
     *  points at the original target but it diverts to the evasion point. */
    flightProfile: 'linear' | 'evasive';
    /** Detonation point in evasive mode (where the threat actually lands after diverting). */
    threatEvasion: LatLng;
    /** Sandbox-only overrides for the launcher/threat type's published values. null = use
     *  the type's default; any number = use that value INSTEAD. These reset to null when the
     *  user switches launcher / threat type. Never written back to the type catalog. */
    launcherRangeKmOverride: number | null;
    launcherSpeedKmhOverride: number | null;
    threatSpeedKmhOverride: number | null;
  };
  setSandbox: (patch: Partial<UiStore['sandbox']>) => void;
  sandboxMapView: MapView | null;
  setSandboxMapView: (view: MapView) => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      selections: [],
      selection: null,
      selectionZoom: false,
      setSelection: (sel, opts) =>
        set((s) => {
          // Edit mode is single-select only: edit handles + drag geometry only make sense for
          // one entity at a time, so Shift-click accumulation is suppressed while it's on.
          const additive = !!opts?.additive && !s.visibility.edit;
          let selections: SelectionItem[];
          if (!sel) {
            selections = [];
          } else if (additive) {
            selections = isSelected(s.selections, sel.kind, sel.id)
              ? s.selections.filter((x) => !(x.kind === sel.kind && x.id === sel.id))
              : [...s.selections, sel];
          } else {
            selections = [sel];
          }
          return {
            selections,
            selection: selections.length === 1 ? selections[0]! : null,
            selectionZoom: !!opts?.zoom,
          };
        }),
      editing: null,
      openEditor: (editing) => set({ editing }),
      closeEditor: () => set({ editing: null }),
      visibility: {
        threats: true,
        interceptors: true,
        teams: true,
        controls: false,
        coverage: false,
        restrictions: true,
        heatmap: false,
        edit: false,
      },
      toggleVisibility: (key) =>
        set((s) => {
          const next = !s.visibility[key];
          const visibility = { ...s.visibility, [key]: next };
          // Turning edit mode on collapses any multi-selection — edit is single-entity only.
          if (key === 'edit' && next && s.selections.length > 1) {
            return { visibility, selections: [], selection: null, selectionZoom: false };
          }
          return { visibility };
        }),
      mapViewByLayer: {},
      setMapView: (layerId, view) =>
        set((s) => ({ mapViewByLayer: { ...s.mapViewByLayer, [layerId]: view } })),
      lastLayerSlug: null,
      setLastLayerSlug: (slug) => set({ lastLayerSlug: slug }),
      restrictionPolygonPoints: 6,
      setRestrictionPolygonPoints: (n) =>
        set({ restrictionPolygonPoints: Math.max(3, Math.min(32, Math.round(n))) }),
      heatmapCellKm: 0.25,
      setHeatmapCellKm: (n) =>
        set({ heatmapCellKm: Math.max(0.05, Math.min(2, Math.round(n * 100) / 100)) }),
      bulkOrchestrate: false,
      setBulkOrchestrate: (bulkOrchestrate) => set({ bulkOrchestrate }),
      rightPanelCollapsed: false,
      toggleRightPanel: () => set((s) => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),
      simStage: 'idle',
      setSimStage: (simStage) => set({ simStage }),
      simTarget: null,
      setSimTarget: (simTarget) => set({ simTarget }),
      simSector: { radiusKm: 3, angleFromDeg: 0, angleToDeg: 360, etaMinutes: 5, etaVarianceSec: 30 },
      setSimSector: (simSector) => set({ simSector }),
      simSource: 'random',
      setSimSource: (simSource) => set({ simSource }),
      assetStage: 'idle',
      setAssetStage: (assetStage) => set({ assetStage }),
      assetCenter: null,
      setAssetCenter: (assetCenter) => set({ assetCenter }),
      assetRadiusKm: 1,
      setAssetRadiusKm: (assetRadiusKm) => set({ assetRadiusKm }),
      assetPlan: null,
      setAssetPlan: (assetPlan) => set({ assetPlan }),
      featureFlags: { manageAssets: true },
      selectedVersionId: DEFAULT_VERSION_ID,
      selectVersion: (selectedVersionId, featureFlags) => set({ selectedVersionId, featureFlags }),
      pipelineItems: seedPipeline(Date.now()),
      addPipelineItem: (item) => set((s) => ({ pipelineItems: [...s.pipelineItems, item] })),
      sandbox: {
        launcherTypeKey: null,
        threatTypeKey: null,
        // Default scene around Burshtyn: launcher central, threat ~20 km NE inbound to the launcher.
        launcherPos: { lat: 49.216, lng: 24.663 },
        threatPos: { lat: 49.37, lng: 24.95 },
        threatTarget: { lat: 49.216, lng: 24.663 },
        launchDelaySec: 10,
        flightProfile: 'linear',
        // Seed the evasion endpoint 6 km east of the original target.
        threatEvasion: { lat: 49.216, lng: 24.74 },
        launcherRangeKmOverride: null,
        launcherSpeedKmhOverride: null,
        threatSpeedKmhOverride: null,
      },
      setSandbox: (patch) => set((s) => ({ sandbox: { ...s.sandbox, ...patch } })),
      sandboxMapView: null,
      setSandboxMapView: (sandboxMapView) => set({ sandboxMapView }),
    }),
    {
      name: 'hoc-orchestration-ui',
      partialize: (s) => ({
        visibility: { ...s.visibility, edit: false },
        mapViewByLayer: s.mapViewByLayer,
        lastLayerSlug: s.lastLayerSlug,
        restrictionPolygonPoints: s.restrictionPolygonPoints,
        heatmapCellKm: s.heatmapCellKm,
        rightPanelCollapsed: s.rightPanelCollapsed,
        sandbox: s.sandbox,
        sandboxMapView: s.sandboxMapView,
        featureFlags: s.featureFlags,
        selectedVersionId: s.selectedVersionId,
        // protection point + radius: kept so the always-on donut/heatmap survives reloads.
        assetCenter: s.assetCenter,
        assetRadiusKm: s.assetRadiusKm,
      }),
      // Deep-merge `sandbox` (and `visibility`) so newly-added fields fall through to
      // their defaults instead of being clobbered by an older persisted object.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiStore>;
        return {
          ...current,
          ...p,
          visibility: { ...current.visibility, ...(p.visibility ?? {}) },
          sandbox: { ...current.sandbox, ...(p.sandbox ?? {}) },
          featureFlags: { ...current.featureFlags, ...(p.featureFlags ?? {}) },
        };
      },
    },
  ),
);
