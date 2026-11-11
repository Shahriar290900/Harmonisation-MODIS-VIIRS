// Thin instrument-style frame: corner ticks, focus lat/lon, UTC clock, chapter label and scroll progress.
// Decorative (aria-hidden). All readouts update by direct DOM writes, never React re-renders.
import { useEffect, useRef } from 'react';
import { DEFAULT_FOCUS } from '../../data/regions';
import { sceneBus } from './motion';

const fmtLat = (v: number) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v: number) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'W'}`;

export function Hud({ focus = DEFAULT_FOCUS }: { focus?: { lon: number; lat: number } }) {
  const clock = useRef<HTMLSpanElement>(null);
  const pct = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLElement>(null);
  const chap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const tick = () => { if (clock.current) clock.current.textContent = new Date().toISOString().slice(11, 19); };
    tick();
    const id = setInterval(tick, 1000);
    let raf = 0;
    const upd = () => {
      raf = 0;
      const se = document.scrollingElement ?? document.documentElement;
      const max = Math.max(1, se.scrollHeight - window.innerHeight);
      const p = Math.max(0, Math.min(1, window.scrollY / max));
      if (pct.current) pct.current.textContent = String(Math.round(p * 100)).padStart(3, '0') + '%';
      if (bar.current) bar.current.style.transform = `scaleY(${p})`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(upd); };
    upd();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    const setLabel = (s: { label: string }) => { if (chap.current) chap.current.textContent = s.label; };
    setLabel(sceneBus.get());
    const un = sceneBus.subscribe(setLabel);
    return () => { clearInterval(id); if (raf) cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); un(); };
  }, []);

  return (
    <div className="lx-hud" aria-hidden="true">
      <i className="lx-hud__tick lx-hud__tick--tl" /><i className="lx-hud__tick lx-hud__tick--tr" />
      <i className="lx-hud__tick lx-hud__tick--bl" /><i className="lx-hud__tick lx-hud__tick--br" />
      <div className="lx-hud__rail"><i ref={bar} /></div>
      <div className="lx-hud__read lx-hud__read--l">
        <span className="lx-hud__chap" ref={chap}>Overview</span>
        <span>FOCUS {fmtLat(focus.lat)} {fmtLon(focus.lon)}</span>
      </div>
      <div className="lx-hud__read lx-hud__read--r">
        <span>UTC <span ref={clock}>00:00:00</span></span>
        <span>SCROLL <span ref={pct}>000%</span></span>
      </div>
    </div>
  );
}
