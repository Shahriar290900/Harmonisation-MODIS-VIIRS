// Live: the 3D Earth is the default view; the detailed flat map (imagery, layer panel, looks) is one tab away.
// The map is created a few seconds after the Earth is up (kept hidden) so switching is instant; the Earth pauses while the map shows.
import { Suspense, lazy, useEffect, useState } from 'react';
import { Globe2, Map as MapIcon } from 'lucide-react';
import { Page, PageHead, NextSteps } from '../shell/PageParts';
import { useSelection } from '../ui/bridge';
import { liveKeyFor } from '../data/live';
import { placeById, type Place } from '../live/places';
import EarthView from '../earth/EarthView';
import '../styles/earth.css';

const MapView = lazy(() => import('../live/MapView'));
type View = 'earth' | 'map';
const KEY = 'parallax-live-view';
const stored = (): View => { try { return sessionStorage.getItem(KEY) === 'map' ? 'map' : 'earth'; } catch { return 'earth'; } };

export default function LivePage() {
  const sel = useSelection();
  const [view, setView] = useState<View>(stored);
  const [mapWanted, setMapWanted] = useState(view === 'map');
  const [place, setPlace] = useState<Place>(() => { const k = liveKeyFor(sel.aoiId); return k ? placeById(k) : placeById('world'); });
  const pick = (v: View) => { setView(v); try { sessionStorage.setItem(KEY, v); } catch { /* storage blocked */ } if (v === 'map') setMapWanted(true); };
  useEffect(() => { if (mapWanted) return; const id = setTimeout(() => setMapWanted(true), 4000); return () => clearTimeout(id); }, [mapWanted]);
  const tabs = (
    <div className="seg seg--sm ev-tabs" role="group" aria-label="Live view">
      <button type="button" data-live-view="earth" className={view === 'earth' ? 'is-on' : ''} aria-pressed={view === 'earth'} onClick={() => pick('earth')}><Globe2 size={14} aria-hidden /> Earth</button>
      <button type="button" data-live-view="map" className={view === 'map' ? 'is-on' : ''} aria-pressed={view === 'map'} onClick={() => pick('map')}><MapIcon size={14} aria-hidden /> Map</button>
    </div>
  );
  return (
    <Page route="live" className="live-page">
      <PageHead title="Live" lead="Where the satellites are and where they saw heat today.">{tabs}</PageHead>
      <div hidden={view !== 'earth'}><EarthView active={view === 'earth'} place={place} onPlace={setPlace} onUnavailable={() => pick('map')} /></div>
      {mapWanted && <div hidden={view !== 'map'}><Suspense fallback={null}><MapView /></Suspense></div>}
      <p className="lv-credit small muted" title="Hot spots: NASA FIRMS (near-real-time, may be revised). We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS), part of NASA's Earth Observing System Data and Information System (EOSDIS). Orbit records: CelesTrak. Satellite pictures: NASA GIBS. Map: OpenFreeMap, OpenMapTiles, OpenStreetMap. Earth pictures: NASA Visible Earth, Blue Marble and Black Marble.">Credit: NASA FIRMS, Visible Earth, GIBS; CelesTrak.</p>
      <NextSteps to={['map', 'calendar', 'method']} />
    </Page>
  );
}
