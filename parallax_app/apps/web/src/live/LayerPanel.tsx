import { Camera, ChevronUp, Flame, Globe2, Satellite } from 'lucide-react';
import { LIVE_COLORS } from '../ui/LiveLayer';
import { fmtNum } from '../data/format';
import { WORLD_KEYS, WORLD_LABEL, type WorldKey, type WorldSource } from '../data/live';
import { DAILY, GEO, NIGHT, dailyDate, GIBS_CREDIT, type DailyKey, type GibsTimes } from './gibs';
import { SAT_COLORS, type Sat } from './orbits';
import type { Strongest } from './world';

export type ImageryMode = 'none' | DailyKey | 'goes_east' | 'goes_west' | 'night';
const utcShort = (iso: string | null) => (iso ? iso.slice(0, 16).replace('T', ' ') + ' UTC' : 'unknown');
const hh = (ms: number) => new Date(ms).toISOString().slice(11, 16) + ' UTC';

export function minutesOld(iso: string | null, now = Date.now()): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 60_000)) : null;
}

interface Props {
  open: boolean; onOpen: (v: boolean) => void;
  hotOn: boolean; onHot: (v: boolean) => void; sources: Record<WorldKey, WorldSource>; fetchedUtc: string | null; strong: Strongest[]; onStrong: (s: Strongest) => void;
  imagery: ImageryMode; onImagery: (m: ImageryMode) => void; gibs: GibsTimes | null;
  satsOn: boolean; onSats: (v: boolean) => void; sats: Sat[] | null; satsState: 'loading' | 'ok' | 'unavailable'; satsFetched: string | null;
  satRef: (key: string, el: HTMLElement | null) => void; passes: { key: string; text: string }[]; placeLabel: string;
}

function Badge({ state }: { state: 'loading' | 'ok' | 'partial' | 'unavailable' | 'off' }) {
  const t = { loading: 'Loading', ok: 'Live', partial: 'Some missing', unavailable: 'Unavailable', off: 'Off' }[state];
  return <span className="lv-badge" data-state={state}>{t}</span>;
}

export function LayerPanel(p: Props) {
  const list = WORLD_KEYS.map((k) => p.sources[k]);
  const anyOk = list.some((s) => s.state === 'ok'), anyLoading = list.some((s) => s.state === 'loading'), anyFailed = list.some((s) => s.state === 'failed');
  const hotState = !p.hotOn ? 'off' : anyLoading ? 'loading' : !anyOk ? 'unavailable' : anyFailed ? 'partial' : 'ok';
  const goesAge = (k: 'goes_east' | 'goes_west') => minutesOld(p.gibs?.geo[k]?.time ?? null);
  const imageryRows: { m: ImageryMode; label: string; sub: string }[] = [
    { m: 'none', label: 'No picture', sub: 'Just the map' },
    ...(Object.keys(DAILY) as DailyKey[]).map((k) => ({ m: k as ImageryMode, label: `${DAILY[k].label}, yesterday`, sub: `True colour, ${dailyDate(p.gibs, k)} (UTC day)` })),
    ...(['goes_east', 'goes_west'] as const).map((k) => {
      const t = p.gibs?.geo[k]?.time ?? null, age = goesAge(k);
      return { m: k as ImageryMode, label: `${GEO[k].label}, latest`, sub: p.gibs === null ? 'Checking the latest time...' : t ? `Americas, updated every 10 minutes, about ${age ?? '?'} minutes old (${utcShort(t)})` : 'Latest time could not be checked' };
    }),
    { m: 'night', label: 'Night lights', sub: `A fixed picture from ${NIGHT.date.slice(0, 4)}, not live` }
  ];
  return (
    <aside className="lv-panel" data-open={p.open ? 'true' : 'false'} aria-label="Layers">
      <button type="button" className="lv-panel__handle" aria-expanded={p.open} onClick={() => p.onOpen(!p.open)}><ChevronUp size={16} aria-hidden /> Layers</button>
      <div className="lv-panel__body">
        <section className="lv-layer" aria-labelledby="lv-h-hot">
          <header><h2 id="lv-h-hot"><Flame size={15} aria-hidden /> Hot spots, last 24 hours</h2><Badge state={hotState} /></header>
          <label className="lv-switch"><input type="checkbox" checked={p.hotOn} onChange={(e) => p.onHot(e.target.checked)} /> Show on the map</label>
          <p className="lv-src">Source: NASA FIRMS, near-real-time. {p.fetchedUtc ? <>Read {utcShort(p.fetchedUtc)}.</> : null}</p>
          <ul className="lv-list">
            {list.map((s) => (
              <li key={s.key}>
                <b>{WORLD_LABEL[s.key]}</b>
                <span data-state={s.state}>
                  {s.state === 'loading' ? 'loading...' : s.state === 'ok' ? `${fmtNum(s.count)} hot spots${s.newest_utc ? `, newest ${utcShort(s.newest_utc)}` : ''}` : s.state === 'empty' ? 'no detections in this feed right now' : `not available (${s.error ?? 'feed problem'})`}
                </span>
              </li>
            ))}
          </ul>
          <ul className="lv-legend" aria-label="Legend">
            <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><circle cx="7" cy="7" r="5.5" fill={LIVE_COLORS.modis} stroke="currentColor" /></svg> Circle: MODIS, older satellite (1 km)</li>
            <li><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M7 1 13 7 7 13 1 7Z" fill={LIVE_COLORS.viirs} stroke="currentColor" /></svg> Diamond: VIIRS, sharper satellite (375 m)</li>
            <li>Bigger symbol: more hot spots grouped there. Zoom in to see single ones.</li>
          </ul>
          <p className="lv-note">A hot spot is not a confirmed wildfire: it is a place a satellite saw as unusually hot. Near-real-time, may be revised.</p>
          {p.strong.length > 0 && (
            <>
              <h3 className="lv-h3">Strongest heat in the last 24 hours</h3>
              <ul className="lv-strong">
                {p.strong.map((s, i) => (
                  <li key={i}><button type="button" onClick={() => p.onStrong(s)}>{fmtNum(s.frp, 0)} MW at {Math.abs(s.lat).toFixed(1)}°{s.lat >= 0 ? 'N' : 'S'} {Math.abs(s.lon).toFixed(1)}°{s.lon >= 0 ? 'E' : 'W'}<small>{WORLD_LABEL[s.key]}, {s.hhmm} UTC</small></button></li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="lv-layer" aria-labelledby="lv-h-img">
          <header><h2 id="lv-h-img"><Globe2 size={15} aria-hidden /> Satellite pictures</h2><Badge state={p.imagery === 'none' ? 'off' : p.gibs === null && p.imagery !== 'night' ? 'loading' : p.gibs?.state === 'unavailable' && p.imagery !== 'night' ? 'partial' : 'ok'} /></header>
          <p className="lv-src">Source: NASA GIBS. {p.gibs?.state === 'unavailable' ? 'The latest-time check is not reachable, so daily pictures use yesterday and the geostationary view has no time.' : null}</p>
          <div className="lv-radios" role="radiogroup" aria-label="Satellite picture">
            {imageryRows.map((r) => (
              <label key={r.m} className={'lv-radio' + (p.imagery === r.m ? ' is-on' : '')}>
                <input type="radio" name="lv-imagery" checked={p.imagery === r.m} onChange={() => p.onImagery(r.m)} />
                <span><b>{r.label}</b><small>{r.sub}</small></span>
              </label>
            ))}
          </div>
          <p className="lv-note">{GIBS_CREDIT}. The geostationary view is a look at the Americas from a satellite that stays above one spot; it is the closest thing to a live camera. Its age is shown above.</p>
        </section>

        <section className="lv-layer" aria-labelledby="lv-h-sat">
          <header><h2 id="lv-h-sat"><Satellite size={15} aria-hidden /> Satellites now</h2><Badge state={!p.satsOn ? 'off' : p.satsState} /></header>
          <label className="lv-switch"><input type="checkbox" checked={p.satsOn} onChange={(e) => p.onSats(e.target.checked)} /> Show on the map</label>
          <p className="lv-src">Source: CelesTrak orbit records{p.satsFetched ? `, read ${utcShort(p.satsFetched)}` : ''}. Positions are worked out in your browser and refresh every second; the dashed line is the next 100 minutes.</p>
          {p.satsState === 'unavailable' && <p className="lv-warn" role="status">The orbit records could not be loaded, so no satellite positions are shown.</p>}
          {p.sats && (
            <ul className="lv-sats">
              {p.sats.map((s) => (
                <li key={s.key}>
                  <i style={{ background: SAT_COLORS[s.key] }} aria-hidden />
                  <b>{s.name}</b>
                  <span ref={(el) => p.satRef(s.key, el)} className="lv-sats__pos">...</span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="lv-h3">Next pass over {p.placeLabel}</h3>
          {p.passes.length ? <ul className="lv-pass">{p.passes.map((x) => <li key={x.key}>{x.text}</li>)}</ul> : <p className="lv-note">Choose Bangladesh, California or New South Wales above to see when each satellite next passes over.</p>}
          <p className="lv-note">A pass is counted when the place is inside the strip the satellite's camera can see.</p>
        </section>

        <section className="lv-layer" aria-labelledby="lv-h-cam">
          <header><h2 id="lv-h-cam"><Camera size={15} aria-hidden /> Cameras</h2></header>
          <p className="lv-note">There are no ground cameras here. The pictures from fire cameras are not licensed to be shown on other sites, so we do not embed them and we never show a looping or made-up video. The satellite pictures above are the live view. For California, see the cameras at <a href="https://alertcalifornia.org" target="_blank" rel="noreferrer">alertcalifornia.org</a>.</p>
        </section>
      </div>
    </aside>
  );
}

export { hh as utcHm };
