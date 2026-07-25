import { useParams } from 'react-router-dom';
import { useUiStore } from '../../stores/uiStore';
import { useLayerFull } from '../../queries/useLayerFull';
import { InterceptorEditDialog } from './InterceptorEditDialog';
import { TeamEditDialog } from './TeamEditDialog';
import { ThreatEditDialog } from './ThreatEditDialog';
import { DrawingEditDialog } from './DrawingEditDialog';

/** Mounted once near the App root; renders the right edit dialog based on uiStore.editing. */
export function EditorMount() {
  const { slug = 'vzil-1' } = useParams();
  const editing = useUiStore((s) => s.editing);
  const close = useUiStore((s) => s.closeEditor);
  const layerQ = useLayerFull(slug);

  if (!editing || !layerQ.data) return null;

  if (editing.kind === 'interceptor') {
    const i = layerQ.data.interceptors.find((x) => x._id === editing.id);
    const t = i ? layerQ.data.types.interceptor.find((x) => x._id === i.typeId) : undefined;
    if (!i || !t) return null;
    return (
      <InterceptorEditDialog
        open
        onOpenChange={(v) => !v && close()}
        slug={slug}
        interceptor={i}
        type={t}
        allTypes={layerQ.data.types.interceptor}
        teams={layerQ.data.teams}
        threads={layerQ.data.threads}
      />
    );
  }
  if (editing.kind === 'team') {
    const team = layerQ.data.teams.find((x) => x._id === editing.id);
    if (!team) return null;
    return (
      <TeamEditDialog
        open
        onOpenChange={(v) => !v && close()}
        slug={slug}
        team={team}
        interceptors={layerQ.data.interceptors}
        threads={layerQ.data.threads}
      />
    );
  }
  if (editing.kind === 'threat') {
    const th = layerQ.data.threats.find((x) => x._id === editing.id);
    const tt = th ? layerQ.data.types.threat.find((x) => x._id === th.typeId) : undefined;
    if (!th || !tt) return null;
    return <ThreatEditDialog open onOpenChange={(v) => !v && close()} slug={slug} threat={th} type={tt} allTypes={layerQ.data.types.threat} />;
  }
  if (editing.kind === 'drawing') {
    const d = layerQ.data.drawings.find((x) => x._id === editing.id);
    if (!d) return null;
    return <DrawingEditDialog open onOpenChange={(v) => !v && close()} slug={slug} drawing={d} />;
  }
  return null;
}
