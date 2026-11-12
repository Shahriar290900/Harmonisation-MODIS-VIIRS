// The app part of the site: one shared snapshot + selection, the shell (top bar, navigation, footer) and one page per route.
// Pages are separate files in src/pages. The Live page is registered automatically once src/pages/LivePage.tsx exists.
import { lazy, Suspense, type ComponentType } from 'react';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';
import type { Route } from './state/store';
import { AppShell } from './shell/AppShell';
import { WorkspaceProvider, useWorkspace } from './shell/workspace';
import CalendarPage from './pages/CalendarPage';
import MapPage from './pages/MapPage';
import SensorsPage from './pages/SensorsPage';
import MethodPage from './pages/MethodPage';
import DataPage from './pages/DataPage';

NProgress.configure({ showSpinner: false });

// Track RV-B: create src/pages/LivePage.tsx with a default export (a component that renders its own <main data-page="live">).
// The glob finds it; the Live nav item and the #/live route turn on by themselves. No other file needs editing.
const LIVE_MODULES = import.meta.glob('./pages/LivePage.tsx');
const LIVE_LOADER = Object.values(LIVE_MODULES)[0] as (() => Promise<{ default: ComponentType }>) | undefined;
const LivePage = LIVE_LOADER ? lazy(LIVE_LOADER) : null;
export const LIVE_AVAILABLE = !!LivePage;

const PAGES: Partial<Record<Route, ComponentType>> = { calendar: CalendarPage, map: MapPage, sensors: SensorsPage, method: MethodPage, data: DataPage };

function Page({ route }: { route: Route }) {
  const { ready } = useWorkspace();
  if (!ready) return <main id="main" data-page={route} className="page"><div className="boot" aria-busy="true"><div className="boot__spin" /><p>Opening the data…</p></div></main>;
  const P = route === 'live' && LivePage ? LivePage : PAGES[route] ?? CalendarPage;
  return <Suspense fallback={<main id="main" data-page={route} className="page" aria-busy="true" />}><P /></Suspense>;
}

export function App({ route }: { route: Route }) {
  const r: Route = route === 'live' && !LIVE_AVAILABLE ? 'calendar' : route;
  return (
    <WorkspaceProvider>
      <AppShell route={r} liveAvailable={LIVE_AVAILABLE}><Page route={r} /></AppShell>
    </WorkspaceProvider>
  );
}
