import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { App } from './App';
import { TypesManagementPage } from './routes/TypesManagementPage';
import { SandboxPage } from './routes/SandboxPage';
import { ReleasesPage } from './routes/ReleasesPage';
import { SettlementPage } from './routes/SettlementPage';
import { LoginPage } from './pages/Login';
import { RequireAuth } from './pages/RequireAuth';
import { useLayers } from './queries/useLayers';
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

/** Root landing: pick a sector slug that actually exists. Prefers the last-visited
 *  one (if still valid), else the first available. */
function LandingRedirect() {
  const layersQ = useLayers();
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
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
