import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Play, Plus, Upload } from 'lucide-react';
import { useMe } from '../../queries/useMe';
import { useOnboardUnit, useRunEngagement, useUnits } from '../../queries/useSettlement';
import { useSettlementStore } from '../../stores/settlementStore';
import type { HumanBackingLevel, SettlementRule } from '../../types/settlement';
import { shrinkImagePair } from '../../lib/settlement-image';
import preStrikeUrl from '../../assets/settlement/drone2.jpg';
import postStrikeUrl from '../../assets/settlement/drone.jpg';

/** Default government rule — mirrors the server's DEFAULT_RULE. */
const DEFAULT_RULE: SettlementRule = {
  minThreatConfidence: 0.95,
  requireDestroyed: true,
  minDestroyedConfidence: 0.8,
  requireConsistent: true,
  payout: 100,
};

/** Demo scene coords (Burshtyn) — same area as the map app's sample scenario. */
const DEMO_COORDS = { lat: 49.216, lon: 24.663 };

type ImageSlot = { dataUrl: string | null; previewUrl: string; name: string };

function ImagePicker({
  label,
  slot,
  onPick,
}: {
  label: string;
  slot: ImageSlot;
  onPick: (s: ImageSlot) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-muted mb-1">{label}</div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-full h-20 border border-line hover:border-cyan overflow-hidden group"
        title={`${slot.name} — click to upload a different photo`}
      >
        <img src={slot.previewUrl} alt={label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-bg/70 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider text-cyan">
          <Upload size={10} /> replace
        </div>
        <div className="absolute bottom-0 inset-x-0 bg-bg/80 px-1 py-0.5 text-[8px] text-muted truncate text-left">
          {slot.name}
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () =>
            onPick({ dataUrl: r.result as string, previewUrl: r.result as string, name: f.name });
          r.readAsDataURL(f);
        }}
      />
    </div>
  );
}

const inputCls =
  'bg-bg border border-line px-2 py-1 text-[11px] text-ink font-mono focus:border-cyan outline-none';

function OnboardForm({ onDone }: { onDone: (unitId: string) => void }) {
  const onboard = useOnboardUnit();
  const [unitId, setUnitId] = useState('');
  const [level, setLevel] = useState<HumanBackingLevel>('spotter');
  const [worldVerified, setWorldVerified] = useState(true);

  return (
    <div className="border border-line/60 bg-bg/40 p-2 flex flex-col gap-2">
      <input
        className={inputCls}
        placeholder="unit id (blank = auto)"
        value={unitId}
        onChange={(e) => setUnitId(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <select
          className={inputCls + ' flex-1'}
          value={level}
          onChange={(e) => setLevel(e.target.value as HumanBackingLevel)}
        >
          <option value="spotter">spotter</option>
          <option value="military">military</option>
          <option value="government">government</option>
        </select>
        <label
          className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider cursor-pointer select-none"
          title="With World proof the unit gets a KYC'd Hedera wallet. Without it, it's a bot — the settle-agent rejects its claims."
        >
          <input
            type="checkbox"
            checked={worldVerified}
            onChange={(e) => setWorldVerified(e.target.checked)}
            className="accent-cyan"
          />
          <span className={worldVerified ? 'text-green' : 'text-red'}>
            {worldVerified ? 'World-verified human' : 'BOT · no human'}
          </span>
        </label>
      </div>
      <button
        type="button"
        disabled={onboard.isPending}
        onClick={() =>
          onboard.mutate(
            {
              unitId: unitId.trim() || undefined,
              humanBackingLevel: level,
              ...(worldVerified
                ? { worldProof: { source: 'world-id', verified_at: new Date().toISOString() } }
                : {}),
            },
            { onSuccess: (u) => onDone(u._id) },
          )
        }
        className="border border-cyan text-cyan text-[10px] uppercase tracking-wider py-1 hover:bg-cyan/10 disabled:opacity-50"
      >
        {onboard.isPending ? 'onboarding… (Hedera account + KYC)' : 'onboard unit'}
      </button>
      {onboard.isError && (
        <div className="text-[9px] text-red">{(onboard.error as Error).message}</div>
      )}
    </div>
  );
}

function RuleEditor({ rule, onChange }: { rule: SettlementRule; onChange: (r: SettlementRule) => void }) {
  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return (
    <div className="border border-line/60 bg-bg/40 p-2 grid grid-cols-2 gap-2 text-[10px]">
      <label className="flex flex-col gap-0.5 text-muted uppercase tracking-wider text-[8px]">
        min threat conf
        <input
          className={inputCls}
          type="number" min={0} max={1} step={0.01}
          value={rule.minThreatConfidence}
          onChange={(e) => onChange({ ...rule, minThreatConfidence: num(e.target.value, rule.minThreatConfidence) })}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-muted uppercase tracking-wider text-[8px]">
        min destroy conf
        <input
          className={inputCls}
          type="number" min={0} max={1} step={0.01}
          value={rule.minDestroyedConfidence}
          onChange={(e) => onChange({ ...rule, minDestroyedConfidence: num(e.target.value, rule.minDestroyedConfidence) })}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-muted uppercase tracking-wider text-[8px]">
        payout (defpoint)
        <input
          className={inputCls}
          type="number" min={1} step={1}
          value={rule.payout}
          onChange={(e) => onChange({ ...rule, payout: Math.max(1, Math.round(num(e.target.value, rule.payout))) })}
        />
      </label>
      <div className="flex flex-col gap-1 justify-end pb-0.5">
        <label className="flex items-center gap-1.5 cursor-pointer select-none text-[9px] uppercase tracking-wider text-muted">
          <input
            type="checkbox" className="accent-cyan"
            checked={rule.requireDestroyed}
            onChange={(e) => onChange({ ...rule, requireDestroyed: e.target.checked })}
          />
          require destroyed
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none text-[9px] uppercase tracking-wider text-muted">
          <input
            type="checkbox" className="accent-cyan"
            checked={rule.requireConsistent}
            onChange={(e) => onChange({ ...rule, requireConsistent: e.target.checked })}
          />
          require consistent
        </label>
      </div>
    </div>
  );
}

/** Pick a unit (or onboard one inline), pick the two photos, run the pipeline. */
export function RunPanel() {
  const role = useMe().data?.role;
  const canRun = role === 'admin' || role === 'military';
  const canSetRule = role === 'admin' || role === 'government';

  const units = useUnits().data ?? [];
  const run = useRunEngagement();
  const runStage = useSettlementStore((s) => s.runStage);
  const runError = useSettlementStore((s) => s.runError);
  const running = runStage !== 'idle';

  const [unitId, setUnitId] = useState<string>('');
  const [showOnboard, setShowOnboard] = useState(false);
  const [showRule, setShowRule] = useState(false);
  const [rule, setRule] = useState<SettlementRule>(DEFAULT_RULE);
  const [reportImg, setReportImg] = useState<ImageSlot>({
    dataUrl: null,
    previewUrl: preStrikeUrl,
    name: 'drone2.jpg · sample threat',
  });
  const [postImg, setPostImg] = useState<ImageSlot>({
    dataUrl: null,
    previewUrl: postStrikeUrl,
    name: 'drone.jpg · sample wreckage',
  });

  const selectedUnit = useMemo(
    () => units.find((u) => u._id === unitId) ?? units[0] ?? null,
    [units, unitId],
  );

  const ruleModified = useMemo(
    () => JSON.stringify(rule) !== JSON.stringify(DEFAULT_RULE),
    [rule],
  );

  const start = async () => {
    if (!selectedUnit || running) return;
    // Downscale both photos so the JSON body fits the API's 1 MB limit
    // (bundled samples and phone uploads are both several MB as base64).
    const [reportDataUrl, postDataUrl] = await shrinkImagePair(
      reportImg.dataUrl ?? preStrikeUrl,
      postImg.dataUrl ?? postStrikeUrl,
    );
    run.mutate({
      unitId: selectedUnit._id,
      reportImage: { dataUrl: reportDataUrl },
      postImage: { dataUrl: postDataUrl },
      coords: DEMO_COORDS,
      ...(canSetRule && ruleModified ? { rule } : {}),
    });
  };

  return (
    <div className="border border-line bg-panel font-mono">
      <div className="px-3 py-2 border-b border-line text-[10px] uppercase tracking-wider font-semibold text-ink">
        Run engagement
      </div>
      <div className="p-3 flex flex-col gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] uppercase tracking-wider text-muted">claiming unit</span>
            <button
              type="button"
              onClick={() => setShowOnboard((v) => !v)}
              className="flex items-center gap-0.5 text-[9px] uppercase tracking-wider text-cyan hover:underline"
            >
              <Plus size={9} /> onboard
            </button>
          </div>
          <select
            className={inputCls + ' w-full'}
            value={selectedUnit?._id ?? ''}
            onChange={(e) => setUnitId(e.target.value)}
          >
            {units.length === 0 && <option value="">no units — onboard one</option>}
            {units.map((u) => (
              <option key={u._id} value={u._id}>
                {u._id} {u.humanBacked ? `· human (${u.humanBackingLevel})` : '· BOT — no human'}
              </option>
            ))}
          </select>
          {selectedUnit && !selectedUnit.humanBacked && (
            <div className="text-[9px] text-red mt-1">
              ⚠ no World proof — the settle-agent will reject this unit's claim
            </div>
          )}
        </div>

        {showOnboard && (
          <OnboardForm
            onDone={(id) => {
              setUnitId(id);
              setShowOnboard(false);
            }}
          />
        )}

        <div className="flex gap-2">
          <ImagePicker label="pre-strike report" slot={reportImg} onPick={setReportImg} />
          <ImagePicker label="post-strike evidence" slot={postImg} onPick={setPostImg} />
        </div>

        {canSetRule && (
          <div>
            <button
              type="button"
              onClick={() => setShowRule((v) => !v)}
              className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted hover:text-ink"
            >
              {showRule ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              settlement rule {ruleModified && <span className="text-amber">· modified</span>}
            </button>
            {showRule && <RuleEditor rule={rule} onChange={setRule} />}
          </div>
        )}

        <button
          type="button"
          disabled={!canRun || !selectedUnit || running}
          onClick={() => void start()}
          title={
            !canRun
              ? 'military or admin role required to run engagements'
              : 'report → Agent A → downing → Agent B → settle (~20-30s live)'
          }
          className="flex items-center justify-center gap-2 border border-green text-green text-[11px] font-semibold uppercase tracking-[0.2em] py-2 hover:bg-green/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play size={12} />
          {running ? 'running…' : 'run engagement'}
        </button>
        {!canRun && (
          <div className="text-[9px] text-muted">viewing as {role ?? '…'} — running requires military or admin</div>
        )}
        {runError && <div className="text-[9px] text-red">{runError}</div>}
      </div>
    </div>
  );
}
