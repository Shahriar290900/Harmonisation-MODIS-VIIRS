// Records the README GIFs from the LIVE site, frame by frame (the same technique as captureStepped in
// scripts/video/make_video.mjs): the page clock is paused and stepped 1/15 s per frame, CSS animations are slowed
// to match, and each screenshot is piped to ffmpeg, which builds a palette GIF. Smooth on any machine.
// Usage (from parallax_app/):  FFMPEG=/path/to/ffmpeg node scripts/readme/make_gifs.mjs <out dir> [--only=calendar,story]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
if (!OUT) { console.error('out dir required'); process.exit(2); }
const ONLY = ((process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '').split(',').filter(Boolean);
const FF = process.env.FFMPEG || 'ffmpeg';
const BASE = process.env.VIDEO_BASE || 'https://parallaxfire.netlify.app/';
const FPS = 15, W = 1280, H = 720, GIF_W = 800;
fs.mkdirSync(OUT, { recursive: true });

const q = (extra = '') => `?aoi=BGD&y=2024&m=3&notour=1${extra}`;
const CSS = '#nl-badge-frame{display:none!important} html{scrollbar-width:none} ::-webkit-scrollbar{display:none}';
const earthReady = (p) => p.waitForFunction(() => window.__earth?.debug?.().ready && window.__earth.debug().hotspots > 1000, null, { timeout: 60000 }).catch(() => {});
const tryClick = async (p, sel, wait = 1200) => { try { await p.click(sel, { timeout: 2500 }); await p.waitForTimeout(wait); } catch { /* control not present */ } };
const clickText = (p, sel, text) => p.locator(sel, { hasText: text }).first().evaluate((el) => el.click()).catch(() => {});

const CLIPS = [
  { name: 'live-earth', start: '#/live' + q(), seconds: 5,
    prep: async (p) => { await earthReady(p); await tryClick(p, 'button:has-text("Bangladesh")', 3500); },
    shot: async () => [{ at: 0.4, fn: (p) => clickText(p, 'button', 'Whole Earth') }] },
  { name: 'one-scale', start: '#/sensors' + q(), seconds: 4.5,
    prep: async (p) => { await p.waitForTimeout(2500); await p.evaluate(() => document.querySelector('[data-chart="compare"]')?.scrollIntoView({ block: 'center' })); await p.waitForTimeout(800); },
    shot: async () => [{ at: 1.4, fn: (p) => clickText(p, 'button', 'On one scale') }] },
  { name: 'district-map', start: '#/map' + q(), seconds: 4, width: 640, colors: 96,   // detailed and moving every frame: smaller to stay under ~3 MB
    prep: async (p) => {
      await p.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 60000 });
      await tryClick(p, 'button:has-text("Districts")', 2500);
      await p.evaluate(() => document.querySelector('.maplibregl-canvas')?.scrollIntoView({ block: 'center' }));
      const A = { center: [90.3, 23.75], zoom: 5.95, pitch: 0, bearing: 0 }, B = { center: [90.45, 23.95], zoom: 6.85, pitch: 50, bearing: -16 };
      for (const v of [B, A]) {   // visit the end view first so its tiles are cached
        await p.evaluate((v) => window.__map.jumpTo(v), v);
        await p.waitForFunction(() => window.__map.loaded() && window.__map.areTilesLoaded(), null, { timeout: 20000 }).catch(() => {});
        await p.waitForTimeout(900);
      }
      return B;
    },
    shot: async (p, B, ms) => { await p.evaluate(({ B, ms }) => window.__map.easeTo({ ...B, duration: ms, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) }), { B, ms }); return []; } },
  { name: 'calendar', start: '#/calendar?aoi=BGD&y=2023&m=1&notour=1', seconds: 5,
    prep: async (p) => { await p.waitForTimeout(2500); await p.evaluate(() => document.querySelector('[data-cal-grid]')?.scrollIntoView({ block: 'center' })); await p.waitForTimeout(600); },
    shot: async () => [{ at: 0.3, fn: (p) => p.locator('button[aria-label="Replay month by month"]').first().evaluate((el) => el.click()).catch(() => {}) }] },
  { name: 'story', start: '#/story' + q('&step=0'), seconds: 5.5,
    prep: async (p) => { await p.waitForTimeout(3000); },
    shot: async () => [1.3, 3.4].map((at) => ({ at, fn: (p) => p.locator('[data-story-next]').first().evaluate((el) => el.click()).catch(() => {}) })) },
];

const browser = await chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true });
for (const c of CLIPS) {
  if (ONLY.length && !ONLY.includes(c.name)) continue;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: 'dark' });
  await ctx.addInitScript(() => { try { localStorage.setItem('parallax-theme', 'dark'); localStorage.setItem('parallax.tour.v1', 'done'); } catch { /* private mode */ } });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  await p.clock.install();
  await p.goto(BASE + c.start, { waitUntil: 'load' });
  await p.waitForTimeout(4500);
  await p.addStyleTag({ content: CSS });
  const state = await c.prep(p);
  for (const ahead of [3000, 8000, 20000]) {   // a busy page can run past a near target: retry further ahead
    try { await p.clock.pauseAt(await p.evaluate((x) => Date.now() + x, ahead)); break; } catch (e) { if (ahead === 20000) throw e; }
  }
  const cdp = await ctx.newCDPSession(p); await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.3 });
  const events = (await c.shot(p, state, c.seconds * 1000)) || [];
  const out = path.join(OUT, c.name + '.gif');
  const enc = spawn(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${c.width || GIF_W}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${c.colors || 160}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    '-loop', '0', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = once(enc, 'close');
  const N = Math.round(c.seconds * FPS); let t = Date.now();
  for (let i = 0; i < N; i++) {
    for (const e of events) if (!e.done && i / FPS >= e.at) { e.done = true; await e.fn(p); }
    const buf = await p.screenshot({ type: 'jpeg', quality: 90 });
    if (!enc.stdin.write(buf)) await once(enc.stdin, 'drain');
    await p.clock.runFor(1000 / FPS);
    if (i % 8 === 7) { const ms = (Date.now() - t) / 8; t = Date.now(); await cdp.send('Animation.setPlaybackRate', { playbackRate: Math.min(1, (1000 / FPS) / ms) }); }
  }
  enc.stdin.end(); await done; await ctx.close();
  console.log(JSON.stringify({ gif: out, frames: N, kb: Math.round(fs.statSync(out).size / 1024), errs }));
}
await browser.close();
