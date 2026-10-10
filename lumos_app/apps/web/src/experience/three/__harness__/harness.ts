import { detectQuality, loadHotPoints, mountGlobe, mountPixelCompare, mountTransition } from '../index';
import { gsap } from 'gsap';
import type { GlobeHandle, PixelCompareHandle } from '../../contract';

const qs = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $('stage');
const sceneSel = $<HTMLSelectElement>('scene');
const qSel = $<HTMLSelectElement>('q');
const pIn = $<HTMLInputElement>('p');
const seriesSel = $<HTMLSelectElement>('series');
const fpsEl = $('fps');
if (qs.has('shot')) document.body.classList.add('shot');

const scene = (qs.get('scene') ?? 'globe') as 'globe' | 'pixel' | 'transition';
const quality = (qs.get('q') as 'high' | 'low' | null) ?? detectQuality();
const reducedMotion = qs.get('rm') === '1';
const p0 = Number(qs.get('p') ?? 0);
sceneSel.value = scene; qSel.value = quality; pIn.value = String(p0);

const nav = () => {
  const u = new URLSearchParams({ scene: sceneSel.value, q: qSel.value, p: pIn.value });
  location.search = u.toString();
};
sceneSel.onchange = nav; qSel.onchange = nav;

// fps counter (rAF based)
const fps = { value: 0, frames: 0, samples: [] as number[] };
let tLast = performance.now();
const count = (now: number) => {
  fps.frames++;
  if (now - tLast >= 1000) {
    fps.value = (fps.frames * 1000) / (now - tLast);
    fps.samples.push(fps.value);
    fps.frames = 0; tLast = now;
    fpsEl.textContent = `${fps.value.toFixed(0)} fps`;
  }
  requestAnimationFrame(count);
};
requestAnimationFrame(count);

let globe: GlobeHandle | null = null;
let pixel: PixelCompareHandle | null = null;
const errors: string[] = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));

async function start() {
  if (scene === 'globe' || scene === 'transition') {
    globe = mountGlobe(stage, { reducedMotion, quality, basemapUrl: '/basemap/ne_110m_admin_0_countries.geojson' } as Parameters<typeof mountGlobe>[1]);
    if (!globe) { stage.textContent = 'WebGL unavailable'; return; }
    const idx = await (await fetch('/data/index.json')).json();
    const snap = idx.default as string;
    const pts = await loadHotPoints('/', snap, ['BGD', 'AUS-NSW'], Number(qs.get('year') ?? 2020));
    globe.setPoints(pts);
    globe.setProgress(p0);
    globe.setSeries(seriesSel.value as 'all');
    (window as unknown as Record<string, unknown>).__points = pts.length;
  } else {
    pixel = mountPixelCompare(stage, { reducedMotion, quality });
    if (!pixel) { stage.textContent = 'WebGL unavailable'; return; }
    pixel.setProgress(p0);
  }
}
pIn.oninput = () => { const p = Number(pIn.value); globe?.setProgress(p); pixel?.setProgress(p); };
seriesSel.onchange = () => globe?.setSeries(seriesSel.value as 'all');

const tr = mountTransition(document.body, { reducedMotion });
const playAt = async (x: number, y: number) => { await tr.play(x, y); await new Promise((r) => setTimeout(r, 250)); await tr.reveal(); };
$('play').onclick = (e) => void playAt((e as MouseEvent).clientX, (e as MouseEvent).clientY);

(window as unknown as Record<string, unknown>).__h = {
  fps, errors, tr, playAt, gsap,
  /** freeze running tweens at a given progress (for screenshots) */
  freeze: (p: number) => { for (const t of gsap.globalTimeline.getChildren(true, true, false)) { t.progress(p); t.pause(); } },
  setProgress: (p: number) => { globe?.setProgress(p); pixel?.setProgress(p); },
  focus: (lon: number, lat: number) => globe?.focus(lon, lat),
  dispose: () => { globe?.dispose(); pixel?.dispose(); tr.dispose(); globe = null; pixel = null; }
};
start().then(() => { (window as unknown as Record<string, unknown>).__ready = true; });
