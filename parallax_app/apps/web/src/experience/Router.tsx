// Hash router: Home story + the app pages. See state/store.ts (routeOfHash) for the hash forms.
//   '#/' or empty hash                  -> Home (the landing story; three.js only loads from inside it)
//   '#/calendar?aoi=BGD&y=2024&m=3'     -> a page; also #/map, #/sensors, #/method, #/data, #/live (once registered)
//   '#aoi=BGD&y=2024', '#/app', '#/app?...' (legacy links) -> Calendar
//   anything else ('#lx-main', '#how', '#/foo') -> Home (in-page anchors keep working)
// The selection store is attached once at startup; it never rewrites the hash while Home is shown.
import { useEffect, useState } from 'react';
import { App } from '../App';
import HomePage from '../pages/HomePage';
import { routeOfHash, selectionStore, type Route } from '../state/store';

export function routeOf(hash: string, current?: Route): Route {
  const r = routeOfHash(hash);
  if (r !== 'home' || !current) return r;
  // An in-page anchor of the page currently shown (e.g. '#main') keeps the current route.
  let id = '';
  try { id = decodeURIComponent(hash.replace(/^#/, '')); } catch { /* malformed */ }
  if (id && !id.startsWith('/') && document.getElementById(id)) return current;
  return r;
}

const TITLES: Partial<Record<Route, string>> = { calendar: 'Burning calendar', map: 'Map', sensors: 'Two satellites', method: 'How it works', data: 'Data & sources', live: 'Live', story: 'Story' };

let attached = false;
function ensureStore() { if (attached) return; attached = true; selectionStore.attach(); }

export function Router() {
  const [route, setRoute] = useState<Route>(() => { ensureStore(); return routeOfHash(location.hash); });
  useEffect(() => {
    const on = () => setRoute((cur) => routeOf(location.hash, cur));
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.route = route;
    if (route !== 'home') window.scrollTo(0, 0);
    document.title = route === 'home' ? 'Parallax Fire — two satellites, one honest fire record' : `${TITLES[route] ?? 'Parallax Fire'} · Parallax Fire`;
  }, [route]);
  if (route === 'home') return <HomePage />;
  return <App route={route} />;
}
