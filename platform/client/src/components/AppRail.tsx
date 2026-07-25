import { Link, useLocation } from 'react-router-dom';
import { Map, Scale, Settings, type LucideIcon } from 'lucide-react';
import { useUiStore } from '../stores/uiStore';

type Tab = {
  label: string;
  to: string;
  icon: LucideIcon;
  active: (pathname: string) => boolean;
};

function RailLink({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      to={tab.to}
      title={tab.label}
      aria-label={tab.label}
      className={`w-10 h-10 flex flex-col items-center justify-center gap-0.5 border ${
        active
          ? 'border-cyan text-cyan bg-cyan/5'
          : 'border-transparent text-muted hover:text-ink hover:border-line'
      }`}
    >
      <Icon size={14} />
      <span className="text-[8px] font-mono uppercase tracking-wider">{tab.label}</span>
    </Link>
  );
}

export function AppRail() {
  const lastSlug = useUiStore((s) => s.lastLayerSlug) ?? 'vzil-1';
  const { pathname } = useLocation();
  const topTabs: Tab[] = [
    {
      label: 'Sector',
      to: `/layers/${lastSlug}`,
      icon: Map,
      active: (p) => p.startsWith('/layers/'),
    },
    {
      label: 'Settle',
      to: '/settlement',
      icon: Scale,
      active: (p) => p === '/settlement',
    },
  ];
  // Sandbox + Releases are hidden for the bounty demo (routes still work by URL).
  const bottomTabs: Tab[] = [
    {
      label: 'Settings',
      to: '/types',
      icon: Settings,
      active: (p) => p === '/types',
    },
  ];

  return (
    <nav className="w-12 shrink-0 bg-bg border-r border-line flex flex-col items-center py-2 gap-1">
      {topTabs.map((t) => (
        <RailLink key={t.label} tab={t} active={t.active(pathname)} />
      ))}
      <div className="flex-1" />
      {bottomTabs.map((t) => (
        <RailLink key={t.label} tab={t} active={t.active(pathname)} />
      ))}
    </nav>
  );
}
