import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useLayerFull } from './queries/useLayerFull';
import { useLayers } from './queries/useLayers';
import { TopBar } from './components/topbar/TopBar';
import { LeftRail } from './components/leftrail/LeftRail';
import { MapHost } from './components/map/MapHost';
import { RightInspector } from './components/inspector/RightInspector';
import { EditorMount } from './components/dialogs/EditorMount';
import { AppRail } from './components/AppRail';
import { useUiStore } from './stores/uiStore';

export function App() {
  const { slug = 'vzil-1' } = useParams();
  const layersQ = useLayers();
  const layerQ = useLayerFull(slug);
  const setLastLayerSlug = useUiStore((s) => s.setLastLayerSlug);
  useEffect(() => { setLastLayerSlug(slug); }, [slug, setLastLayerSlug]);

  // Wait for the layer list before deciding whether the requested slug exists.
  if (layersQ.isLoading || (layerQ.isLoading && !layersQ.data)) {
    return (
      <div className="h-screen flex items-center justify-center text-muted font-mono text-sm">
        loading layer "{slug}"…
      </div>
    );
  }

  // Requested slug doesn't exist → fall back to the first available layer
  // (server returns them active-first, then by name). Keeps a stale/bad slug in
  // the URL or localStorage from dead-ending on "layer not found".
  const layers = layersQ.data ?? [];
  const slugExists = layers.some((l) => l.slug === slug);
  if (layers.length > 0 && !slugExists && layers[0]!.slug !== slug) {
    return <Navigate to={`/layers/${layers[0]!.slug}`} replace />;
  }

  if (layerQ.isLoading) {
    return (
      <div className="h-screen flex items-center justify-center text-muted font-mono text-sm">
        loading layer "{slug}"…
      </div>
    );
  }
  if (layerQ.isError || !layerQ.data) {
    return (
      <div className="h-screen flex items-center justify-center text-red font-mono text-sm">
        {layers.length === 0
          ? 'no sectors exist yet — create one to get started'
          : `failed to load layer: ${(layerQ.error as Error | null)?.message ?? 'unknown error'}`}
      </div>
    );
  }

  const data = layerQ.data;
  return (
    <div className="h-screen flex flex-col">
      <TopBar layer={data.layer} />
      <div className="flex-1 flex min-h-0">
        <AppRail />
        <LeftRail data={data} />
        <main id="map-shell" className="flex-1 relative min-w-0">
          <MapHost data={data} />
        </main>
        <RightInspector data={data} />
      </div>
      <EditorMount />
    </div>
  );
}
