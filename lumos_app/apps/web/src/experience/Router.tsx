// Hash router between the Landing experience and the Workspace (existing App). See contract.ts "Routing".
//   '#/' or empty hash        → Landing (lazy chunk; three.js only loads from inside it)
//   '#/app', '#/app?aoi=…'    → Workspace ('#/app?x' is normalized to '#x' so the selection store can parse it)
//   any hash with selection keys (#aoi=…, #y=…) → Workspace
//   anything else ('#lx-main', '#how', '#/foo') → Landing (in-page anchors keep working; REVIEW L6)
// The selection store is attached only when the Workspace first mounts, so visiting the Landing never rewrites
// the hash into '#aoi=…' (the store's attach() syncs the hash immediately).
import { lazy, Suspense, useEffect, useState } from 'react';
import { App } from '../App';
import { isWorkspaceHash, selectionStore } from '../state/store';

const Landing = lazy(() => import('./landing/Landing'));

export type Route = 'landing' | 'workspace';

export function routeOf(hash: string, current?: Route): Route {
  if (isWorkspaceHash(hash)) return 'workspace';
  // An in-page anchor of the page currently shown (e.g. '#main' in the workspace) keeps the current route.
  if (current) {
    let id = '';
    try { id = decodeURIComponent(hash.replace(/^#/, '')); } catch { /* malformed */ }
    if (id && !id.startsWith('/') && document.getElementById(id)) return current;
  }
  return 'landing';
}

/** '#/app?aoi=BGD&y=2016' → '#aoi=BGD&y=2016' (replaceState, no extra history entry). '#/app' alone is kept. */
export function normalizeAppHash(): void {
  try {
    const m = /^#\/app[?&/]?(.*)$/.exec(location.hash);
    if (m && m[1]) history.replaceState(history.state, '', `${location.pathname}${location.search}#${m[1]}`);
  } catch {
    /* ignore */
  }
}

let attached = false;
function ensureStore() {
  if (attached) return;
  attached = true;
  selectionStore.attach();
}

function Workspace() {
  ensureStore(); // idempotent; must run before App reads the store on its first render
  return <App />;
}

export function Router() {
  const [route, setRoute] = useState<Route>(() => {
    normalizeAppHash();
    return routeOf(location.hash);
  });
  useEffect(() => {
    const on = () => {
      normalizeAppHash();
      setRoute((cur) => routeOf(location.hash, cur));
    };
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.route = route;
    if (route === 'landing') document.title = 'Lumos Fire Calendar — two satellites, one honest fire record';
    else document.title = 'Lumos Fire Calendar';
  }, [route]);

  if (route === 'workspace') return <Workspace />;
  return (
    <Suspense fallback={<div className="boot" aria-busy="true"><div className="boot__spin" /><p>Loading…</p></div>}>
      <Landing />
    </Suspense>
  );
}
