// Type-heavy index: every area × year × month as plain links (Craigslist spirit: dense, text-first, fast).
// Keyboard: Tab moves between areas/years; ←/→ walks the months of a year; ↑/↓ moves between years.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MONTHS_LONG, MONTHS_SHORT, fmtCompact, fmtNum } from '../../data/format';
import { STATE_LABEL } from '../../ui/glyphs';
import { Glyph } from '../../ui/Glyph';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, type LucideIcon } from 'lucide-react';
import { GradIcon } from '../../ui/icons/Icon3D';

/** Keycap with a lucide arrow (named for screen readers). */
function Key({ icon, name }: { icon: LucideIcon; name: string }) {
  return <kbd aria-label={name}><GradIcon icon={icon} tone="neutral" size={11} strokeWidth={2.6} /></kbd>;
}
import { valueColor } from '../../ui/scale';
import type { Region } from '../../types';
import { displayKindLower } from '../../data/regions';
import { useNear, useSeries, workspaceHash, type AoiSeries } from './data';
import { onWorkspaceLink } from './transition';
import { Reveal } from './motion';
import type { Ctx } from './Landing';

const KIND_LABEL = (r: Region) => displayKindLower(r);

export function IndexList({ ctx }: { ctx: Ctx }) {
  const { core, flags } = ctx;
  const ref = useRef<HTMLElement>(null);
  const near = useNear(ref, '1400px');
  const regions = core?.regions ?? [];
  const ids = useMemo(() => regions.map((r) => r.aoi_id), [regions]);
  const series = useSeries(core, ids, near);
  const years = core?.manifest.years ?? [];
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);

  const show = useCallback((el: HTMLElement) => {
    const t = el.dataset.tip;
    if (!t) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 120;
    setTip({ text: t, x: Math.min(window.innerWidth - 130, Math.max(130, r.left + r.width / 2)), y: below ? r.bottom + 8 : r.top - 8, below });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  // The tooltip is position:fixed; hide it on scroll instead of leaving it stranded over other content.
  const tipOn = !!tip;
  useEffect(() => {
    if (!tipOn) return;
    window.addEventListener('scroll', hide, { passive: true });
    return () => window.removeEventListener('scroll', hide);
  }, [tipOn, hide]);

  const onKey = (e: React.KeyboardEvent) => {
    const a = e.target as HTMLElement;
    if (!a.matches('.lx-ix a')) return;
    const row = a.closest('.lx-ix__row');
    if (!row) return;
    const items = [...row.querySelectorAll<HTMLAnchorElement>('a')];
    const i = items.indexOf(a as HTMLAnchorElement);
    let target: HTMLElement | null = null;
    if (e.key === 'ArrowRight') target = items[Math.min(items.length - 1, i + 1)];
    else if (e.key === 'ArrowLeft') target = items[Math.max(0, i - 1)];
    else if (e.key === 'Home') target = items[0];
    else if (e.key === 'End') target = items[items.length - 1];
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const sib = (e.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling) as HTMLElement | null;
      target = sib?.querySelectorAll<HTMLAnchorElement>('a')[i] ?? null;
    }
    if (target) { e.preventDefault(); target.focus(); }
  };

  return (
    <section id="index" ref={ref} className="lx-ix" aria-labelledby="lx-ix-h" onKeyDown={onKey}
      onPointerOver={(e) => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]'); if (el) show(el); }}
      onPointerOut={(e) => { if ((e.target as HTMLElement).closest('[data-tip]')) hide(); }}
      onFocus={(e) => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]'); if (el) show(el); else hide(); }}
      onBlur={hide}>
      <Reveal reduced={flags.reduced} className="lx-ix__head">
        <p className="lx-eyebrow">The index</p>
        <h2 id="lx-ix-h" className="lx-h2">Every area × year. <span className="lx-grad">Every month, one click.</span></h2>
        <p className="lx-ix__lede">Dense on purpose. Numbers are VIIRS-scale hotspots per month (observed, or estimated from MODIS). Each link opens the calendar at that month. <kbd>Tab</kbd> moves between years, <Key icon={ArrowLeft} name="Left arrow" /><Key icon={ArrowRight} name="Right arrow" /> walks the months, <Key icon={ArrowUp} name="Up arrow" /><Key icon={ArrowDown} name="Down arrow" /> changes year.</p>
      </Reveal>
      <div className="lx-ix__cols">
        {regions.map((r) => <Aoi key={r.aoi_id} region={r} s={series.get(r.aoi_id) ?? null} years={years} />)}
      </div>
      {tip && (
        <div className={'lx-tip' + (tip.below ? ' is-below' : '')} style={{ left: tip.x, top: tip.y }} aria-hidden="true">
          {tip.text.split('\n').map((l, i) => <span key={i} className={i === 0 ? 'lx-tip__h' : ''}>{l}</span>)}
        </div>
      )}
    </section>
  );
}

// Memoised: hovering re-renders IndexList for the tooltip; the ~3,000 month links must not re-render with it.
const Aoi = memo(function Aoi({ region, s, years }: { region: Region; s: AoiSeries | null; years: number[] }) {
  const peak = s?.peakMonth ?? 3;
  const head = workspaceHash(region.aoi_id, s?.bestYear ?? years.at(-1) ?? 2016, s?.openMonth ?? peak);
  const name = region.name;
  return (
    <section className="lx-ix__aoi" aria-label={`${name} (${region.aoi_id})`}>
      <h3 className="lx-ix__name">
        <a href={head} onClick={(e) => onWorkspaceLink(e, head, `Opening the fire calendar for ${name}`)}>{name}</a>
        <span>{region.aoi_id} · {KIND_LABEL(region)}{s ? ` · usual peak ${MONTHS_SHORT[peak - 1]}` : ''}</span>
      </h3>
      <div className="lx-ix__mh" aria-hidden="true"><span>year</span>{MONTHS_SHORT.map((m) => <span key={m}>{m[0]}</span>)}</div>
      <ol className="lx-ix__rows">
        {years.map((y) => {
          const row = s?.rows.find((r) => r.year === y);
          // REVIEW M4: each year's own peak month (argmax of that year), falling back to the usual peak.
          const yPeak = s?.peakByYear[y] ?? peak;
          const yHash = workspaceHash(region.aoi_id, y, yPeak);
          const yTip = row ? `${name} · ${y}\nmean ${fmtNum(row.mean)} hotspots / month\n${s?.peakByYear[y] != null ? `peak month ${MONTHS_LONG[yPeak - 1]}` : 'no observed/estimated month'}` : `${name} · ${y}`;
          return (
            <li key={y} className="lx-ix__row">
              <a className="lx-ix__y" href={yHash} data-tip={yTip} onClick={(e) => onWorkspaceLink(e, yHash, `Opening ${name}, ${MONTHS_LONG[yPeak - 1]} ${y}`)}
                aria-label={`${name} ${y}${row?.mean != null ? `, mean ${fmtNum(row.mean)} hotspots per month` : ''}`}>{y}</a>
              {MONTHS_SHORT.map((mn, i) => {
                const c = row?.months[i];
                const ok = c && c.value != null && c.state !== 'missing' && c.state !== 'unsupported';
                const h = workspaceHash(region.aoi_id, y, i + 1);
                const st = c ? STATE_LABEL[c.state] : 'Loading';
                const val = ok ? fmtNum(c!.value) : '—';
                const col = ok && s ? valueColor(c!.value, s.max) : null;
                return (
                  <a key={mn} tabIndex={-1} href={h} className={'lx-ix__m' + (c ? ' st-' + c.state : ' is-loading')}
                    style={col ? { ['--c' as string]: col } : undefined}
                    data-tip={`${name} · ${MONTHS_LONG[i]} ${y}\n${val}${ok ? (c!.kind === 'estimate' ? ' estimated' : ' VIIRS observed') : ''}\n${st}${c?.flag === 'high' ? ' · high for its season' : ''}`}
                    aria-label={`${MONTHS_LONG[i]} ${y}: ${val}, ${st}`}
                    onClick={(e) => onWorkspaceLink(e, h, `Opening ${name}, ${MONTHS_LONG[i]} ${y}`)}>
                    {c ? (ok ? fmtCompact(c.value) : c.state === 'unsupported' ? <Glyph state="unsupported" size={10} className="lx-ix__g" /> : '·') : ''}
                  </a>
                );
              })}
            </li>
          );
        })}
      </ol>
    </section>
  );
});
