// Region gallery: pinned horizontal travel on desktop/tablet (native scroll-snap on phones / reduced motion).
// Each card: silhouette, live sparkline, peak month, data status. Click → transition → workspace at that AOI.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MONTHS_LONG, MONTHS_SHORT } from '../../data/format';
import type { Region } from '../../types';
import { displayKind, kindPlural, type DisplayKind } from '../../data/regions';
import { api, countWord, useNear, useSeries, workspaceHash, type AoiSeries, type Core } from './data';
import { gsap, ScrollTrigger } from './motion';
import { onWorkspaceLink } from './transition';
import { Glyph } from '../../ui/Glyph';
import { ArrowRight, FlaskConical, Grid3x3, Info } from 'lucide-react';
import { Icon3D } from '../../ui/icons/Icon3D';
import type { Ctx } from './Landing';

export function Gallery({ ctx }: { ctx: Ctx }) {
  const { core, flags } = ctx;
  const ref = useRef<HTMLElement>(null);
  const track = useRef<HTMLElement>(null);
  const near = useNear(ref, '1200px');
  const regions = core?.regions ?? [];
  const ids = useMemo(() => regions.map((r) => r.aoi_id), [regions]);
  const series = useSeries(core, ids, near);
  const pinned = !flags.reduced && !flags.mobile;
  const areasWord = regions.length ? `${countWord(regions.length)[0].toUpperCase()}${countWord(regions.length).slice(1)} areas` : 'Every area';

  useLayoutEffect(() => {
    const sec = ref.current!, tr = track.current!;
    if (!pinned || !regions.length) { sec.style.height = ''; return; }
    const dist = () => Math.max(0, tr.scrollWidth - tr.parentElement!.clientWidth);
    const size = () => { sec.style.height = `${window.innerHeight + dist()}px`; };
    size();
    const c = gsap.context(() => {
      gsap.to(tr, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom bottom', scrub: 0.6, invalidateOnRefresh: true, onRefreshInit: size }
      });
      gsap.fromTo('.lx-gal__bar i', { scaleX: 0 }, { scaleX: 1, ease: 'none', transformOrigin: '0 50%', scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom bottom', scrub: true } });
    }, sec);
    ScrollTrigger.refresh();
    return () => { c.revert(); sec.style.height = ''; };
  }, [pinned, regions.length]);

  // Keyboard focus inside the pinned track: scroll the page so the focused card is in view.
  const onFocus = (e: React.FocusEvent) => {
    if (!pinned) return;
    const card = (e.target as HTMLElement).closest('.lx-card__li') as HTMLElement | null;
    const sec = ref.current, tr = track.current;
    if (!card || !sec || !tr) return;
    const dist = Math.max(1, tr.scrollWidth - tr.parentElement!.clientWidth);
    const want = Math.max(0, Math.min(dist, card.offsetLeft - 40));
    const top = sec.getBoundingClientRect().top + window.scrollY + want;
    window.scrollTo({ top, behavior: 'auto' });
  };

  return (
    <section id="regions" ref={ref} className={'lx-gal' + (pinned ? ' is-pinned' : ' is-native')} aria-labelledby="lx-gal-h">
      <div className="lx-gal__sticky">
        <div className="lx-gal__head">
          <div>
            <p className="lx-eyebrow">{areasWord}, one fair scale</p>
            <h2 id="lx-gal-h" className="lx-h2">Pick a place. <span className="lx-grad">Open its calendar.</span></h2>
          </div>
          <p className="lx-gal__hint">{pinned ? 'Scroll to travel' : 'Swipe'} <Icon3D icon={ArrowRight} tone="amber" size={14} /> <span>{areaSummary(regions)}</span></p>
        </div>
        <div className="lx-gal__viewport" onFocus={onFocus}>
          <ul ref={track as React.RefObject<HTMLUListElement>} className="lx-gal__track">
            {regions.map((r, i) => <Card key={r.aoi_id} core={core!} region={r} s={series.get(r.aoi_id) ?? null} i={i} />)}
            {!regions.length && Array.from({ length: 4 }, (_, i) => <li key={i} className="lx-card lx-card--ghost" />)}
          </ul>
        </div>
        {pinned && <div className="lx-gal__bar" aria-hidden="true"><i /></div>}
      </div>
    </section>
  );
}

/** "Bangladesh, its 7 divisions, Australia and New South Wales, United States and California." — derived from the regions list (REVIEW L5). */
function areaSummary(regions: Region[]): string {
  if (!regions.length) return '';
  const parts: string[] = [];
  const countries = regions.filter((r) => r.kind === 'country');
  for (const c of countries) {
    const subs = regions.filter((r) => r.kind !== 'country' && r.country === c.country);
    if (subs.length === 0) parts.push(c.name);
    else if (subs.length === 1) parts.push(`${c.name} and ${subs[0].name}`);
    else {
      const kinds = new Set<DisplayKind>(subs.map((r) => displayKind(r)));
      const plural = kinds.size === 1 ? kindPlural([...kinds][0]) : 'areas';
      parts.push(`${c.name}, its ${subs.length} ${plural}`);
    }
  }
  const orphans = regions.filter((r) => r.kind !== 'country' && !countries.some((c) => c.country === r.country));
  for (const o of orphans) parts.push(o.name);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, ${parts.at(-1)}.` : `${parts[0]}.`;
}

function useSilhouette(core: Core, region: Region): string | null {
  const [d, setD] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.loadGeo(core.snapshotId, region).then((g) => {
      if (!live) return;
      const rings: number[][][] = [];
      const feats = 'features' in g ? g.features : [g];
      for (const f of feats) {
        const geo = f.geometry;
        if (geo?.type === 'Polygon') rings.push(...(geo.coordinates as number[][][]));
        else if (geo?.type === 'MultiPolygon') for (const p of geo.coordinates as number[][][][]) rings.push(...p);
      }
      const [x0, y0, x1, y1] = region.bbox;
      const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
      const sx = (x1 - x0) * k, sy = y1 - y0, s = 100 / Math.max(sx, sy);
      const ox = (100 - sx * s) / 2, oy = (100 - sy * s) / 2;
      setD(rings.map((ring) => 'M' + ring.map(([x, y]) => `${(ox + (x - x0) * k * s).toFixed(1)},${(oy + (y1 - y) * s).toFixed(1)}`).join('L') + 'Z').join(''));
    }, () => undefined);
    return () => { live = false; };
  }, [core.snapshotId, region]);
  return d;
}

function Card({ core, region, s, i }: { core: Core; region: Region; s: AoiSeries | null; i: number }) {
  const sil = useSilhouette(core, region);
  const kind = displayKind(region);
  // REVIEW M4: open at that year's own peak month; "usual peak" is the all-year mean month and is labelled as such.
  const hash = s ? workspaceHash(region.aoi_id, s.bestYear, s.openMonth) : workspaceHash(region.aoi_id, 2016, 3);
  const label = `Opening the fire calendar for ${region.name}`;
  const spark = useMemo(() => sparkPaths(s), [s]);
  const syn = core.manifest.synthetic;
  return (
    <li className="lx-card__li"><a className={'lx-card' + (region.kind === 'country' ? ' lx-card--country' : '')} href={hash} onClick={(e) => onWorkspaceLink(e, hash, label)}
      aria-label={cardLabel(region.name, kind, s, !!syn)}>
      <div className="lx-card__top">
        <span className="lx-card__kind">{String(i + 1).padStart(2, '0')} · {kind}</span>
        <span className="lx-card__id">{region.aoi_id}</span>
      </div>
      <svg className="lx-card__sil" viewBox="0 0 100 100" aria-hidden="true">{sil && <path d={sil} />}</svg>
      <h3 className="lx-card__name">{region.name}</h3>
      <p className="lx-card__country">{region.kind === 'country' ? 'Whole country' : region.country}{region.note ? <> · <Icon3D icon={Info} tone="cyan" size={13} /> boundary note</> : ''}</p>
      <svg className="lx-card__spark" viewBox="0 0 200 48" preserveAspectRatio="none" aria-hidden="true">
        {spark ? (
          <>
            <path d={spark.area} className="lx-spark__area" />
            <path d={spark.est} className="lx-spark__est" />
            <path d={spark.obs} className="lx-spark__obs" />
            <line x1={spark.x2012} x2={spark.x2012} y1="0" y2="48" className="lx-spark__2012" />
          </>
        ) : <rect x="0" y="22" width="200" height="4" rx="2" className="lx-spark__ghost" />}
      </svg>
      <dl className="lx-card__facts">
        <div><dt>Usual peak</dt><dd>{s ? MONTHS_LONG[s.peakMonth - 1] : '…'}</dd></div>
        <div><dt>Opens at</dt><dd>{s ? `${MONTHS_SHORT[s.openMonth - 1]} ${s.bestYear}` : '…'}</dd></div>
      </dl>
      <p className="lx-card__status">
        {s?.estimatedYears && <span className="lx-tag lx-tag--est"><Glyph state="estimated" size={11} /> est. {s.estimatedYears[0]}–{s.estimatedYears[1]}</span>}
        {s?.observedYears && <span className="lx-tag lx-tag--obs"><Glyph state="observed" size={11} /> obs. {s.observedYears[0]}–{s.observedYears[1]}</span>}
        {region.cells_exported && <span className="lx-tag lx-tag--cells"><Icon3D icon={Grid3x3} tone="amber" size={12} />5 km cells</span>}
        {syn && <span className="lx-tag lx-card__demo"><Icon3D icon={FlaskConical} tone="red" size={12} />demo</span>}
      </p>
      <span className="lx-card__cta">Open calendar <span className="lx-btn__arrow"><Icon3D icon={ArrowRight} tone="amber" size={16} /></span></span>
    </a></li>
  );
}

/** Card accessible name: replaces the card content, so it repeats the status tags and the DEMO tag (REVIEW L7). */
function cardLabel(name: string, kind: string, s: AoiSeries | null, demo: boolean): string {
  const parts = [`${name} — ${kind}.`];
  if (s) {
    const span = s.peakSpan ? ` (mean of ${s.peakSpan[0]}–${s.peakSpan[1]})` : '';
    parts.push(`Usual peak month ${MONTHS_LONG[s.peakMonth - 1]}${span}.`);
    parts.push(`Opens ${MONTHS_LONG[s.openMonth - 1]} ${s.bestYear}${s.openMonth === s.peakMonth ? '' : ', that year’s peak'}.`);
    if (s.estimatedYears) parts.push(`Estimated ${s.estimatedYears[0]}–${s.estimatedYears[1]}.`);
    if (s.observedYears) parts.push(`Observed ${s.observedYears[0]}–${s.observedYears[1]}.`);
  } else parts.push('Loading.');
  if (demo) parts.push('DEMO data, synthetic.');
  return parts.join(' ');
}

/** Annual mean sparkline: estimate (teal, MODIS era) and VIIRS-observed (violet) on a shared y. */
function sparkPaths(s: AoiSeries | null) {
  if (!s) return null;
  const rows = s.rows.filter((r) => r.year >= 2003);
  if (rows.length < 2) return null;
  const pts = rows.map((r) => {
    const ok = r.months.filter((m) => m.value != null && (m.state === 'observed' || m.state === 'estimated' || m.state === 'partial'));
    const obs = ok.filter((m) => m.kind === 'viirs_observed');
    return { year: r.year, v: ok.length ? ok.reduce((a, m) => a + m.value!, 0) / ok.length : null, obsShare: ok.length ? obs.length / ok.length : 0 };
  });
  const max = Math.max(1, ...pts.map((p) => p.v ?? 0));
  const X = (i: number) => (i / (pts.length - 1)) * 200, Y = (v: number) => 44 - (v / max) * 38;
  let est = '', obs = '', area = '';
  pts.forEach((p, i) => {
    if (p.v == null) return;
    const xy = `${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`;
    area += (area ? 'L' : 'M') + xy;
    if (p.obsShare < 0.5 || (pts[i + 1] && pts[i + 1].obsShare >= 0.5 && p.obsShare < 0.5)) est += (est ? 'L' : 'M') + xy;
    if (p.obsShare >= 0.5) { if (!obs && i > 0 && pts[i - 1].v != null) obs = `M${X(i - 1).toFixed(1)},${Y(pts[i - 1].v!).toFixed(1)}`; obs += (obs ? 'L' : 'M') + xy; }
  });
  area += `L200,48L0,48Z`;
  const i12 = pts.findIndex((p) => p.year === 2012);
  return { est, obs, area, x2012: i12 >= 0 ? X(i12) : -10 };
}
