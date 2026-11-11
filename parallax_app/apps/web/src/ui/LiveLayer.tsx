import type { LiveData, LiveRow, LiveStatus } from '../data/live';
import { LIVE_NOTE, fmtUtc } from '../data/live';
import { fmtNum } from '../data/format';
import { Info } from 'lucide-react';
import { Tip } from './Tip';

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

/** Compact live status line. 'feed unavailable', 'no detections' and 'not covered' stay distinct in the line itself;
 *  the longer caveat sits behind an info tip and is also in visually-hidden text for screen readers. */
export function LiveLegend({ status, data, covered, nModis, nViirs, regionName, retry }: LegendProps) {
  let body: React.ReactNode;
  if (!covered) body = <>Live feed covers Bangladesh, California and New South Wales only; nothing to show for {regionName || 'this area'}.</>;
  else if (status === 'loading' || status === 'idle') body = <>Loading live detections…</>;
  else if (status === 'unavailable') {
    body = (
      <><span className="live__warn">Live feed unavailable here (runs on the deployed site). Not the same as zero detections.</span>
        <button className="btn btn--sm live__retry" onClick={retry}>Retry</button></>
    );
  } else {
    const t = data ? fmtUtc(data.fetched_utc) : null;
    body = (
      <>
        <span className="live__key"><svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill={LIVE_COLORS.modis} stroke="currentColor" strokeWidth="1" /></svg>MODIS {nModis}</span>
        <span className="live__key"><svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11 6 6 11 1 6Z" fill={LIVE_COLORS.viirs} stroke="currentColor" strokeWidth="1" /></svg>VIIRS {data?.viirs_source ? `(${data.viirs_source}) ` : ''}{nViirs}</span>
        {nModis + nViirs === 0 ? <span>No detections in the last 24 h in this area (feed reachable).</span> : null}
        {t && <span className="muted">{t.utc} UTC</span>}
        <span className="muted">near-real-time · not confirmed wildfires</span>
      </>
    );
  }
  return (
    <div className="live__line" aria-label="Live detections, last 24 h" role="status">
      <b>Live · 24 h</b>
      {body}
      <Tip text={LIVE_NOTE}>
        <button type="button" className="live__info" aria-label="About live detections" aria-describedby="live-note"><Info size={13} aria-hidden="true" /></button>
      </Tip>
      <span id="live-note" className="live__sr">{LIVE_NOTE}</span>
    </div>
  );
}

export interface LiveTagData { x: number; y: number; kind: 'modis' | 'viirs'; date: string; time: string; frp: number | null }

/** Compact screen-space detection tag (one at a time): bracket corners + satellite + UTC time + FRP. */
export function LiveTag({ tag }: { tag: LiveTagData }) {
  const t = tag.time.padStart(4, '0');
  return (
    <div className="live__tag" style={{ left: tag.x, top: tag.y }} aria-hidden="true">
      <i className="live__tag-c live__tag-c--tl" /><i className="live__tag-c live__tag-c--tr" /><i className="live__tag-c live__tag-c--bl" /><i className="live__tag-c live__tag-c--br" />
      <b>{tag.kind === 'viirs' ? 'VIIRS' : 'MODIS'}</b> {tag.date} {t.slice(0, 2)}:{t.slice(2)} UTC · FRP {tag.frp == null ? '—' : fmtNum(tag.frp, 1) + ' MW'}
    </div>
  );
}
