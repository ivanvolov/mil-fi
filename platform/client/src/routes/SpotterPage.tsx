import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, MapPin, Send, Upload } from 'lucide-react';
import { api } from '../api/client';
import { AppRail } from '../components/AppRail';
import { AgentACard } from '../components/settlement/VerdictCard';
import { shrinkImage } from '../lib/settlement-image';
import type { Spot } from '../types/settlement';
import sampleThreatUrl from '../assets/settlement/drone2.jpg';

const inputCls =
  'bg-bg border border-line px-2 py-1 text-[11px] text-ink font-mono focus:border-cyan outline-none';

function useSpots() {
  return useQuery<Spot[]>({
    queryKey: ['settlement', 'spots'],
    queryFn: () => api.getSpots(),
    refetchInterval: 10_000,
  });
}

function SpotRow({ spot, selected, onSelect }: { spot: Spot; selected: boolean; onSelect: () => void }) {
  const v = spot.agentA.verdict;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left border px-2 py-1.5 flex items-center gap-2 font-mono text-[10px] ${
        selected ? 'border-cyan bg-cyan/5' : 'border-line hover:border-cyan/50'
      }`}
    >
      <span className={v.is_threat ? 'text-red font-bold' : 'text-muted'}>
        {v.is_threat ? 'THREAT' : 'clear'}
      </span>
      <span className="text-ink uppercase">{v.classification.replace(/_/g, ' ')}</span>
      <span className="text-muted">{Math.round(v.confidence * 100)}%</span>
      <span className="flex-1" />
      <span className="text-muted truncate">{spot.spotterLabel}</span>
      <span className="text-muted shrink-0">{new Date(spot.createdAt).toLocaleTimeString()}</span>
    </button>
  );
}

/**
 * Spotter view: the one-job screen for civilian spotters. Photograph the sky,
 * send it, and Agent A (0G) answers "is that a threat?" — the sighting lands on
 * the HCS evidence trail as a `report` for crews and settlement to build on.
 */
export function SpotterPage() {
  const qc = useQueryClient();
  const spots = useSpots().data ?? [];
  const inputRef = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<{ dataUrl: string | null; previewUrl: string; name: string }>({
    dataUrl: null,
    previewUrl: sampleThreatUrl,
    name: 'drone2.jpg · sample sighting',
  });
  const [note, setNote] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Best-effort geolocation — a spot with coords is far more useful to crews,
  // but denial/failure must never block the report.
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {},
      { timeout: 5_000, maximumAge: 60_000 },
    );
  }, []);

  const report = useMutation({
    mutationFn: async () => {
      const dataUrl = await shrinkImage(image.dataUrl ?? sampleThreatUrl);
      return api.reportSpot({
        image: { dataUrl },
        ...(coords ? { coords } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
    },
    onSuccess: (spot) => {
      setSelectedId(spot._id);
      setNote('');
      qc.invalidateQueries({ queryKey: ['settlement', 'spots'] });
    },
  });

  const selected = report.data && report.data._id === selectedId
    ? report.data
    : spots.find((s) => s._id === selectedId) ?? null;

  return (
    <div className="h-screen flex flex-col bg-bg text-ink">
      <header className="h-12 border-b border-line bg-panel flex items-center gap-5 px-5 shrink-0">
        <div className="text-lg font-bold tracking-[0.25em]">SPOTTER</div>
        <div className="text-[10px] font-mono text-muted uppercase tracking-wider">
          see something → report it → Agent A verifies
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <AppRail />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-xl mx-auto p-4 flex flex-col gap-3 font-mono">
            <div className="border border-line bg-panel">
              <div className="px-3 py-2 border-b border-line text-[10px] uppercase tracking-wider font-semibold">
                Report a sighting
              </div>
              <div className="p-3 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="relative w-full h-52 border border-line hover:border-cyan overflow-hidden group"
                  title={`${image.name} — click to upload a different photo`}
                >
                  <img src={image.previewUrl} alt="sighting" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-bg/70 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-cyan">
                    <Upload size={12} /> replace photo
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-bg/80 px-2 py-0.5 text-[9px] text-muted truncate text-left">
                    {image.name}
                  </div>
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = () =>
                      setImage({ dataUrl: r.result as string, previewUrl: r.result as string, name: f.name });
                    r.readAsDataURL(f);
                  }}
                />

                <input
                  className={inputCls + ' w-full'}
                  placeholder="note (optional) — e.g. low over the river, heading west"
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />

                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted">
                  <MapPin size={10} className={coords ? 'text-green' : 'text-muted'} />
                  {coords
                    ? `position attached · ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`
                    : 'no position — report still goes through'}
                </div>

                <button
                  type="button"
                  disabled={report.isPending}
                  onClick={() => report.mutate()}
                  title="one 0G inference call (~5-15s live)"
                  className="flex items-center justify-center gap-2 border border-cyan text-cyan text-[11px] font-semibold uppercase tracking-[0.2em] py-2 hover:bg-cyan/10 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={12} />
                  {report.isPending ? 'Agent A analyzing…' : 'report sighting'}
                </button>
                {report.isError && (
                  <div className="text-[9px] text-red">{(report.error as Error).message}</div>
                )}
              </div>
            </div>

            {selected && <AgentACard run={selected.agentA} />}

            <div className="border border-line bg-panel">
              <div className="px-3 py-2 border-b border-line text-[10px] uppercase tracking-wider font-semibold flex items-center gap-2">
                <Eye size={11} className="text-cyan" /> Recent sightings
              </div>
              <div className="p-2 flex flex-col gap-1">
                {spots.length === 0 && (
                  <div className="text-[10px] text-muted px-1 py-2 text-center">
                    no sightings yet — yours will be the first
                  </div>
                )}
                {spots.map((s) => (
                  <SpotRow
                    key={s._id}
                    spot={s}
                    selected={s._id === selectedId}
                    onSelect={() => setSelectedId(s._id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
