// Builds the Space Apps pitch video from the LIVE site: scripted screen recordings + narration + burned-in captions.
// Usage (from parallax_app/):  FFMPEG=/path/to/ffmpeg node scripts/video/make_video.mjs <work dir> [--only=s05,s06] [--short] [--audio=<dir of sNN.wav>] [--voice=Daniel] [--rate=165]
// Team and project logos come from <repo>/branding/*.svg. Writes <out>.mp4 and a matching <out>.srt.
// Needs: Brave (headless, via Playwright), macOS `say`, an ffmpeg with libx264 + aac. Every number spoken is in
// scripts/video/SCRIPT.md with its source in the snapshot. Nothing here is simulated: all footage is the real app.
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
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
const PAD = process.argv.includes('--short') ? 0 : 0.55, LEAD = process.argv.includes('--short') ? 0.25 : 0.35;
const XF = 0.25;   // --short: crossfade between shots; each shot has a fixed slot so the beats land on the guide's marks
fs.mkdirSync(work, { recursive: true });
const BRAND = path.join(path.dirname(new URL(import.meta.url).pathname), '../../../branding');
const logo = (f) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(BRAND, f)).toString('base64');
const TEAM = ['Tuasin Taj Fiha', 'Afifa Asif', 'Md Abu Ammar', 'Kausar Ahmed', 'Sabiha Akter'];
// team photos (backgrounds removed) and the Space Apps logo live in <repo>/video/assets, which is not committed
const ASSETS = path.join(BRAND, '../video/assets');
const png = (f) => { const p = path.join(ASSETS, f); return fs.existsSync(p) ? 'data:image/png;base64,' + fs.readFileSync(p).toString('base64') : ''; };
const photo = (n) => png(n.toLowerCase().replace(/\s+/g, '-') + '.png');
const SPACE_APPS = png('space-apps-logo.png');   // original colours, unmodified (NASA branding may not be altered)
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

// --short: the 30-second promo. Captured frame by frame on a paused page clock (see captureStepped), so every shot is a
// smooth 30 fps whatever the machine. `shot` starts the motion and returns timed events ({ at: seconds, fn }).
// *word* in a line is highlighted in the subtitles (and not spoken differently).
const clickText = (p, sel, text) => p.locator(sel, { hasText: text }).first().evaluate((el) => el.click()).catch(() => {});
const glide = (p, from, to, ms) => p.evaluate(({ from, to, ms }) => {   // non-blocking eased scroll on the page clock
  const t0 = performance.now(); const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); window.scrollTo(0, from + (to - from) * ease(k)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}, { from, to, ms });
const SHORT = [   // beats from the Space Apps "30 Seconds of Glory" guide: 0:00 introduce, 0:02 lead in, 0:05 name, 0:10 describe, 0:20 future
  { id: 'q1', slot: 2.2, start: '#/live' + q, overlay: 'intro',
    text: 'We’re *Team Lumos*, from Dhaka.',
    prep: async (p) => { await earthReady(p); await tryClick(p, 'button:has-text("Whole Earth")', 3500); },
    shot: async () => [] },
  { id: 'q2', slot: 3.3, start: '#/live' + q, overlay: 'hook',
    text: 'In *2012*, fire counts jumped *five-fold*.',
    prep: async (p) => { await earthReady(p); await tryClick(p, 'button:has-text("Whole Earth")', 3500); },
    shot: async () => [{ at: 0.6, fn: (p) => clickText(p, 'button', 'Bangladesh') }] },
  { id: 'q3', slot: 5.0, start: '', overlay: 'name',
    text: 'Meet *Parallax Fire*. That jump? Mostly a *sharper camera*, not more fire.',
    prep: async (p) => { const s = await sectionSpan(p, '#jump'); const y0 = s.top + (s.h - s.vh) * 0.35; await p.evaluate((y) => window.scrollTo(0, y), y0); await p.waitForTimeout(2500); return { y0, y1: s.top + (s.h - s.vh) * 0.7 }; },
    shot: async (p, { total, state }) => { await glide(p, state.y0, state.y1, total * 1000); return []; } },
  { id: 'q4', slot: 3.4, start: '#/sensors' + q,
    text: 'Flip one switch: *25 years*, one fair scale.',
    prep: async (p) => { await p.waitForTimeout(2500); await p.evaluate(() => document.querySelector('[data-chart="compare"]')?.scrollIntoView({ block: 'center' })); await p.waitForTimeout(800); },
    shot: async (p, { cues }) => [{ at: LEAD + (cues[1] ? cues[1].s : 0.9) - 0.15, fn: (p) => clickText(p, 'button', 'On one scale') }] },
  { id: 'q5', slot: 2.9, start: '#/map' + q,
    text: 'Every *district*, every season, mapped.',
    prep: async (p) => {
      await p.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 60000 });
      await tryClick(p, 'button:has-text("Districts")', 2500);
      await p.evaluate(() => document.querySelector('.maplibregl-canvas')?.scrollIntoView({ block: 'center' }));
      const A = { center: [90.3, 23.75], zoom: 5.95, pitch: 0, bearing: 0 }, B = { center: [90.45, 23.95], zoom: 6.85, pitch: 50, bearing: -16 };
      for (const v of [B, A]) {   // visit the end view first so its tiles are cached, then start from the wide view
        await p.evaluate((v) => window.__map.jumpTo(v), v);
        await p.waitForFunction(() => window.__map.loaded() && window.__map.areTilesLoaded(), null, { timeout: 20000 }).catch(() => {});
        await p.waitForTimeout(900);
      }
      return { B };
    },
    shot: async (p, { total, state }) => { await p.evaluate(({ B, ms }) => window.__map.easeTo({ ...B, duration: ms, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) }), { B: state.B, ms: total * 1000 }); return []; } },
  { id: 'q6', slot: 3.1, start: '#/live' + q,
    text: 'Plus today’s NASA *hot spots*, live.',
    prep: async (p) => { await earthReady(p); await tryClick(p, 'button:has-text("Bangladesh")', 3500); },
    shot: async () => [{ at: 0.3, fn: (p) => clickText(p, 'button', 'Whole Earth') }] },   // pull back to reveal the whole Earth
  { id: 'q7', slot: 5.3, start: '#/live' + q, label: 'What’s next',
    text: 'Next: every country, newer satellites, a *Bangla* app: real fire, not a new camera.',
    prep: async (p) => { await earthReady(p); await tryClick(p, 'button:has-text("California")', 3500); },
    shot: async () => [{ at: 0.4, fn: (p) => clickText(p, 'button', 'New South Wales') }] },   // sweep across the globe
  { id: 'q8', slot: 3.7, start: '', overlay: 'card',
    text: '*Parallax Fire*, by Team Lumos.',
    prep: async (p) => { await p.waitForTimeout(500); },
    shot: async () => [] },
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
const MUSIC_CREDIT = arg('music', '') ? 'Music: “Voltaic” Kevin MacLeod (incompetech.com), licensed under CC BY 4.0.' : '';
const SHORT_CARD_HTML = `
<div class="pfv-card"><div>
  <img class="pfv-logo pfv-up" style="animation-delay:.05s" src="${logo('parallax-fire-logo.svg')}" alt="Parallax Fire">
  <div class="pfv-u pfv-up" style="animation-delay:.45s">parallaxfire.netlify.app</div>
  <div class="pfv-c pfv-up" style="animation-delay:.8s"><img src="${logo('lumos-team-logo.svg')}" alt="Team Lumos" style="height:44px;display:block;margin:0 auto 8px">M Al Shahriar Hameem (team lead) · ${TEAM.join(' · ')}</div>
  <div class="pfv-k pfv-up" style="animation-delay:1.1s;margin:24px 0 0">NASA SPACE APPS CHALLENGE 2026 · HARMONIZATION OF MODIS AND VIIRS HOT SPOTS</div>
  <div class="pfv-d pfv-up" style="animation-delay:1.25s">Data: NASA FIRMS (MODIS, VIIRS) · NASA GIBS · CelesTrak. A hot spot is a satellite detection, not a confirmed wildfire.<br>Narration: AI-generated voice (Kokoro TTS). ${MUSIC_CREDIT}</div>
</div></div>`;
const INTRO_HTML = `<div class="pfv-hook pfv-intro"><div><img src="${logo('lumos-team-logo.svg')}" alt="Team Lumos"><span>M Al Shahriar Hameem (team lead) · ${TEAM.join(' · ')}</span><small>NASA SPACE APPS CHALLENGE 2026 · HARMONIZATION OF MODIS AND VIIRS HOT SPOTS</small></div></div>`;
const NAME_HTML = `<div class="pfv-hook pfv-name"><div><img src="${logo('parallax-fire-logo.svg')}" alt="Parallax Fire"></div></div>`;
const HOOK_HTML = `<div class="pfv-hook"><div><b>2012</b><i>×5</i><span>fire detections over Bangladesh</span></div></div>`;
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
.pfv-up{opacity:0;transform:translateY(18px);animation:pfvIn .7s cubic-bezier(.2,.7,.2,1) forwards}
.pfv-cap em{font-style:normal;color:#FCD34D}
.pfv-cap.big{font:800 31px/1.22 Inter,system-ui,-apple-system,sans-serif;letter-spacing:-.005em;padding:12px 26px;border-radius:14px;bottom:34px;background:rgba(6,10,20,.80);backdrop-filter:blur(6px);transition:opacity .14s}
.pfv-hook{position:fixed;inset:0;z-index:2147483644;display:grid;place-items:center;pointer-events:none;background:radial-gradient(640px 380px at 50% 46%,rgba(5,8,16,.78),rgba(5,8,16,0) 75%);animation:pfvHook 2.9s ease forwards}
.pfv-hook>div{text-align:center;color:#F4F7FB;font-family:Inter,system-ui,sans-serif;transform-origin:50% 60%;animation:pfvPunch 2.9s cubic-bezier(.2,.8,.2,1) forwards}
.pfv-hook b{display:block;font-size:150px;font-weight:900;line-height:.9;letter-spacing:-.04em}
.pfv-hook i{display:block;font-style:normal;font-size:96px;font-weight:900;line-height:1;background:linear-gradient(90deg,#FCD34D,#F97316 55%,#EF4444);-webkit-background-clip:text;background-clip:text;color:transparent}
.pfv-hook span{display:block;margin-top:10px;font:700 15px ui-monospace,Menlo,monospace;letter-spacing:.2em;text-transform:uppercase;color:#DCE4F0}
@keyframes pfvHook{0%{opacity:0}10%{opacity:1}72%{opacity:1}100%{opacity:0}}
.pfv-intro{animation:pfvIntro 2.45s ease forwards;background:radial-gradient(760px 300px at 50% 47%,rgba(5,8,16,.9),rgba(5,8,16,.35) 80%)}.pfv-intro>div{animation:pfvPunch 2.45s cubic-bezier(.2,.8,.2,1) forwards}
.pfv-intro img{height:120px;display:block;margin:0 auto 14px}.pfv-intro span{display:block;margin-top:4px;font:600 17px Inter,system-ui,sans-serif;color:#F4F7FB;letter-spacing:.01em;text-transform:none}
.pfv-intro small{display:block;margin-top:10px;font:700 11.5px ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#FCD34D}
.pfv-name{animation:pfvIntro 2.6s ease forwards;background:radial-gradient(1200px 700px at 70% 20%,#12233f 0%,#0B1220 55%,#070b14 100%)}.pfv-name>div{animation:pfvPunch 2.6s cubic-bezier(.2,.8,.2,1) forwards}.pfv-name img{width:720px}
@keyframes pfvIntro{0%{opacity:0}8%{opacity:1}84%{opacity:1}100%{opacity:0}}
@keyframes pfvPunch{0%{transform:scale(1.25);filter:blur(8px)}14%{transform:scale(1);filter:blur(0)}100%{transform:scale(.94)}}
.pfv-nasa{position:fixed;top:12px;right:16px;height:66px;z-index:2147483647;padding:5px;background:#fff;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.45)}`;

const CHUNK = IS_SHORT ? 46 : 78;
const chunks = (t) => { // caption chunks (about one line), cut at sentence or comma boundaries
  const out = []; let cur = '';
  for (const part of t.split(/(?<=[.?!:,])\s+/)) { if ((cur + ' ' + part).trim().length > CHUNK && cur) { out.push(cur.trim()); cur = part; } else cur = (cur + ' ' + part).trim(); }
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
// Frame-by-frame capture: the page clock (Date, timers, requestAnimationFrame) is paused and stepped 1/30 s per frame,
// CSS animations are slowed to match, and each screenshot is piped to ffmpeg. Smooth 30 fps on any machine.
async function captureStepped(s, a, total, aiff, mp4) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: 'dark' });
  await ctx.addInitScript(() => { try { localStorage.setItem('parallax-theme', 'dark'); localStorage.setItem('parallax.tour.v1', 'done'); } catch { /* private mode */ } });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  await p.clock.install();
  await p.goto(BASE + (s.start || '?notour'), { waitUntil: 'load' });
  await p.waitForTimeout(s.start ? 4500 : 6500);
  await p.addStyleTag({ content: OVERLAY_CSS });
  const state = await s.prep(p);
  for (const ahead of [3000, 8000, 20000]) {   // a busy page can run past a near target: retry further ahead
    try { await p.clock.pauseAt(await p.evaluate((x) => Date.now() + x, ahead)); break; } catch (e) { if (ahead === 20000) throw e; }
  }
  const cdp = await ctx.newCDPSession(p); await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.17 });
  if (s.overlay !== 'card') await p.addStyleTag({ content: `#root{transform-origin:50% 45%;animation:pfvKen ${total.toFixed(2)}s linear forwards}@keyframes pfvKen{from{transform:scale(1)}to{transform:scale(1.05)}}` });   // slow push-in keeps every shot moving
  const over = ({ card: SHORT_CARD_HTML, hook: HOOK_HTML, intro: INTRO_HTML, name: NAME_HTML }[s.overlay] || '') + NASA_HTML
    + (s.label ? `<div class="pfv-low pfv-up">${s.label}</div>` : '');
  if (over) await p.evaluate((h) => document.body.insertAdjacentHTML('beforeend', h), over);
  const cs = cues(s, a);
  await p.evaluate(({ caps, lead }) => {
    const c = document.createElement('div'); c.className = 'pfv-cap big'; document.body.appendChild(c);
    const html = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    for (const q of caps) setTimeout(() => { c.innerHTML = html(q.t); c.classList.add('on'); }, (lead + q.s) * 1000);
    setTimeout(() => c.classList.remove('on'), (lead + caps[caps.length - 1].e) * 1000 + 200);
  }, { caps: cs, lead: LEAD });
  await p.waitForTimeout(300);   // let images in the overlays decode
  const events = (await s.shot(p, { total, state, cues: cs })) || [];
  const L = Math.round(LEAD * 1000);
  const enc = spawn(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-i', aiff,
    '-filter_complex', `[0:v]format=yuv420p[v];[1:a]adelay=${L}|${L},apad,aresample=48000[a]`, '-map', '[v]', '-map', '[a]', '-t', total.toFixed(3),
    '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = once(enc, 'close');
  const N = Math.round(total * 30); let t = Date.now();
  for (let i = 0; i < N; i++) {
    for (const e of events) if (!e.done && i / 30 >= e.at) { e.done = true; await e.fn(p); }
    const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!enc.stdin.write(buf)) await once(enc.stdin, 'drain');
    await p.clock.runFor(i % 3 === 2 ? 34 : 33);
    if (i % 10 === 9) { const ms = (Date.now() - t) / 10; t = Date.now(); await cdp.send('Animation.setPlaybackRate', { playbackRate: Math.min(1, 33.3 / ms) }); }
  }
  enc.stdin.end(); await done; await ctx.close();
  return { id: s.id, audio_s: +a.toFixed(2), total_s: +total.toFixed(2), frames: N, errs };
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
  const VOICE_FX = IS_SHORT   // promo: tighter, brighter, louder (YouTube level)
    ? 'highpass=f=80,acompressor=threshold=-20dB:ratio=3.5:attack=4:release=60:makeup=2,equalizer=f=3200:t=q:w=1.2:g=2.5,loudnorm=I=-14:TP=-1:LRA=6'
    : 'loudnorm=I=-16:TP=-1.5:LRA=11';
  if (rec) ff(['-i', rec, '-af', (timed ? '' : 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,') + VOICE_FX, '-ar', '48000', '-ac', '1', aiff]);
  else execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', aiff, speak(s.text)]);
  const a = dur(aiff);
  const total = IS_SHORT ? s.slot + (s === SEGMENTS[SEGMENTS.length - 1] ? 0 : XF) : LEAD + a + PAD + (s.extra || 0);
  if (IS_SHORT && LEAD + a + 0.15 > s.slot) throw new Error(`${s.id}: narration ${a.toFixed(2)} s does not fit its ${s.slot} s slot; shorten the line`);
  if (IS_SHORT) { report.push(await captureStepped(s, a, total, aiff, mp4)); console.log(JSON.stringify(report[report.length - 1])); continue; }
  const vdir = path.join(work, s.id + '_raw'); fs.rmSync(vdir, { recursive: true, force: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: vdir, size: { width: W, height: H } }, colorScheme: 'dark' });
  await ctx.addInitScript(() => { try { localStorage.setItem('parallax-theme', 'dark'); localStorage.setItem('parallax.tour.v1', 'done'); } catch { /* private mode */ } });
  const p = await ctx.newPage(); const t0 = Date.now(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  await p.goto(BASE + (s.start || '?notour'), { waitUntil: 'load' });
  await p.waitForTimeout(s.start ? 4500 : 6500);
  await p.addStyleTag({ content: OVERLAY_CSS });
  const state = await s.prep(p);
  const over = s.card ? CARD_HTML : s.team ? TEAM_HTML : '';
  if (over) await p.evaluate((h) => document.body.insertAdjacentHTML('beforeend', h), over);
  if (NASA_HTML) await p.evaluate((h) => document.body.insertAdjacentHTML('beforeend', h), NASA_HTML);
  await p.evaluate((lower) => { if (lower) { const l = document.createElement('div'); l.className = 'pfv-low'; l.textContent = lower; document.body.appendChild(l); } }, s.lower);
  await p.waitForTimeout(900);   // the recording starts a little before t0: settle so the cut never shows the page before the card/label
  await p.evaluate(({ caps, lead }) => {
    const c = document.createElement('div'); c.className = 'pfv-cap'; document.body.appendChild(c);
    const html = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    for (const q of caps) setTimeout(() => { c.innerHTML = html(q.t); c.classList.add('on'); }, (lead + q.s) * 1000);
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
if (IS_SHORT) {   // promo: crossfade the shots on the slot grid, place each line on the same grid, duck the music under the voice
  const starts = []; let acc = 0; for (const s of SEGMENTS) { starts.push(acc); acc += s.slot; }
  const T = acc, n = SEGMENTS.length, g = [];
  let v = '[0:v]';
  for (let i = 1; i < n; i++) { g.push(`${v}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${starts[i].toFixed(3)}[v${i}]`); v = `[v${i}]`; }
  g.push(`${v}fade=t=in:st=0:d=0.3,fade=t=out:st=${(T - 0.6).toFixed(3)}:d=0.6,format=yuv420p[vo]`);
  SEGMENTS.forEach((s, i) => { const d = Math.round((starts[i] + LEAD) * 1000); g.push(`[${n + i}:a]aresample=48000,adelay=${d}|${d}[l${i}]`); });
  g.push(`${SEGMENTS.map((_, i) => `[l${i}]`).join('')}amix=inputs=${n}:normalize=0,apad,atrim=0:${T.toFixed(3)},aformat=channel_layouts=stereo[voice]`);
  const MUSIC = arg('music', ''), MS = +arg('music-start', '0');
  const inputs = [...SEGMENTS.flatMap((s) => ['-i', path.join(work, s.id + '.mp4')]), ...SEGMENTS.flatMap((s) => ['-i', path.join(work, s.id + '.aiff')])];
  if (MUSIC) {
    inputs.push('-i', MUSIC);
    g.push(`[voice]asplit[vx][vk]`, `[${2 * n}:a]aresample=48000,atrim=${MS}:${(MS + T).toFixed(3)},asetpts=PTS-STARTPTS,volume=${arg('music-gain', '0.85')},afade=t=in:st=0:d=0.3,afade=t=out:st=${(T - 1.4).toFixed(3)}:d=1.4[mus]`,
      `[mus][vk]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=280[duck]`, `[vx][duck]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[ao]`);
  } else g.push(`[voice]loudnorm=I=-14:TP=-1.5:LRA=9[ao]`);
  ff([...inputs, '-filter_complex', g.join(';'), '-map', '[vo]', '-map', '[ao]', '-t', T.toFixed(3),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart',
    '-metadata', 'title=Parallax Fire - Team Lumos - NASA Space Apps Challenge 2026',
    '-metadata', `comment=Narration is AI-generated (Kokoro-82M text-to-speech). Footage is a screen capture of the real app at https://parallaxfire.netlify.app.${MUSIC ? ' Music: "Voltaic" Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0, http://creativecommons.org/licenses/by/4.0/' : ''}`, out]);
  console.log(JSON.stringify({ starts: Object.fromEntries(SEGMENTS.map((s, i) => [s.id, +starts[i].toFixed(2)])), total: +T.toFixed(2) }));
} else ff(['-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out]);
// captions file with the same timing as the burned-in captions
const ts = (x) => new Date(x * 1000).toISOString().slice(11, 23).replace('.', ',');
let t = 0, n = 0; const srt = [];
for (const s of SEGMENTS) {
  const a = dur(path.join(work, s.id + '.aiff'));
  for (const c of cues(s, a)) srt.push(`${++n}\n${ts(t + LEAD + c.s)} --> ${ts(t + LEAD + c.e)}\n${c.t.replace(/\*/g, '')}\n`);
  t += IS_SHORT ? s.slot : LEAD + a + PAD + (s.extra || 0);
}
fs.writeFileSync(out.replace(/\.mp4$/, '.srt'), srt.join('\n'));
console.log(JSON.stringify({ out, bytes: fs.statSync(out).size, seconds: +t.toFixed(2) }));
