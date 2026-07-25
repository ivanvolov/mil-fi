import { AppRail } from '../components/AppRail';
import { VersionList } from '../components/releases/VersionList';
import { PipelineBoard } from '../components/releases/PipelineBoard';

export function ReleasesPage() {
  return (
    <div className="h-screen flex flex-col bg-bg text-ink">
      <header className="h-12 border-b border-line bg-panel flex items-center gap-5 px-5 shrink-0">
        <div className="text-lg font-bold tracking-[0.25em]">RELEASES</div>
        <div className="text-[10px] font-mono text-muted uppercase tracking-wider">
          versions · autonomous update pipeline
        </div>
        <div className="flex-1" />
      </header>

      <div className="flex-1 flex min-h-0">
        <AppRail />
        <VersionList />
        <PipelineBoard />
      </div>
    </div>
  );
}
