import { useState } from 'react';
import { Check, Clipboard, Wrench } from 'lucide-react';
import type { Layer } from '@shared/schemas/layer';
import { useUiStore } from '../../stores/uiStore';
import { LayerSwitcher } from './LayerSwitcher';
import { LayersMenu } from './LayersMenu';

export function TopBar({ layer }: { layer: Layer }) {
  const editOn = useUiStore((s) => s.visibility.edit);
  const toggle = useUiStore((s) => s.toggleVisibility);
  const [copied, setCopied] = useState(false);

  const copyView = async () => {
    const view = useUiStore.getState().mapViewByLayer[layer._id];
    const center = view?.center ?? layer.mapCenter;
    const zoom = view?.zoom ?? layer.mapZoom;
    const payload = `{ "center": { "lat": ${center.lat.toFixed(5)}, "lng": ${center.lng.toFixed(5)} }, "zoom": ${zoom} }`;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard blocked (insecure context / permission) — surface inline so the operator can still grab it
      window.prompt('Copy this view:', payload);
    }
  };

  return (
    <header className="h-12 border-b border-line bg-panel flex items-center gap-3 px-5 shrink-0">
      <div className="text-lg font-bold tracking-[0.25em]">HOC</div>

      <LayerSwitcher />

      <button
        type="button"
        onClick={() => toggle('edit')}
        title={editOn ? 'Edit mode ON — click to disable' : 'Enable edit mode'}
        className={`w-7 h-7 flex items-center justify-center border ${editOn ? 'border-amber text-amber bg-amber/10' : 'border-line text-muted hover:border-amber hover:text-amber'}`}
      >
        <Wrench size={14} />
      </button>

      <button
        type="button"
        onClick={copyView}
        title="Copy current map center + zoom as JSON"
        className={`w-7 h-7 flex items-center justify-center border ${copied ? 'border-cyan text-cyan bg-cyan/10' : 'border-line text-muted hover:border-cyan hover:text-cyan'}`}
      >
        {copied ? <Check size={14} /> : <Clipboard size={14} />}
      </button>

      <span className="sr-only">{layer.name}</span>

      <div className="flex-1" />

      <LayersMenu />

      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-muted uppercase-label">Center</span>
        <span className="text-ink">
          {layer.mapCenter.lat.toFixed(4)} N · {layer.mapCenter.lng.toFixed(4)} E
        </span>
      </div>

    </header>
  );
}
