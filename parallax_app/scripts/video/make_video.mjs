// Builds the Space Apps pitch video from the LIVE site: scripted screen recordings + narration + burned-in captions.
// Usage (from parallax_app/):  FFMPEG=/path/to/ffmpeg node scripts/video/make_video.mjs <work dir> [--only=s05,s06] [--voice=Daniel] [--rate=165]
// Needs: Brave (headless, via Playwright), macOS `say`, an ffmpeg with libx264 + aac. Every number spoken is in
// scripts/video/SCRIPT.md with its source in the snapshot. Nothing here is simulated: all footage is the real app.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const work = process.argv[2];
if (!work) { console.error('work dir required'); process.exit(2); }
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const FF = process.env.FFMPEG || 'ffmpeg';
const VOICE = arg('voice', 'Daniel'), RATE = arg('rate', '165');
const ONLY = arg('only', '').split(',').filter(Boolean);
const BASE = process.env.VIDEO_BASE || 'https://parallaxfire.netlify.app/';
const W = 1280, H = 720;
const PAD = process.argv.includes('--short') ? 0.2 : 0.55, LEAD = process.argv.includes('--short') ? 0.15 : 0.35;
fs.mkdirSync(work, { recursive: true });

// spoken text uses phonetic spellings; captions use the real names
const speak = (t) => t.replace(/([.?!])\s+/g, '$1 [[slnc 200]] ').replace(/\bMODIS\b/g, 'Moe diss').replace(/\bVIIRS\b/g, 'Veers').replace(/\bNOAA\b/g, 'Noah').replace(/\bFIRMS\b/g, 'Firms')
  .replace(/Suomi NPP/g, 'Swomee N P P').replace(/\b375 metres\b/g, 'three hundred and seventy five metres');

const q = '?aoi=BGD&y=2024&m=3&notour=1';
/** helpers that run inside the page */
const scrollOver = (p, from, to, ms) => p.evaluate(({ from, to, ms }) => new Promise((res) => {
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; window.scrollTo(0, from + (to - from) * e); k < 1 ? requestAnimationFrame(step) : res(); };
  requestAnimationFrame(step);
}), { from, to, ms });
const sectionSpan = (p, sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top + scrollY, h: r.height, vh: innerHeight }; }, sel);
const go = async (p, route, query = q, wait = 3500) => { await p.evaluate((h) => { location.hash = h; }, '#/' + route + query); await p.waitForTimeout(wait); };
const tryClick = async (p, sel, wait = 1200) => { try { await p.click(sel, { timeout: 2500 }); await p.waitForTimeout(wait); } catch { /* control not present: keep going */ } };

const SEGMENTS = [
  { id: 's01', start: '', lower: '',
    text: 'Every March, satellites light up with fire detections over Bangladesh. Two NASA satellites watch the same fires. The older one sees one hot pixel. The sharper one sees several. So which count do you trust?',
    prep: async (p) => { const s = await sectionSpan(p, '#how'); await p.evaluate((y) => window.scrollTo(0, y), s.top + 40); await p.waitForTimeout(1800); return s; },
    act: async (p, ms, s) => { await scrollOver(p, s.top + 40, s.top + Math.max(200, (s.h - s.vh) * 0.85), ms); } },
  { id: 's02', start: '', lower: 'Team Lumos · Dhaka, Bangladesh · NASA Space Apps Challenge 2026',
    text: 'We are Team Lumos, from Dhaka. We built Parallax Fire for the NASA Space Apps Challenge 2026, to turn two satellite records that disagree into one honest story of when a place burns.',
    prep: async (p) => { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(2500); },
    act: async (p, ms) => { await p.waitForTimeout(ms); } },
  { id: 's03', start: '', lower: 'The problem · Bangladesh, real NASA FIRMS detections',
    text: 'Here is the problem. MODIS has recorded fires for more than twenty years, in pixels one kilometre wide. VIIRS arrived in 2012 with pixels of 375 metres, so it catches smaller fires. In Bangladesh it records about five times as many detections. Join the two records, and burning seems to jump in 2012. But mostly, the camera changed.',
    prep: async (p) => { const s = await sectionSpan(p, '#jump'); await p.evaluate((y) => window.scrollTo(0, y), s.top + 20); await p.waitForTimeout(1800); return s; },
    act: async (p, ms, s) => { await scrollOver(p, s.top + 20, s.top + Math.max(200, (s.h - s.vh) * 0.9), ms); } },
  { id: 's04', start: '#/sensors' + q, lower: 'Why it matters',
    text: 'Imagine you plan for the burning season in your district. You compare 2005 with 2020, see five times the fire, and ask for five times the resources, for a change that never happened on the ground. And a hot spot is not always a wildfire. It can be crop burning, or one fire seen twice. Cloud hides fires too, so no detection never means no fire.',
    prep: async (p) => { await p.waitForTimeout(1500); },
    act: async (p, ms) => { await p.waitForTimeout(ms * 0.5); await tryClick(p, 'button:has-text("even")', 0); await p.waitForTimeout(ms * 0.45); } },
  { id: 's05', start: '#/calendar' + q, lower: 'Step 1 · Calendar: pick a place',
    text: 'So here is how you use Parallax Fire. Open the calendar and pick your place. Each row is a year, each column a month, and the colour shows how much burning the satellites recorded. In Bangladesh, March and April hold about four in five detections, year after year. Choose California, and the season moves to late summer.',
    prep: async (p) => { await p.waitForTimeout(1500); },
    act: async (p, ms) => { await p.waitForTimeout(ms * 0.42); await go(p, 'calendar', '?aoi=BGD&y=2016&m=4&notour=1', ms * 0.25); await go(p, 'calendar', '?aoi=USA-CA&y=2020&m=9&notour=1', ms * 0.28); } },
  { id: 's06', start: '#/map' + q, lower: 'Step 2 · Map: see where',
    text: 'Pick a month, and the map shows where it burned, on a real map, by five kilometre square or by district. Heat view and night vision change only how the map looks, never the data.',
    prep: async (p) => { await p.waitForTimeout(3500); await p.evaluate(() => document.querySelector('.maplibregl-canvas')?.scrollIntoView({ block: 'center' })); await p.waitForTimeout(600); },
    act: async (p, ms) => { await p.waitForTimeout(ms * 0.3); await tryClick(p, 'button:has-text("Districts")', ms * 0.22); await tryClick(p, '[data-look="thermal"]', ms * 0.2); await tryClick(p, '[data-look="nvg"]', ms * 0.15); await tryClick(p, '[data-look="normal"]', 0); } },
  { id: 's07', start: '#/sensors' + q, lower: 'Step 3 · Two satellites, one scale',
    text: 'Open Two satellites to see both records side by side, with our estimate of what the sharper satellite would have counted in the earlier years. The estimate learns only from years when both satellites flew, and we checked it on 2023 and 2024, years it had never seen. In Bangladesh it missed by 98 detections a month on average. Taking the old satellite’s count as it is misses by 627.',
    prep: async (p) => { await p.waitForTimeout(1500); },
    act: async (p, ms) => { await p.waitForTimeout(ms * 0.36); await go(p, 'method', q, 1200);
      const y = await p.evaluate(() => { const t = document.querySelector('main table'); return t ? t.getBoundingClientRect().top + scrollY - 170 : 600; });
      await scrollOver(p, 0, y, ms * 0.22); await p.waitForTimeout(ms * 0.36); } },
  { id: 's08', start: '#/method?aoi=AUS-NSW&y=2020&m=1&notour=1', lower: 'Honest limits',
    text: 'We also show where it falls short. In New South Wales the estimate was closer than the simple rules, but its likely range was too wide to pass our check, so there the app shows the raw comparison only. Missing months stay missing. Every estimate is labelled as an estimate.',
    prep: async (p) => { await p.waitForTimeout(1500); const y = await p.evaluate(() => { const t = document.querySelector('main table'); return t ? t.getBoundingClientRect().top + scrollY - 170 : 600; }); await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(500); },
    act: async (p, ms) => { await p.waitForTimeout(ms * 0.55); await go(p, 'calendar', '?aoi=AUS-NSW&y=2020&m=1&notour=1', ms * 0.4); } },
  { id: 's09', start: '#/live' + q, lower: 'Step 4 · Live: today, from NASA FIRMS',
    text: 'And for today, the Live page shows the last twenty-four hours of NASA fire detections on a real globe, counted per satellite, with fresh satellite pictures and the position of each fire satellite right now.',
    prep: async (p) => { await p.waitForFunction(() => /\d/.test(document.querySelector('[data-live-count]')?.textContent || ''), null, { timeout: 60000 }).catch(() => {}); await tryClick(p, 'button:has-text("World")', 4500); },
    act: async (p, ms) => { await p.waitForTimeout(ms * 0.35); await tryClick(p, 'button:has-text("California")', ms * 0.55); } },
  { id: 's10', start: '#/data' + q, lower: 'Impact',
    text: 'What does this change? A planner can see the real burning season before deciding when to watch more closely. A researcher can compare two decades without mistaking a new camera for a new fire. A teacher can show students why data needs care. And every number can be traced to its source and downloaded.',
    prep: async (p) => { await p.waitForTimeout(1500); },
    act: async (p, ms) => { await p.waitForTimeout(ms * 0.15); await scrollOver(p, 0, 620, ms * 0.8); } },
  { id: 's11', start: '#/live?aoi=BGD&y=2024&m=3&notour=1', lower: 'What comes next',
    text: 'Next, we want to add more regions, follow the newer NOAA satellites as the Suomi NPP data stream ends, add a Bangla interface, and test it with the people who plan for burning seasons. For that, we need partners and field feedback.',
    prep: async (p) => { await p.waitForFunction(() => /\d/.test(document.querySelector('[data-live-count]')?.textContent || ''), null, { timeout: 60000 }).catch(() => {}); await tryClick(p, 'button:has-text("World")', 4500); },
    act: async (p, ms) => { await p.waitForTimeout(ms * 0.3); await tryClick(p, 'button:has-text("New South Wales")', ms * 0.3); await tryClick(p, 'button:has-text("Bangladesh")', ms * 0.3); } },
  { id: 's12', start: '', lower: '', card: true,
    text: 'Parallax Fire. Same fires, two cameras, one honest record. Thank you.',
    prep: async (p) => { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(1500); },
    act: async (p, ms) => { await p.waitForTimeout(ms + 2500); }, extra: 2.5 },
];

// --short: the 30-second version (introduce yourself, lead in, name the solution, describe the idea, look ahead)
const SHORT = [
  { id: 'q01', start: '', lower: 'Team Lumos · Dhaka, Bangladesh',
    text: 'We are Team Lumos, from Dhaka. Satellites say fires jumped in 2012. Did they?',
    prep: async (p) => { const s = await sectionSpan(p, '#jump'); await p.evaluate((y) => window.scrollTo(0, y), s.top + (s.h - s.vh) * 0.45); await p.waitForTimeout(2200); return s; },
    act: async (p, ms, s) => { await scrollOver(p, s.top + (s.h - s.vh) * 0.45, s.top + (s.h - s.vh) * 0.8, ms); } },
  { id: 'q02', start: '', lower: '', card: true,
    text: 'Parallax Fire. Same fires, two cameras, one honest record.',
    prep: async (p) => { await p.waitForTimeout(800); },
    act: async (p, ms) => { await p.waitForTimeout(ms); } },
  { id: 'q03', start: '#/calendar' + q, lower: 'NASA FIRMS · MODIS and VIIRS on one scale',
    text: 'We put NASA’s MODIS and VIIRS fire detections on one fair scale: a burning calendar, a real map and a live view, with every estimate labelled.',
    prep: async (p) => {   // visit Map and Live once so their code and data are already loaded when the cut switches pages
      await go(p, 'map', q, 5000); await go(p, 'live', q, 1000);
      await p.waitForFunction(() => /\d/.test(document.querySelector('[data-live-count]')?.textContent || ''), null, { timeout: 60000 }).catch(() => {});
      await go(p, 'calendar', q, 2500); },
    act: async (p, ms) => { await p.waitForTimeout(ms * 0.34); await go(p, 'map', q, ms * 0.3); await go(p, 'live', q, ms * 0.3); } },
  { id: 'q04', start: '#/live' + q, lower: 'What comes next',
    text: 'Next: more regions, newer satellites and a Bangla interface, so anyone can tell a new fire from a new camera.',
    prep: async (p) => { await p.waitForFunction(() => /\d/.test(document.querySelector('[data-live-count]')?.textContent || ''), null, { timeout: 60000 }).catch(() => {}); await tryClick(p, 'button:has-text("World")', 4500); },
    act: async (p, ms) => { await p.waitForTimeout(ms); } },
];
const IS_SHORT = process.argv.includes('--short');
if (IS_SHORT) SEGMENTS.splice(0, SEGMENTS.length, ...SHORT);
const OUT_NAME = IS_SHORT ? 'parallax-fire-30s.mp4' : 'parallax-fire-240s.mp4';

const CARD_HTML = `
<div class="pfv-card"><div>
  <div class="pfv-k">NASA SPACE APPS CHALLENGE 2026 · HARMONIZATION OF MODIS AND VIIRS HOT SPOTS</div>
  <div class="pfv-t">Parallax <b>Fire</b></div>
  <div class="pfv-s">Same fires. Two cameras. One honest record.</div>
  <div class="pfv-u">parallaxfire.netlify.app</div>
  <div class="pfv-c"><b>Team Lumos</b> · Dhaka, Bangladesh<br>M Al Shahriar Hameem (team lead) · Tuasin Taj Fiha · Kausar Ahmed · Md Abu Ammar · Sabiha Akter · Afifa Asif</div>
  <div class="pfv-d">Data: NASA FIRMS active-fire detections (MODIS Collection 6.1; VIIRS 375 m) · imagery NASA EOSDIS GIBS · orbit records CelesTrak<br>Maps: OpenFreeMap © OpenMapTiles, data from OpenStreetMap · Natural Earth · geoBoundaries (CC BY 3.0 IGO)<br>A hot spot is a satellite detection, not a confirmed wildfire. Created by M Al Shahriar Hameem.</div>
</div></div>`;
const OVERLAY_CSS = `
#nl-badge-frame{display:none!important} html{scrollbar-width:none} ::-webkit-scrollbar{display:none}
.pfv-cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:2147483646;max-width:1040px;padding:10px 20px;border-radius:10px;background:rgba(6,10,20,.86);color:#F4F7FB;font:600 24px/1.32 Inter,system-ui,-apple-system,sans-serif;text-align:center;letter-spacing:.005em;box-shadow:0 6px 28px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.10);opacity:0;transition:opacity .18s}
.pfv-cap.on{opacity:1}
.pfv-low{position:fixed;left:50%;transform:translateX(-50%);top:12px;white-space:nowrap;z-index:2147483646;padding:7px 12px;border-radius:6px;background:rgba(6,10,20,.82);border:1px solid rgba(245,158,11,.55);color:#FCD34D;font:600 13px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.09em;text-transform:uppercase}
.pfv-card{position:fixed;inset:0;z-index:2147483645;display:grid;place-items:center;background:radial-gradient(1200px 700px at 70% 20%,#12233f 0%,#0B1220 55%,#070b14 100%);color:#F4F7FB;font-family:Inter,system-ui,-apple-system,sans-serif;text-align:center}
.pfv-card>div{max-width:1040px;padding:0 40px}
.pfv-k{font:600 13px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#FCD34D;margin-bottom:26px}
.pfv-t{font-size:92px;font-weight:300;letter-spacing:-.02em;line-height:1}.pfv-t b{font-weight:800;background:linear-gradient(90deg,#FCD34D,#F97316 60%,#EF4444);-webkit-background-clip:text;background-clip:text;color:transparent}
.pfv-s{font-size:30px;font-weight:600;margin-top:18px}.pfv-u{font:600 18px ui-monospace,Menlo,monospace;color:#7DD3FC;margin-top:14px}
.pfv-c{font-size:17px;line-height:1.6;margin-top:34px;color:#DCE4F0}.pfv-d{font-size:12.5px;line-height:1.6;margin-top:22px;color:#9AA7BD}`;

const chunks = (t) => { // caption chunks of roughly one line and a half, cut at sentence or comma boundaries
  const out = []; let cur = '';
  for (const part of t.split(/(?<=[.?!:,])\s+/)) { if ((cur + ' ' + part).trim().length > 78 && cur) { out.push(cur.trim()); cur = part; } else cur = (cur + ' ' + part).trim(); }
  if (cur) out.push(cur.trim());
  return out;
};
const dur = (file) => { const o = execFileSync('afinfo', [file]).toString(); return parseFloat((o.match(/estimated duration: ([\d.]+)/) || [])[1]); };
const ff = (args) => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

if (process.argv.includes('--dry')) {   // time the narration only
  let sum = 0;
  for (const s of SEGMENTS) { const f = path.join(work, s.id + '.dry.aiff'); execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', f, speak(s.text)]); const a = dur(f); fs.rmSync(f); sum += LEAD + a + PAD + (s.extra || 0); console.log(s.id, a.toFixed(1)); }
  console.log('TOTAL', sum.toFixed(1), 'voice', VOICE, 'rate', RATE); process.exit(0);
}
const browser = await chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true });
const report = [];
for (const s of SEGMENTS) {
  const mp4 = path.join(work, s.id + '.mp4');
  if (ONLY.length ? !ONLY.includes(s.id) : fs.existsSync(mp4)) { report.push({ id: s.id, skipped: true }); continue; }
  const aiff = path.join(work, s.id + '.aiff');
  execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', aiff, speak(s.text)]);
  const a = dur(aiff), total = LEAD + a + PAD + (s.extra || 0);
  const vdir = path.join(work, s.id + '_raw'); fs.rmSync(vdir, { recursive: true, force: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: vdir, size: { width: W, height: H } }, colorScheme: 'dark' });
  await ctx.addInitScript(() => { try { localStorage.setItem('parallax-theme', 'dark'); localStorage.setItem('parallax.tour.v1', 'done'); } catch { /* private mode */ } });
  const p = await ctx.newPage(); const t0 = Date.now(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  await p.goto(BASE + (s.start || '?notour'), { waitUntil: 'load' });
  await p.waitForTimeout(s.start ? 4500 : 6500);
  await p.addStyleTag({ content: OVERLAY_CSS });
  const state = await s.prep(p);
  if (s.card) await p.evaluate((h) => document.body.insertAdjacentHTML('beforeend', h), CARD_HTML);
  await p.evaluate((lower) => { if (lower) { const l = document.createElement('div'); l.className = 'pfv-low'; l.textContent = lower; document.body.appendChild(l); } }, s.lower);
  await p.waitForTimeout(900);   // the recording starts a little before t0: settle so the cut never shows the page before the card/label
  await p.evaluate(({ caps, lead, a }) => {
    const c = document.createElement('div'); c.className = 'pfv-cap'; document.body.appendChild(c);
    const n = caps.reduce((x, y) => x + y.length, 0); let at = lead * 1000;
    for (const t of caps) { const ms = (t.length / n) * a * 1000; setTimeout(() => { c.textContent = t; c.classList.add('on'); }, at); at += ms; }
    setTimeout(() => c.classList.remove('on'), at + 250);
  }, { caps: chunks(s.text), lead: LEAD, a });
  const ready = (Date.now() - t0) / 1000;
  await s.act(p, (LEAD + a + PAD) * 1000 - 150, state);
  const spent = (Date.now() - t0) / 1000 - ready;
  if (spent < total) await p.waitForTimeout((total - spent) * 1000 + 200);
  const video = p.video(); await ctx.close();
  const raw = await video.path();
  ff(['-ss', ready.toFixed(2), '-t', total.toFixed(2), '-i', raw, '-i', aiff,
    '-filter_complex', `[0:v]fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p[v];[1:a]adelay=${Math.round(LEAD * 1000)}|${Math.round(LEAD * 1000)},apad,aresample=48000[a]`,
    '-map', '[v]', '-map', '[a]', '-t', total.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', '-ac', '2', mp4]);
  fs.rmSync(vdir, { recursive: true, force: true });
  report.push({ id: s.id, audio_s: +a.toFixed(2), total_s: +total.toFixed(2), ready_s: +ready.toFixed(1), errs });
  console.log(JSON.stringify(report[report.length - 1]));
}
await browser.close();

if (!SEGMENTS.every((s) => fs.existsSync(path.join(work, s.id + '.mp4')))) { console.log(JSON.stringify({ note: 'not all segments built yet; skipping the join', report })); process.exit(0); }
const list = SEGMENTS.map((s) => `file '${path.join(work, s.id + '.mp4')}'`).join('\n');
fs.writeFileSync(path.join(work, 'list.txt'), list + '\n');
const out = path.join(work, OUT_NAME);
ff(['-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out]);
console.log(JSON.stringify({ out, bytes: fs.statSync(out).size }));
