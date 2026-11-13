// Builds the Space Apps pitch video from the LIVE site: scripted screen recordings + narration + burned-in captions.
// Usage (from parallax_app/):  FFMPEG=/path/to/ffmpeg node scripts/video/make_video.mjs <work dir> [--only=s05,s06] [--short] [--audio=<dir of sNN.wav>] [--voice=Daniel] [--rate=165]
// Team and project logos come from <repo>/branding/*.svg. Writes <out>.mp4 and a matching <out>.srt.
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
const BRAND = path.join(path.dirname(new URL(import.meta.url).pathname), '../../../branding');
const logo = (f) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(BRAND, f)).toString('base64');
const TEAM = ['Tuasin Taj Fiha', 'Afifa Asif', 'Md Abu Ammar', 'Kausar Ahmed', 'Sabiha Akter'];
// team photos (backgrounds removed) and the Space Apps logo live in <repo>/video/assets, which is not committed
const ASSETS = path.join(BRAND, '../video/assets');
const png = (f) => { const p = path.join(ASSETS, f); return fs.existsSync(p) ? 'data:image/png;base64,' + fs.readFileSync(p).toString('base64') : ''; };
const photo = (n) => png(n.toLowerCase().replace(/\s+/g, '-') + '.png');
const SPACE_APPS = png('space-apps-logo-white.png');
const MEMBERS = [['M Al Shahriar Hameem', 'Team lead'], ...TEAM.map((n) => [n, ''])];

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

const earthReady = async (p) => { await p.waitForFunction(() => window.__earth && window.__earth.debug && window.__earth.debug().ready && window.__earth.debug().hotspots > 1000, null, { timeout: 60000 }).catch(() => {}); };
const SEGMENTS = [
  { id: 's01', start: '#/live?aoi=BGD&y=2024&m=3&notour=1', lower: '',
    text: 'Right now, five NASA satellites are circling the Earth, watching for fire. In the last day alone, they reported tens of thousands of hot spots. Two of these satellites have watched for more than twenty years. But they do not see fire the same way.',
    prep: async (p) => { await earthReady(p); await tryClick(p, 'button:has-text("Whole Earth")', 3500); },
    act: async (p, ms) => { await p.waitForTimeout(ms * 0.45); await tryClick(p, 'button:has-text("Bangladesh")', ms * 0.5); } },
  { id: 's02', start: '', lower: '', team: true,
    text: 'We are Team Lumos, from Dhaka: M Al Shahriar Hameem, our team lead, with Tuasin Taj Fiha, Afifa Asif, Md Abu Ammar, Kausar Ahmed and Sabiha Akter. For the NASA Space Apps Challenge, we built Parallax Fire, to turn two satellite records that disagree into one honest story of when a place burns.',
    prep: async (p) => { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(2500); },
    act: async (p, ms) => { await p.waitForTimeout(ms); } },
  { id: 's03', start: '', lower: '',
    text: 'The older satellite, MODIS, sees the ground in pixels one kilometre wide. The sharper one, VIIRS, arrived in 2012 and sees pixels of 375 metres, so it catches smaller fires. In Bangladesh it records about five times as many.',
    prep: async (p) => { const s = await sectionSpan(p, '#how'); await p.evaluate((y) => window.scrollTo(0, y), s.top + 40); await p.waitForTimeout(1800); return s; },
    act: async (p, ms, s) => { await scrollOver(p, s.top + 40, s.top + Math.max(200, (s.h - s.vh) * 0.85), ms); } },
  { id: 's04', start: '', lower: '',
    text: 'So when you join the two records, burning seems to leap in 2012. Imagine planning your district’s fire season from this chart. You would ask for help against a change that never happened on the ground.',
    prep: async (p) => { const s = await sectionSpan(p, '#jump'); await p.evaluate((y) => window.scrollTo(0, y), s.top + (s.h - s.vh) * 0.5); await p.waitForTimeout(2000); return s; },
    act: async (p, ms) => { await p.waitForTimeout(ms); } },
  { id: 's05', start: '#/sensors' + q, lower: '',
    text: 'Parallax Fire puts both on one scale. It learns how the two satellites relate, only from years when both were flying. Press one switch, and most of that jump disappears. The camera changed, not the fire.',
    prep: async (p) => { await p.waitForTimeout(2500); await p.evaluate(() => document.querySelector('[data-chart="compare"]')?.scrollIntoView({ block: 'center' })); await p.waitForTimeout(800); },
    act: async (p, ms) => { await p.waitForTimeout(ms * 0.42); await tryClick(p, 'button:has-text("On one scale")', 0); await p.waitForTimeout(ms * 0.55); } },
  { id: 's06', start: '#/story?aoi=BGD&y=2024&m=3&step=2&notour=1', lower: 'Story · March 2024',
    text: 'Here is a real test. In March 2024, the sharper satellite counted 621 detections over Bangladesh. The older one counted 111. That month was never used to build our estimate. From the older count alone, we estimated about 1,093, likely between 571 and 1,529. The real 621 fell inside that range.',
    prep: async (p) => { await p.waitForTimeout(3000); },
    act: async (p, ms) => { await p.waitForTimeout(ms * 0.45); await tryClick(p, '[data-story-next]', ms * 0.5); } },
  { id: 's07', start: '#/calendar' + q, lower: '',
    text: 'First, pick a place. The calendar shows each year as a row and each month as a column. In Bangladesh, March and April hold about four in five detections, year after year. In California, the season moves to late summer.',
    prep: async (p) => { await p.waitForTimeout(2500); },
    act: async (p, ms) => { await p.waitForTimeout(ms * 0.55); await go(p, 'calendar', '?aoi=USA-CA&y=2020&m=9&notour=1', ms * 0.4); } },
  { id: 's08', start: '#/map' + q, lower: '',
    text: 'Next, the map shows where it burned, district by district, on a real map.',
    prep: async (p) => { await p.waitForTimeout(4000); await tryClick(p, 'button:has-text("Districts")', 1500); await p.evaluate(() => document.querySelector('.maplibregl-canvas')?.scrollIntoView({ block: 'center' })); await p.waitForTimeout(600); },
    act: async (p, ms) => { await p.waitForTimeout(ms); } },
  { id: 's09', start: '#/method' + q, lower: '',
    text: 'We checked the method on the years 2023 and 2024, which it had never seen. In Bangladesh it missed by 98 detections a month, where the raw older count misses by 627. In New South Wales it was not good enough, so there the app shows the raw records only, and says so.',
    prep: async (p) => { await p.waitForTimeout(2500); const y = await p.evaluate(() => { const t = document.querySelector('main table'); return t ? t.getBoundingClientRect().top + scrollY - 180 : 0; }); await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(500); },
    act: async (p, ms) => { await p.waitForTimeout(ms); } },
  { id: 's10', start: '#/live?aoi=BGD&y=2024&m=3&notour=1', lower: '',
    text: 'Finally, for today, the live Earth shows each fire satellite where it really is, with every hot spot it reported in the last twenty-four hours. It is all NASA data: FIRMS fire detections from MODIS and VIIRS, and GIBS satellite imagery, with public orbit records.',
    prep: async (p) => { await earthReady(p); await p.waitForTimeout(1500); },
    act: async (p, ms) => { await tryClick(p, 'button:has-text("California")', ms * 0.55); await tryClick(p, '.ev-card:has-text("NOAA-20")', ms * 0.4); } },
  { id: 's11', start: '#/live?aoi=BGD&y=2024&m=3&notour=1', lower: '',
    text: 'A planner can see the real burning season before deciding when to watch closely. A researcher can compare two decades without mistaking a new camera for new fire. Looking ahead, we want more regions, the newer NOAA satellites, a Bangla interface, and partners to test it with.',
    prep: async (p) => { await earthReady(p); await tryClick(p, 'button:has-text("Whole Earth")', 3000); },
    act: async (p, ms) => { await p.waitForTimeout(ms); } },
  { id: 's12', start: '', lower: '', card: true,
    text: 'Parallax Fire. Same fires, two cameras, one honest record. This is Team Lumos. Thank you.',
    prep: async (p) => { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(1500); },
    act: async (p, ms) => { await p.waitForTimeout(ms + 2500); }, extra: 2.5 },
];

// --short: the 30-second version (introduce yourself, lead in, name the solution, describe the idea, look ahead)
const SHORT = [
  { id: 'q01', start: '', lower: '', strip: true,
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
  <div class="pfv-k">${IS_SHORT ? '' : '240 SECONDS OF GLORY · '}NASA SPACE APPS CHALLENGE – BANGLADESH 2026 · HARMONIZATION OF MODIS AND VIIRS HOT SPOTS</div>
  <img class="pfv-logo" src="${logo('parallax-fire-logo.svg')}" alt="Parallax Fire">
  <div class="pfv-u">parallaxfire.netlify.app</div>
  <div class="pfv-c"><img src="${logo('lumos-team-logo.svg')}" alt="Team Lumos" style="height:46px;display:block;margin:0 auto 6px">M Al Shahriar Hameem (team lead) · ${TEAM.join(' · ')}</div>
  <div class="pfv-d">Data: NASA FIRMS active-fire detections (MODIS Collection 6.1; VIIRS 375 m) · imagery NASA EOSDIS GIBS · orbit records CelesTrak<br>Maps: OpenFreeMap © OpenMapTiles, data from OpenStreetMap · Natural Earth · geoBoundaries (CC BY 3.0 IGO)<br>A hot spot is a satellite detection, not a confirmed wildfire. Created by M Al Shahriar Hameem.</div>
</div></div>`;
const TEAM_HTML = `
<div class="pfv-card pfv-team"><div>
  <div class="pfv-k">MEET THE TEAM · NASA SPACE APPS CHALLENGE – BANGLADESH 2026</div>
  <div class="pfv-logos"><img src="${logo('lumos-team-logo.svg')}" alt="Team Lumos"><img src="${logo('parallax-fire-logo.svg')}" alt="Parallax Fire"></div>
  <div class="pfv-names">${MEMBERS.map(([n, r], i) => `<div class="${r ? 'lead' : ''}" style="animation-delay:${(2.4 + i * 1.2).toFixed(2)}s">${photo(n) ? `<img src="${photo(n)}" alt="">` : ''}<b>${n}</b>${r ? `<i>${r}</i>` : ''}</div>`).join('')}</div>
</div></div>`;
const STRIP_HTML = `<div class="pfv-strip"><img src="${logo('lumos-team-logo.svg')}" alt="Team Lumos">${MEMBERS.map(([n, r]) => `<span>${photo(n) ? `<b class="av" style="background-image:url(${photo(n)})"></b>` : ''}${n}${r ? ' <i>(lead)</i>' : ''}</span>`).join('')}</div>`;
const NASA_HTML = SPACE_APPS ? `<img class="pfv-nasa" src="${SPACE_APPS}" alt="NASA International Space Apps Challenge">` : '';
const OVERLAY_CSS = `
#nl-badge-frame{display:none!important} .topbar__tools{visibility:hidden!important} .lx-nav{padding-right:112px!important} html{scrollbar-width:none} ::-webkit-scrollbar{display:none}
.pfv-cap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483646;width:max-content;max-width:1040px;padding:10px 20px;border-radius:10px;background:rgba(6,10,20,.86);color:#F4F7FB;font:600 23px/1.32 Inter,system-ui,-apple-system,sans-serif;text-align:center;letter-spacing:.005em;box-shadow:0 6px 28px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.10);opacity:0;transition:opacity .18s}
.pfv-cap.on{opacity:1}
.pfv-low{position:fixed;left:50%;transform:translateX(-50%);top:12px;white-space:nowrap;z-index:2147483646;padding:7px 12px;border-radius:6px;background:rgba(6,10,20,.82);border:1px solid rgba(245,158,11,.55);color:#FCD34D;font:600 13px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.09em;text-transform:uppercase}
.pfv-card{position:fixed;inset:0;z-index:2147483645;display:grid;place-items:center;background:radial-gradient(1200px 700px at 70% 20%,#12233f 0%,#0B1220 55%,#070b14 100%);color:#F4F7FB;font-family:Inter,system-ui,-apple-system,sans-serif;text-align:center}
.pfv-card>div{max-width:1040px;padding:0 40px}
.pfv-k{font:600 12px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:#FCD34D;margin-bottom:26px}
.pfv-t{font-size:92px;font-weight:300;letter-spacing:-.02em;line-height:1}.pfv-t b{font-weight:800;background:linear-gradient(90deg,#FCD34D,#F97316 60%,#EF4444);-webkit-background-clip:text;background-clip:text;color:transparent}
.pfv-s{font-size:30px;font-weight:600;margin-top:18px}.pfv-u{font:600 18px ui-monospace,Menlo,monospace;color:#7DD3FC;margin-top:14px}
.pfv-c{font-size:17px;line-height:1.6;margin-top:30px;color:#DCE4F0}.pfv-d{font-size:12.5px;line-height:1.6;margin-top:22px;color:#9AA7BD}
.pfv-logo{width:640px;display:block;margin:0 auto}
.pfv-logos{display:flex;gap:56px;justify-content:center;align-items:center;margin-bottom:44px}.pfv-logos img{height:118px}
.pfv-names{display:grid;grid-template-columns:repeat(6,172px);gap:14px;justify-content:center}
.pfv-names>div{padding:0 0 12px;border-radius:14px;overflow:hidden;background:linear-gradient(180deg,rgba(125,211,252,.10),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.12);font-size:15.5px;line-height:1.25;opacity:0;transform:translateY(14px);animation:pfvIn .6s cubic-bezier(.2,.7,.2,1) forwards}
.pfv-names img{display:block;width:100%;height:200px;object-fit:cover;object-position:50% 0;background:radial-gradient(120px 120px at 50% 60%,rgba(245,158,11,.22),transparent 70%);margin-bottom:10px}
.pfv-names b{font-weight:700;display:block;padding:0 8px}@keyframes pfvIn{to{opacity:1;transform:none}}.pfv-names i{font:600 12px ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:#FCD34D;font-style:normal;display:block;margin-top:6px}
.pfv-names .lead{border-color:rgba(245,158,11,.6);background:rgba(245,158,11,.08)}
.pfv-team .pfv-k{margin-bottom:34px}
.pfv-strip{position:fixed;top:12px;left:16px;z-index:2147483646;display:grid;grid-template-columns:auto repeat(3,auto);gap:6px 16px;align-items:center;padding:8px 16px 8px 8px;border-radius:10px;background:rgba(6,10,20,.86);border:1px solid rgba(245,158,11,.5);white-space:nowrap}
.pfv-strip>img{height:44px;grid-row:span 2;margin-right:2px}.pfv-strip span{display:flex;align-items:center;gap:6px;font:600 12.5px/1.2 Inter,system-ui,sans-serif;color:#DCE4F0}.pfv-strip i{font-style:normal;color:#FCD34D}
.pfv-strip .av{width:34px;height:34px;border-radius:50%;background:#1d2a40 no-repeat 50% 4%/190% auto;border:1px solid rgba(255,255,255,.25)}
.pfv-nasa{position:fixed;top:12px;right:16px;height:74px;z-index:2147483647;filter:drop-shadow(0 2px 6px rgba(0,0,0,.7))}`;

const chunks = (t) => { // caption chunks of roughly one line and a half, cut at sentence or comma boundaries
  const out = []; let cur = '';
  for (const part of t.split(/(?<=[.?!:,])\s+/)) { if ((cur + ' ' + part).trim().length > 78 && cur) { out.push(cur.trim()); cur = part; } else cur = (cur + ' ' + part).trim(); }
  if (cur) out.push(cur.trim());
  return out;
};
// --audio=<dir>: recorded narration (<dir>/<id>.m4a|.wav|.aiff|.mp3). If <dir>/<id>.json holds per-line timings
// ([{ t, s, e }] from the narration generator), the subtitles follow them exactly; otherwise they are spread by text length.
const AUDIO = arg('audio', '');
const cues = (s, a) => {
  const j = AUDIO && path.join(AUDIO, s.id + '.json');
  if (j && fs.existsSync(j)) return JSON.parse(fs.readFileSync(j, 'utf8'));
  const caps = chunks(s.text), N = caps.reduce((x, y) => x + y.length, 0); let at = 0;
  return caps.map((t) => { const d = (t.length / N) * a; at += d; return { t, s: at - d, e: at }; });
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
  // --audio=<dir>: use recorded narration (<dir>/<id>.m4a|.wav|.aiff|.mp3, e.g. the owner's own voice) instead of the built-in voice
  const rec = AUDIO && ['m4a', 'wav', 'aiff', 'mp3'].map((x) => path.join(AUDIO, `${s.id}.${x}`)).find((f) => fs.existsSync(f));
  const timed = AUDIO && fs.existsSync(path.join(AUDIO, s.id + '.json'));   // timed narration is already trimmed: keep its timing
  if (rec) ff(['-i', rec, '-af', (timed ? '' : 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,') + 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '1', aiff]);
  else execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', aiff, speak(s.text)]);
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
  const over = s.card ? CARD_HTML : s.team ? TEAM_HTML : s.strip ? STRIP_HTML : '';
  if (over) await p.evaluate((h) => document.body.insertAdjacentHTML('beforeend', h), over);
  if (NASA_HTML) await p.evaluate((h) => document.body.insertAdjacentHTML('beforeend', h), NASA_HTML);
  await p.evaluate((lower) => { if (lower) { const l = document.createElement('div'); l.className = 'pfv-low'; l.textContent = lower; document.body.appendChild(l); } }, s.lower);
  await p.waitForTimeout(900);   // the recording starts a little before t0: settle so the cut never shows the page before the card/label
  await p.evaluate(({ caps, lead }) => {
    const c = document.createElement('div'); c.className = 'pfv-cap'; document.body.appendChild(c);
    for (const q of caps) setTimeout(() => { c.textContent = q.t; c.classList.add('on'); }, (lead + q.s) * 1000);
    setTimeout(() => c.classList.remove('on'), (lead + caps[caps.length - 1].e) * 1000 + 250);
  }, { caps: cues(s, a), lead: LEAD });
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
// captions file with the same timing as the burned-in captions
const ts = (x) => new Date(x * 1000).toISOString().slice(11, 23).replace('.', ',');
let t = 0, n = 0; const srt = [];
for (const s of SEGMENTS) {
  const a = dur(path.join(work, s.id + '.aiff'));
  for (const c of cues(s, a)) srt.push(`${++n}\n${ts(t + LEAD + c.s)} --> ${ts(t + LEAD + c.e)}\n${c.t}\n`);
  t += LEAD + a + PAD + (s.extra || 0);
}
fs.writeFileSync(out.replace(/\.mp4$/, '.srt'), srt.join('\n'));
console.log(JSON.stringify({ out, bytes: fs.statSync(out).size, seconds: +t.toFixed(1) }));
