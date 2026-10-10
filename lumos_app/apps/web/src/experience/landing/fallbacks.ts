// Canvas-2D stand-ins used when WebGL / the three module is unavailable. Same imperative handles as the
// contract so the scroll choreography drives them identically. Everything here is cheap and DPR-capped.
import type { GlobeHandle, HotPoint, PixelCompareHandle } from '../contract';
import { BASE_URL } from './data';

const D2R = Math.PI / 180;
const FOCUS = { lon: 90.35, lat: 23.7 };

let landPromise: Promise<number[][][] | null> | null = null;
function loadLand(): Promise<number[][][] | null> {
  if (!landPromise) {
    landPromise = fetch(`${BASE_URL.replace(/\/?$/, '/')}basemap/ne_110m_admin_0_countries.geojson`)
      .then((r) => (r.ok ? r.json() : null))
      .then((fc: GeoJSON.FeatureCollection | null) => {
        if (!fc) return null;
        const rings: number[][][] = [];
        for (const f of fc.features) {
          const g = f.geometry;
          if (!g) continue;
          if (g.type === 'Polygon') rings.push(...(g.coordinates as number[][][]));
          else if (g.type === 'MultiPolygon') for (const p of g.coordinates as number[][][][]) rings.push(...p);
        }
        return rings;
      })
      .catch(() => null);
  }
  return landPromise;
}

function setupCanvas(host: HTMLElement, cls: string) {
  const c = document.createElement('canvas');
  c.className = cls;
  c.setAttribute('aria-hidden', 'true');
  host.appendChild(c);
  const ctx = c.getContext('2d')!;
  let w = 0, h = 0, dpr = 1;
  const resize = () => {
    const r = host.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  return { c, ctx, resize, size: () => ({ w, h }) };
}

/** Orthographic canvas globe: land, graticule, hotspots; progress zooms to Bangladesh. */
export function mountFallbackGlobe(host: HTMLElement, opts: { reducedMotion: boolean; layout: () => { cx: number; cy: number; r: number } }): GlobeHandle {
  const { c, ctx, resize, size } = setupCanvas(host, 'lx-fallback-canvas');
  let land: number[][][] | null = null;
  let points: HotPoint[] = [];
  let progress = 0, series: 'aqua' | 'viirs' | 'est' | 'all' = 'all';
  let rot = 20; // current centre longitude while idle
  let raf = 0, last = performance.now(), disposed = false;
  loadLand().then((l) => { land = l; draw(); });

  function draw() {
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    const L = opts.layout();
    const e = progress * progress * (3 - 2 * progress);
    const lon0 = rot + (FOCUS.lon - rot) * Math.min(1, e * 1.6);
    const lat0 = 10 + (FOCUS.lat - 10) * Math.min(1, e * 1.6);
    const k = 1 + e * e * 9;
    const R = L.r * k;
    const cx = L.cx + (w / 2 - L.cx) * e, cy = L.cy + (h / 2 - L.cy) * e;
    const sp0 = Math.sin(lat0 * D2R), cp0 = Math.cos(lat0 * D2R);
    const proj = (lon: number, lat: number): [number, number, boolean] => {
      const l = (lon - lon0) * D2R, p = lat * D2R;
      const cosc = sp0 * Math.sin(p) + cp0 * Math.cos(p) * Math.cos(l);
      let x = Math.cos(p) * Math.sin(l), y = cp0 * Math.sin(p) - sp0 * Math.cos(p) * Math.cos(l);
      if (cosc < 0) { const n = Math.hypot(x, y) || 1; x /= n; y /= n; }
      return [cx + R * x, cy - R * y, cosc >= 0];
    };
    // atmosphere + ocean
    const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.25);
    glow.addColorStop(0, 'rgba(56,189,248,0.22)'); glow.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2); ctx.fill();
    const sea = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    sea.addColorStop(0, '#1B2C4F'); sea.addColorStop(1, '#0A1428');
    ctx.fillStyle = sea; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    // graticule
    ctx.strokeStyle = 'rgba(147,164,195,0.13)'; ctx.lineWidth = 1;
    for (let lon = -180; lon < 180; lon += 20) { ctx.beginPath(); let pen = false; for (let lat = -90; lat <= 90; lat += 5) { const [x, y, v] = proj(lon, lat); if (v) { pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; } else pen = false; } ctx.stroke(); }
    for (let lat = -60; lat <= 60; lat += 20) { ctx.beginPath(); let pen = false; for (let lon = -180; lon <= 180; lon += 5) { const [x, y, v] = proj(lon, lat); if (v) { pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; } else pen = false; } ctx.stroke(); }
    // land
    if (land) {
      ctx.fillStyle = '#1C2A47'; ctx.strokeStyle = 'rgba(147,164,195,0.35)'; ctx.lineWidth = 0.7;
      for (const ring of land) {
        let anyVis = false; ctx.beginPath();
        for (let i = 0; i < ring.length; i++) { const [x, y, v] = proj(ring[i][0], ring[i][1]); if (v) anyVis = true; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        if (anyVis) { ctx.closePath(); ctx.fill(); ctx.stroke(); }
      }
    }
    // hotspots
    const col = { aqua: '#00B4D8', viirs: '#F59E0B', est: '#14B8A6' } as const;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of points) {
      if (series !== 'all' && p.series !== series) continue;
      if (series === 'all' && p.series === 'est') continue;
      const [x, y, v] = proj(p.lon, p.lat);
      if (!v) continue;
      const rr = Math.max(1.2, Math.min(4.5, 1 + Math.sqrt(p.value) * 0.7)) * (0.7 + k * 0.12);
      ctx.fillStyle = p.series === 'viirs' ? 'rgba(245,158,11,0.75)' : col[p.series] + 'BB';
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    // rim light
    ctx.strokeStyle = 'rgba(125,211,252,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  }

  // Throttled idle spin (~30 fps). WATCHDOG 4: the rAF loop itself stops while off-screen or the tab is hidden
  // (not just the draw), and restarts from the IntersectionObserver / visibilitychange callbacks.
  let visible = true;
  const spinning = () => !disposed && !opts.reducedMotion && visible && !document.hidden && progress < 0.02;
  const loop = (t: number) => {
    raf = 0;
    if (!spinning()) return;
    const dt = t - last;
    if (dt >= 33) { last = t; rot = (rot + Math.min(dt, 100) * 0.004) % 360; draw(); }
    raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf && spinning()) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  const halt = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); if (visible) kick(); else halt(); }) : null;
  io?.observe(host);
  const onVis = () => { if (document.hidden) halt(); else kick(); };
  document.addEventListener('visibilitychange', onVis);
  if (opts.reducedMotion) rot = FOCUS.lon - 25;
  kick();
  draw();

  return {
    setPoints(p) { points = p; draw(); },
    setProgress(p) { progress = Math.max(0, Math.min(1, p)); draw(); kick(); },
    async focus() { /* fallback always focuses Bangladesh via progress */ },
    setSeries(s) { series = s; draw(); },
    resize() { resize(); draw(); },
    dispose() { disposed = true; halt(); io?.disconnect(); document.removeEventListener('visibilitychange', onVis); c.remove(); }
  };
}

/** Deterministic pseudo-random. */
function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** "Two cameras" in 2-D: a fire field sampled by a 1 km grid (MODIS), a 375 m grid (VIIRS), then the harmonized estimate. */
export function mountFallbackPixels(host: HTMLElement): PixelCompareHandle {
  const { c, ctx, resize, size } = setupCanvas(host, 'lx-fallback-canvas');
  const r = rng(7);
  // fire field: a few big burns + many small fires
  const fires: { x: number; y: number; s: number; a: number }[] = [];
  for (let i = 0; i < 5; i++) fires.push({ x: 0.15 + r() * 0.7, y: 0.15 + r() * 0.7, s: 0.05 + r() * 0.05, a: 1 });
  for (let i = 0; i < 46; i++) fires.push({ x: r(), y: r(), s: 0.008 + r() * 0.01, a: 0.9 });
  const field = (x: number, y: number) => { let v = 0; for (const f of fires) { const d2 = (x - f.x) ** 2 + (y - f.y) ** 2; v += f.a * Math.exp(-d2 / (2 * f.s * f.s)); } return v; };
  let p = 0;
  function grid(n: number, alpha: number, color: string, thr: number, sideOff: number, side: number) {
    const cell = side / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      // mean of field over the pixel (4x4 samples): small fires vanish inside big pixels
      let s = 0; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) s += field((i + (a + 0.5) / 4) / n, (j + (b + 0.5) / 4) / n);
      s /= 16;
      if (s > thr) { ctx.globalAlpha = alpha * Math.min(1, 0.45 + s); ctx.fillStyle = color; ctx.fillRect(sideOff + i * cell + 0.5, (size().h - side) / 2 + j * cell + 0.5, cell - 1, cell - 1); }
    }
    ctx.globalAlpha = alpha * 0.22; ctx.strokeStyle = color; ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(sideOff + i * cell, (size().h - side) / 2); ctx.lineTo(sideOff + i * cell, (size().h + side) / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sideOff, (size().h - side) / 2 + i * cell); ctx.lineTo(sideOff + side, (size().h - side) / 2 + i * cell); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function draw() {
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    const side = Math.min(w, h) * 0.86, off = (w - side) / 2, top = (h - side) / 2;
    // terrain
    ctx.fillStyle = '#0F1A30'; ctx.fillRect(off, top, side, side);
    // fires (ground truth), dimmer as the sensors take over
    for (const f of fires) {
      const g = ctx.createRadialGradient(off + f.x * side, top + f.y * side, 0, off + f.x * side, top + f.y * side, f.s * side * 2.2);
      g.addColorStop(0, 'rgba(255,214,120,0.95)'); g.addColorStop(0.4, 'rgba(245,120,20,0.6)'); g.addColorStop(1, 'rgba(245,80,11,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(off + f.x * side, top + f.y * side, f.s * side * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    const a1 = p < 0.45 ? 1 : Math.max(0, 1 - (p - 0.45) / 0.1);
    const a2 = p < 0.35 ? 0 : p < 0.45 ? (p - 0.35) / 0.1 : p < 0.72 ? 1 : Math.max(0, 1 - (p - 0.72) / 0.1);
    const a3 = p < 0.7 ? 0 : Math.min(1, (p - 0.7) / 0.1);
    if (a1 > 0) grid(12, a1, '#00B4D8', 0.32, off, side);
    if (a2 > 0) grid(32, a2, '#8B5CF6', 0.18, off, side);
    if (a3 > 0) grid(12, a3, '#14B8A6', 0.12, off, side);
  }
  draw();
  return {
    setProgress(v) { p = Math.max(0, Math.min(1, v)); draw(); },
    resize() { resize(); draw(); },
    dispose() { c.remove(); }
  };
}
