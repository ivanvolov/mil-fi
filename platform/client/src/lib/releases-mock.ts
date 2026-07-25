// Mock data for the Releases dashboard. Everything here stands in for what will eventually be
// real release history + an autonomous agent's in-flight work queue.

export type FeatureFlags = { manageAssets: boolean };

export type Version = {
  id: string;
  name: string;
  blurb: string;
  /** Already shipped — shown but not selectable. */
  released: boolean;
  /** The two newest builds are selectable and preview their feature set in the live UI. */
  selectable: boolean;
  flags: FeatureFlags;
};

export type PipelineStage = 'conceptualizing' | 'coding' | 'testing';

export type PipelineItem = {
  id: string;
  title: string;
  detail: string;
  stage: PipelineStage;
  /** Epoch ms when the item entered its stage. */
  startedAt: number;
  /** Estimated time-to-complete for the stage, in ms — drives the countdown + progress bar. */
  etaMs: number;
  kind?: 'feature' | 'target';
  /** Render an inline feedback input on the card (e.g. roadmap targets that want operator input). */
  hasFeedbackWindow?: boolean;
};

const MIN = 60_000;
const HOUR = 60 * MIN;

// Newest first. The first two are the live, selectable builds; the rest are shipped history.
export const VERSIONS: Version[] = [
  {
    id: 'v1.0',
    name: 'v1.0 · Asset placement',
    blurb: 'Manage Assets: wipe & re-place launchers/crews for max coverage.',
    released: false,
    selectable: true,
    flags: { manageAssets: true },
  },
  {
    id: 'v0.9',
    name: 'v0.9 · Coverage tools',
    blurb: 'Coverage rings + orchestration, before the asset-placement button.',
    released: false,
    selectable: true,
    flags: { manageAssets: false },
  },
  {
    id: 'v0.4',
    name: 'v0.4 · Coverage rings & sandbox',
    blurb: 'Range envelopes on the map and the intercept sandbox.',
    released: true,
    selectable: false,
    flags: { manageAssets: false },
  },
  {
    id: 'v0.3',
    name: 'v0.3 · Orchestration engine',
    blurb: 'Greedy per-threat launcher assignment.',
    released: true,
    selectable: false,
    flags: { manageAssets: false },
  },
  {
    id: 'v0.2',
    name: 'v0.2 · Threat simulator',
    blurb: 'Sector-based Shahed threat generation.',
    released: true,
    selectable: false,
    flags: { manageAssets: false },
  },
  {
    id: 'v0.1',
    name: 'v0.1 · Sector layers',
    blurb: 'First map, launchers, crews and restrictions.',
    released: true,
    selectable: false,
    flags: { manageAssets: false },
  },
];

/** The build shown as selected on first load (current, full-feature build). */
export const DEFAULT_VERSION_ID = 'v1.0';

/** Initial in-flight pipeline items, timed relative to `now` so their countdowns look live. */
export function seedPipeline(now: number): PipelineItem[] {
  return [
    {
      id: 'seed-water',
      title: 'Update placement algorithm to avoid interceptors on water',
      detail: 'writing coverage constraints + regression tests',
      stage: 'coding',
      startedAt: now - 12 * MIN,
      etaMs: 3 * HOUR,
      kind: 'feature',
    },
    {
      id: 'seed-reposition',
      title: 'Analyze how operators reposition launchers after auto-placement',
      detail: 'reading interaction logs, drawing conclusions',
      stage: 'conceptualizing',
      startedAt: now - 8 * MIN,
      etaMs: 50 * MIN,
      kind: 'feature',
    },
    {
      id: 'seed-weights',
      title: 'Correlate feedback across past placements to tune coverage weights',
      detail: 'clustering feedback signals from prior sectors',
      stage: 'conceptualizing',
      startedAt: now - 3 * MIN,
      etaMs: 35 * MIN,
      kind: 'feature',
    },
    {
      id: 'seed-evasive',
      title: 'Evasive-threat interception tuning',
      detail: 'running regression scenarios',
      stage: 'testing',
      startedAt: now - 4 * MIN,
      etaMs: 20 * MIN,
      kind: 'feature',
    },
    {
      id: 'seed-shahed-corridors',
      title: 'Learn new launch corridors for Shaheds (only 6 today)',
      detail: 'proposed roadmap target — add operator feedback below',
      stage: 'conceptualizing',
      startedAt: now - 1 * MIN,
      etaMs: 45 * MIN,
      kind: 'target',
      hasFeedbackWindow: true,
    },
  ];
}

/** ETA a freshly-submitted feedback item starts its conceptualizing pass with. */
export const FEEDBACK_ETA_MS = 45 * MIN;
