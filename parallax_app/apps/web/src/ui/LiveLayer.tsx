import type { LiveData, LiveRow, LiveStatus } from '../data/live';
import { LIVE_NOTE, fmtUtc } from '../data/live';
import { fmtNum } from '../data/format';

/** Map colours for the two instruments (data colours, same in both themes; shapes differ too: MODIS = larger circle, VIIRS = smaller diamond). */
export const LIVE_COLORS = { modis: '#F97316', viirs: '#D946EF' } as const;
export const LIVE_ICON = { modis: 'live-modis-img', viirs: 'live-viirs-img' } as const;

/** Canvas-drawn marker images (circle for MODIS 1 km, diamond for VIIRS 375 m). Returns null outside a browser. */
export function makeLiveImages(): { modis: ImageData; viirs: ImageData } | null {
  const mk = (size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const c = cv.getContext('2d'); if (!c) return null;
    draw(c, size); return c.getImageData(0, 0, size, size);
  };
  const modis = mk(28, (c, s) => {
    c.beginPath(); c.arc(s / 2, s / 2, s / 2 - 3, 0, Math.PI * 2);
    c.fillStyle = LIVE_COLORS.modis; c.fill(); c.lineWidth = 3; c.strokeStyle = '#FFFFFF'; c.stroke();
    c.beginPath(); c.arc(s / 2, s / 2, s / 2 - 3, 0, Math.PI * 2); c.lineWidth = 1; c.strokeStyle = '#111827'; c.stroke();
  });
  const viirs = mk(22, (c, s) => {
    const m = s / 2, r = s / 2 - 3;
    c.beginPath(); c.moveTo(m, m - r); c.lineTo(m + r, m); c.lineTo(m, m + r); c.lineTo(m - r, m); c.closePath();
    c.fillStyle = LIVE_COLORS.viirs; c.fill(); c.lineWidth = 3; c.strokeStyle = '#FFFFFF'; c.lineJoin = 'round'; c.stroke();
    c.lineWidth = 1; c.strokeStyle = '#111827'; c.stroke();
  });
  return modis && viirs ? { modis, viirs } : null;
}

export function liveFeatures(rows: LiveRow[], kind: 'modis' | 'viirs'): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [r[0], r[1]] },
      properties: { kind, date: r[2], time: r[3], frp: r[4], conf: r[5] == null ? '' : String(r[5]), dn: r[6] }
    }))
  };
}

export function livePopup(p: Record<string, unknown>): HTMLElement {
  const root = document.createElement('div');
  const t = document.createElement('b');
  t.textContent = p.kind === 'viirs' ? 'VIIRS detection (live)' : 'MODIS detection (live)';
  const l1 = document.createElement('div');
  const time = String(p.time ?? '').padStart(4, '0');
  l1.textContent = `${String(p.date ?? '')} ${time.slice(0, 2)}:${time.slice(2)} UTC · ${p.dn === 'D' ? 'day' : p.dn === 'N' ? 'night' : ''}`;
  const l2 = document.createElement('div');
  l2.textContent = `FRP ${p.frp == null || p.frp === '' ? '—' : fmtNum(Number(p.frp), 1) + ' MW'} · confidence ${String(p.conf || '—')}`;
  const l3 = document.createElement('div'); l3.className = 'muted';
  l3.textContent = 'Near-real-time; not a confirmed wildfire.';
  root.append(t, l1, l2, l3);
  return root;
}

interface LegendProps {
  status: LiveStatus; data: LiveData | null; covered: boolean; nModis: number; nViirs: number; regionName: string; retry: () => void;
}

/** Live legend + honest messages: 'feed unavailable' is never conflated with 'no detections'. */
export function LiveLegend({ status, data, covered, nModis, nViirs, regionName, retry }: LegendProps) {
  let body: React.ReactNode;
  if (!covered) body = <div className="live__msg">The live feed covers Bangladesh, California and New South Wales only; nothing to show for {regionName || 'this area'}.</div>;
  else if (status === 'loading' || status === 'idle') body = <div className="live__msg" role="status">Loading live detections…</div>;
  else if (status === 'unavailable') {
    body = (
      <div className="live__msg live__msg--warn" role="status">
        Live feed unavailable (it runs only on the deployed site and needs a network connection). This is not the same as zero detections.
        <button className="btn btn--sm live__retry" onClick={retry}>Retry</button>
      </div>
    );
  } else {
    const t = data ? fmtUtc(data.fetched_utc) : null;
    body = (
      <>
        <div className="live__keys">
          <span className="live__key"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill={LIVE_COLORS.modis} stroke="currentColor" strokeWidth="1" /></svg>MODIS {nModis}</span>
          <span className="live__key"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11 6 6 11 1 6Z" fill={LIVE_COLORS.viirs} stroke="currentColor" strokeWidth="1" /></svg>VIIRS {data?.viirs_source ? `(${data.viirs_source}) ` : ''}{nViirs}</span>
        </div>
        {nModis + nViirs === 0 && <div className="live__msg">No detections in the last 24 h in this area (feed reachable, nothing detected).</div>}
        {t && <div className="live__time">Fetched {t.utc}{t.local ? ` · ${t.local} local` : ''}</div>}
      </>
    );
  }
  return (
    <div className="map__legend live__legend" aria-label="Live detections legend">
      <div className="map__legend-title">Live · last 24 h</div>
      {body}
      <div className="live__note">{LIVE_NOTE}</div>
    </div>
  );
}
