import { Link, useLocation } from 'react-router-dom';
import { Crosshair, Eye, Landmark, Map, Scale, Settings, LogOut, type LucideIcon } from 'lucide-react';
import { useUiStore } from '../stores/uiStore';
import { useMe, type Role } from '../queries/useMe';

async function logout() {
  try {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
  } finally {
    window.location.href = '/login';
  }
}

type Tab = {
  label: string;
  to: string;
  icon: LucideIcon;
  active: (pathname: string) => boolean;
  /** Roles that see this tab. Presentation-only — the server enforces the real
   *  rules — so hidden routes stay reachable by URL (handy mid-demo). */
  roles: Role[];
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
  const role = useMe().data?.role;
  // Each role gets its OWN window: military → Engage, government → Govern,
  // spotters → Spot, plus Sector map for military/admin. Admin also gets the
  // full Settlement story. While role is still loading, render no tabs.
  const forRole = (tabs: Tab[]) => (role ? tabs.filter((t) => t.roles.includes(role)) : []);
  const topTabs: Tab[] = forRole([
    {
      label: 'Sector',
      to: `/layers/${lastSlug}`,
      icon: Map,
      active: (p) => p.startsWith('/layers/'),
      roles: ['admin', 'military'],
    },
    {
      label: 'Spot',
      to: '/spotter',
      icon: Eye,
      active: (p) => p === '/spotter',
      roles: ['admin', 'spotter'],
    },
    {
      // Military's own engagement workspace — the live report→verdict→payout pipeline.
      label: 'Engage',
      to: '/engagement',
      icon: Crosshair,
      active: (p) => p === '/engagement',
      roles: ['admin', 'military'],
    },
    {
      // Government's own window — payout policy, tariffs, disputes, balances.
      label: 'Govern',
      to: '/government',
      icon: Landmark,
      active: (p) => p === '/government',
      roles: ['admin', 'government'],
    },
    {
      // Admin-only: the full end-to-end settlement story on one console.
      label: 'Settle',
      to: '/settlement',
      icon: Scale,
      active: (p) => p === '/settlement',
      roles: ['admin'],
    },
  ]);
  // Sandbox + Releases are hidden for the bounty demo (routes still work by URL).
  const bottomTabs: Tab[] = forRole([
    {
      label: 'Settings',
      to: '/types',
      icon: Settings,
      active: (p) => p === '/types',
      roles: ['admin'],
    },
  ]);

  return (
    <nav className="w-12 shrink-0 bg-bg border-r border-line flex flex-col items-center py-2 gap-1">
      {topTabs.map((t) => (
        <RailLink key={t.label} tab={t} active={t.active(pathname)} />
      ))}
      <div className="flex-1" />
      {bottomTabs.map((t) => (
        <RailLink key={t.label} tab={t} active={t.active(pathname)} />
      ))}
      {role && (
        <div
          className="text-[7px] font-mono uppercase tracking-wider text-muted text-center leading-tight"
          title={`signed in as ${role}`}
        >
          {role}
        </div>
      )}
      <button
        type="button"
        onClick={() => void logout()}
        title="Log out"
        aria-label="Log out"
        className="w-10 h-10 flex flex-col items-center justify-center gap-0.5 border border-transparent text-muted hover:text-red hover:border-line"
      >
        <LogOut size={14} />
        <span className="text-[8px] font-mono uppercase tracking-wider">Out</span>
      </button>
    </nav>
  );
}
