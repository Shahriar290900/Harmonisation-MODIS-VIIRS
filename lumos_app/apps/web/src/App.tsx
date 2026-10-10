import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityRecord } from './types';
import { useCore, useActivity, useCells, useGeo, useFlat, type YearStatus } from './ui/useAppData';
import { actions, deriveDisplayState, headlineValue, selectionStore, setSelection, shownAnomalyFlag, useSelection, type MobileTab } from './ui/bridge';
import { useLayoutMode, useReducedMotion } from './ui/hooks';
import { TopBar, AboutData } from './ui/TopBar';
import { Calendar, cellStateFor } from './ui/Calendar';
import { CompareChart } from './ui/CompareChart';
import { MapPanel } from './ui/MapPanel';
import { Evidence } from './ui/Evidence';
import { ModelPanel } from './ui/ModelPanel';
import { Explainer } from './ui/Explainer';
import { Dialog } from './ui/Dialog';
import { PwaToast, StatusLine, snapshotAge, usePwa } from './ui/PwaStatus';
import { STATE_LABEL, type CellState } from './ui/glyphs';
import { Glyph } from './ui/Glyph';
import { fmtNum, monthLabel } from './data/format';
import { ArrowRight, CalendarDays, FileText, FlaskConical, Info, Map as MapIcon, Pause, Play, TrendingDown, TrendingUp } from 'lucide-react';
import { Icon3D } from './ui/icons/Icon3D';

type Tab = MobileTab;

export function App() {
  const { core, error } = useCore();
  const sel = useSelection();
  const tab = sel.mobileTab;
  const setTab = actions.setMobileTab;
  const mode = useLayoutMode();
  const reduced = useReducedMotion();
  const pwa = usePwa();
  const [range, setRange] = useState<[number, number] | null>(null);
  const [dlg, setDlg] = useState<null | 'about' | 'models' | 'explain'>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [playing, setPlaying] = useState(false);

  const allYears = core?.manifest.years ?? [];
  const region = core?.regions.find((r) => r.aoi_id === sel.aoiId);

  // REVIEW M8: validate AOI/year (from the URL hash, a pasted link or localStorage) on every change, against the
  // manifest + regions. Until valid, nothing is fetched for the bogus selection.
  const aoiOk = !!core && core.regions.some((r) => r.aoi_id === sel.aoiId) && (core.manifest.aois.length === 0 || core.manifest.aois.includes(sel.aoiId));
  const yearOk = allYears.includes(sel.year);
  useEffect(() => {
    if (!core) return;
    if (!aoiOk) {
      const first = core.regions.find((r) => core.manifest.aois.includes(r.aoi_id)) ?? core.regions[0];
      setSelection({ aoiId: first?.aoi_id ?? 'BGD' });
    }
    if (!yearOk && allYears.length) setSelection({ year: allYears.includes(2016) ? 2016 : allYears[allYears.length - 1] });
  }, [core, sel.aoiId, sel.year, aoiOk, yearOk]); // eslint-disable-line react-hooks/exhaustive-deps

  const [from, to] = range ?? [allYears[0] ?? 2001, allYears[allYears.length - 1] ?? 2025];
  const years = useMemo(() => allYears.filter((y) => y >= from && y <= to), [allYears, from, to]);

  const act = useActivity(aoiOk ? core?.snapshotId : undefined, sel.aoiId, allYears);
  const actMap = act.map;
  const flatAll = useFlat(actMap, allYears);
  const flat = useMemo(() => flatAll.filter((p) => p.year >= from && p.year <= to), [flatAll, from, to]);
  const cells = useCells(core?.snapshotId, region, sel.year);
  const geo = useGeo(core?.snapshotId, region);

  const max = useMemo(() => {
    let m = 1;
    for (const p of flatAll) {
      const st = deriveDisplayState(p.r);
      if (st === 'missing' || st === 'unsupported') continue;
      const v = headlineValue(p.r).value; if (v != null && v > m) m = v;
    }
    return m;
  }, [flatAll]);

  const record = flatAll.find((p) => p.year === sel.year && p.month === sel.month)?.r ?? null;
  const yearStatus: YearStatus = act.status.get(sel.year) ?? (act.loading ? 'loading' : 'ok');
  const monthState = cellStateFor(record, yearStatus);
  const errorYears = useMemo(() => [...act.status].filter(([, st]) => st === 'error').map(([y]) => y), [act.status]);
  const firstError = errorYears.length ? act.errors.get(errorYears[0]) : undefined;
  const allRecords = useMemo(() => flat.map((p) => p.r).filter(Boolean) as ActivityRecord[], [flat]);

  const onSelect = useCallback((year: number, month: number) => setSelection({ year, month }), []);
  const onRange = (f: number, t: number) => {
    setRange([f, t]);
    if (sel.year < f || sel.year > t) setSelection({ year: Math.max(f, Math.min(t, sel.year)) });
  };

  // Replay: step month by month through the visible year range.
  const selRef = useRef(sel); selRef.current = sel;
  // WATCHDOG F7: throttle hash/localStorage writes to ≤1/s while replaying; flush on pause/stop.
  useEffect(() => {
    selectionStore.holdSync(playing);
  }, [playing]);
  // REVIEW H1: on unmount (e.g. Back to the landing during Replay) release WITHOUT flushing — a flush here would
  // replaceState '#aoi=…' over the landing entry the browser just restored and bounce the Router to the workspace.
  useEffect(() => () => selectionStore.holdSync(false, { flush: false }), []);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const s = selRef.current;
      let y = s.year, m = s.month + 1;
      if (m > 12) { m = 1; y++; }
      if (y > to || y < from) { setPlaying(false); return; }
      setSelection({ year: y, month: m });
    }, reduced ? 1200 : 380);
    return () => clearInterval(id);
  }, [playing, from, to, reduced]);
  const startReplay = () => {
    if (!playing && sel.year === to && sel.month === 12) setSelection({ year: from, month: 1 });
    setPlaying(!playing);
  };

  if (error) return <div className="boot boot--err"><h1>Could not load the data snapshot</h1><p>{error}</p></div>;
  if (!core) return <div className="boot" aria-busy="true"><div className="boot__spin" /><p>Loading snapshot…</p></div>;

  const m = core.manifest;
  const desktop = mode === 'desktop', mobile = mode === 'mobile';
  const idx = flat.findIndex((p) => p.year === sel.year && p.month === sel.month);

  const calendarPanel = (
    <section className="panel cal-panel" aria-label="Burning calendar">
      <div className="panel__head">
        <h2 className="panel__title">Burning calendar <span className="muted">· {region?.name}</span></h2>
        <div className="replay">
          <button className={'btn btn--sm' + (playing ? ' btn--primary' : '')} onClick={startReplay} aria-pressed={playing} aria-label={playing ? 'Pause replay' : 'Replay month by month'}>
            <Icon3D icon={playing ? Pause : Play} tone={playing ? 'current' : 'amber'} size={14} filled />{playing ? 'Pause' : 'Replay'}
          </button>
          <input className="scrub" type="range" min={0} max={Math.max(0, flat.length - 1)} value={Math.max(0, idx)} aria-label="Scrub through months"
            aria-valuetext={monthLabel(sel.year, sel.month)}
            onChange={(e) => { const p = flat[+e.target.value]; if (p) onSelect(p.year, p.month); }} />
        </div>
      </div>
      {mobile && <SelectedSummary record={record} state={monthState} sel={sel} onMore={() => setTab('evidence')} />}
      <Calendar years={years} map={actMap} status={act.status} selection={sel} onSelect={onSelect} max={max} compact={mobile}
        onActivate={mobile ? () => setTab('evidence') : desktop ? () => setDrawerOpen(true) : undefined}
        unavailable={errorYears.length ? { years: errorYears, offline: act.offline, message: firstError } : undefined} onRetry={act.retry} />
    </section>
  );
  const chartPanel = (
    <section className="panel chart-panel" aria-label="Compare sensors">
      <div className="panel__head"><h2 className="panel__title">Compare sensors <span className="muted">· raw vs harmonized</span></h2></div>
      <CompareChart flat={flat} selection={sel} onSelect={onSelect} height={desktop ? 190 : mobile ? 210 : 250} />
    </section>
  );
  const mapPanel = <MapPanel region={region} geo={geo} cells={cells} selection={sel} visible={!mobile || tab === 'map'} monthState={monthState} />;
  const evidence = (
    <Evidence record={record} state={monthState} yearError={act.errors.get(sel.year)} offline={act.offline} onRetry={act.retry}
      selection={sel} region={region} manifest={m} snapshotPath={core.snapshotPath} sources={core.sources}
      allRecords={allRecords} expanded={!desktop || drawerOpen} onToggle={desktop ? () => setDrawerOpen(!drawerOpen) : undefined} embedded={mobile} />
  );

  return (
    <div className={`app app--${mode}`}>
      <a className="skip" href="#main" onClick={(e) => {
        // Focus <main> without rewriting the hash (the hash carries the selection).
        const el = document.getElementById('main'); if (!el) return;
        e.preventDefault(); if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1'); el.focus();
      }}>Skip to content</a>
      {m.synthetic && (
        <div className="demo-banner" role="note">
          <b className="warn-label"><Icon3D icon={FlaskConical} tone="red" size={14} />DEMO DATA</b><span>{mobile ? 'Synthetic fixture — not real observations.' : 'Synthetic fixture in the real bundle format — not real fire observations.'}</span>
          <button className="linkish" onClick={() => setDlg('about')}>Details</button>
        </div>
      )}
      <TopBar regions={core.regions} aoiId={sel.aoiId} onAoi={(id) => setSelection({ aoiId: id })} years={allYears} from={from} to={to} onRange={onRange}
        manifest={m} onAbout={() => setDlg('about')} onModels={() => setDlg('models')} onExplain={() => setDlg('explain')} compact={mobile}
        status={desktop ? <StatusLine createdUtc={m.created_utc} snapshotId={m.snapshot_id} offlineReady={pwa.offlineReady} /> : null} />
      {region?.note && <p className="region-note" role="note"><Icon3D icon={Info} tone="cyan" size={14} />{region.note}</p>}

      <main id="main" className={'main' + (mobile ? ' main--tab-' + tab : '')}>
        {mobile ? (
          <>
            <div className="tabpane" hidden={tab !== 'calendar'}>{calendarPanel}{chartPanel}</div>
            <div className="tabpane tabpane--map" hidden={tab !== 'map'}>{mapPanel}</div>
            <div className="tabpane" hidden={tab !== 'evidence'}>{evidence}</div>
          </>
        ) : desktop ? (
          <>
            <div className="col-left">{mapPanel}{chartPanel}</div>
            <div className="col-right">{calendarPanel}</div>
            <div className="col-evidence">{evidence}</div>
          </>
        ) : (
          <>{calendarPanel}{chartPanel}{mapPanel}{evidence}</>
        )}
      </main>

      {!desktop && <footer className="foot">
        <StatusLine createdUtc={m.created_utc} snapshotId={m.snapshot_id} offlineReady={pwa.offlineReady} />
        <span className="foot__credit">Team Lumos, Dhaka · NASA Space Apps 2026 · Data: NASA FIRMS, Natural Earth</span>
      </footer>}

      {mobile && (
        <nav className="tabbar" aria-label="Views">
          {(['calendar', 'map', 'evidence'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'is-on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
              <Icon3D icon={t === 'calendar' ? CalendarDays : t === 'map' ? MapIcon : FileText} tone={tab === t ? 'amber' : 'neutral'} size={21} className="tabbar__ico" />
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      )}

      <Dialog open={dlg === 'about'} onClose={() => setDlg(null)} title="About this data">
        <AboutData manifest={m} ageText={snapshotAge(m.created_utc)} />
      </Dialog>
      <Dialog open={dlg === 'models'} onClose={() => setDlg(null)} title="Models & evidence of skill" wide>
        <ModelPanel manifest={m} snapshotPath={core.snapshotPath} />
      </Dialog>
      <Dialog open={dlg === 'explain'} onClose={() => setDlg(null)} title="What is harmonization?">
        <Explainer />
      </Dialog>
      <PwaToast pwa={pwa} />
    </div>
  );
}

function SelectedSummary({ record, state: st, sel, onMore }: { record: ActivityRecord | null; state: CellState; sel: { year: number; month: number }; onMore: () => void }) {
  const hv = headlineValue(record);
  const flag = st === 'unavailable' || st === 'loading' ? null : shownAnomalyFlag(record, st);
  return (
    <div className="selsum">
      <div>
        <div className="selsum__when">{monthLabel(sel.year, sel.month)}</div>
        <div className="selsum__val">{st === 'missing' || st === 'unsupported' || st === 'unavailable' || st === 'loading' ? '—' : fmtNum(hv.value)}
          <span className="muted small"> {hv.kind === 'estimate' ? 'estimated' : hv.kind === 'viirs_observed' ? 'VIIRS observed' : ''}</span></div>
        <div className={'selsum__st st-' + st}><Glyph state={st} size={11} /> {STATE_LABEL[st]}{flag === 'high' && <span className="selsum__flag anom-h"><Icon3D icon={TrendingUp} tone="red" size={13} />high</span>}{flag === 'low' && <span className="selsum__flag anom-l"><Icon3D icon={TrendingDown} tone="cyan" size={13} />low</span>}</div>
      </div>
      <button className="btn btn--sm" onClick={onMore}>Evidence<Icon3D icon={ArrowRight} tone="current" size={14} /></button>
    </div>
  );
}
