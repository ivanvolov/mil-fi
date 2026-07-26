import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { App } from './App';
import { TypesManagementPage } from './routes/TypesManagementPage';
import { SandboxPage } from './routes/SandboxPage';
import { ReleasesPage } from './routes/ReleasesPage';
import { SettlementPage } from './routes/SettlementPage';
import { SpotterPage } from './routes/SpotterPage';
import { LoginPage } from './pages/Login';
import { RequireAuth } from './pages/RequireAuth';
import { useLayers } from './queries/useLayers';
import { useMe } from './queries/useMe';
import './styles/index.css';

/** Read a persisted string field out of the zustand-persisted store, if any. */
function readPersistedString(field: 'lastLayerSlug'): string | null {
  try {
    const raw = localStorage.getItem('mil-fi-ui');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const v = parsed?.state?.[field];
    return typeof v === 'string' && v ? v : null;
  } catch { return null; }
}

/** Root landing: send each role to its workspace — spotters to /spotter,
 *  government to /settlement; everyone else gets a sector slug that actually
 *  exists (prefers the last-visited one if still valid, else the first). */
function LandingRedirect() {
  const meQ = useMe();
  const layersQ = useLayers();
  if (meQ.isLoading) return null;
  const role = meQ.data?.role;
  if (role === 'spotter') return <Navigate to="/spotter" replace />;
  if (role === 'government') return <Navigate to="/settlement" replace />;
  if (layersQ.isLoading) return null;
  const layers = layersQ.data ?? [];
  if (layers.length === 0) return <Navigate to="/types" replace />;
  const stored = readPersistedString('lastLayerSlug');
  const slug = (stored && layers.some((l) => l.slug === stored)) ? stored : layers[0]!.slug;
  return <Navigate to={`/layers/${slug}`} replace />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><LandingRedirect /></RequireAuth>} />
          <Route path="/layers/:slug" element={<RequireAuth><App /></RequireAuth>} />
          <Route path="/sandbox" element={<RequireAuth><SandboxPage /></RequireAuth>} />
          <Route path="/types" element={<RequireAuth><TypesManagementPage /></RequireAuth>} />
          <Route path="/releases" element={<RequireAuth><ReleasesPage /></RequireAuth>} />
          <Route path="/settlement" element={<RequireAuth><SettlementPage /></RequireAuth>} />
          <Route path="/spotter" element={<RequireAuth><SpotterPage /></RequireAuth>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
