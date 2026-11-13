// Goal: the "improve the app" round (docs/IMPROVE_SPEC.md) - story walkthrough, jump/one-scale switch, quick entry,
// uncertainty in words, display-style menu. Usage: node scripts/goals/goal_story.mjs [shots dir]
import { launch, watch, finish, BASE } from './_brave.mjs';
import fs from 'node:fs';
const out = process.argv[2] || '';
const SNAP = new URL('../../apps/web/public/data/parallax-20261010T190934Z-ce88f489/', import.meta.url);
const rec = (aoi, y, m) => JSON.parse(fs.readFileSync(new URL(`activity/${aoi}/${y}.json`, SNAP))).find((r) => +r.period_start_utc.slice(5, 7) === m);
const m24 = rec('BGD', 2024, 3);
const fmt = (v) => Math.round(v).toLocaleString('en-US');
const fails = [], errs = [];
const b = await launch();
for (const vp of [{ w: 1440, h: 760, tag: 'laptop' }, { w: 390, h: 844, tag: 'phone' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
  const p = await ctx.newPage(); watch(p, errs, vp.tag + ' ');
  // 1. story page: real numbers, >= 4 steps, every step reachable by a button
  await p.goto(BASE + '#/story?aoi=BGD&y=2024&m=3&notour=1', { waitUntil: 'load' }); await p.waitForTimeout(5000);
  const st = await p.evaluate(() => { const m = document.querySelector('main[data-page="story"]'); return m ? { h1: m.querySelectorAll('h1').length, steps: m.querySelectorAll('[data-story-step]').length, text: m.innerText, next: !!m.querySelector('[data-story-next]') } : null; });
  if (!st) fails.push(`${vp.tag}: no <main data-page="story">`);
  else {
    if (st.h1 !== 1) fails.push(`${vp.tag} story: expected one <h1>, found ${st.h1}`);
    if (st.steps < 4) fails.push(`${vp.tag} story: ${st.steps} [data-story-step] (need >= 4)`);
    const txt = st.text;
    let all = txt;   // walk through the steps with the next button and collect their text
    for (let i = 0; i < 8 && st.next; i++) { const more = await p.evaluate(() => { const n = document.querySelector('[data-story-next]'); if (!n || n.disabled) return null; n.click(); return true; }); if (!more) break; await p.waitForTimeout(1600); all += '\n' + (await p.evaluate(() => document.querySelector('main[data-page="story"]').innerText)); }
    for (const [what, v] of [['sharper-satellite count Mar 2024', m24.raw_viirs_reference_detections], ['older-satellite count Mar 2024', m24.raw_modis_detections], ['estimate Mar 2024', m24.estimated_viirs_reference_detections], ['likely range low', m24.estimate_interval_low], ['likely range high', m24.estimate_interval_high]])
      if (!all.includes(fmt(v))) fails.push(`${vp.tag} story: does not show the real ${what} (${fmt(v)} from the snapshot)`);
    if (!/unusually low|lowest/i.test(all)) fails.push(`${vp.tag} story: does not say March 2024 was unusually low for March (anomaly flag in the snapshot)`);
    if (!/(\[data-chart\]|data-chart)/.test(await p.evaluate(() => document.querySelector('main[data-page="story"]').innerHTML.slice(0, 400000)))) fails.push(`${vp.tag} story: no chart/calendar/map visual inside the story`);
    if (out) { fs.mkdirSync(out, { recursive: true }); await p.screenshot({ path: `${out}/${vp.tag}-story-end.png` }); }
  }
  // 2. the switch on Two satellites: toggles the chart between joined-raw and one-scale
  await p.goto(BASE + '#/sensors?aoi=BGD&y=2024&m=3&notour=1', { waitUntil: 'load' }); await p.waitForTimeout(4500);
  const sw = async () => p.evaluate(() => { const t = document.querySelector('[data-jump-toggle]'); const c = document.querySelector('[data-chart="compare"]'); return t && c ? { mode: c.getAttribute('data-mode'), pressed: t.getAttribute('aria-pressed') } : null; });
  const s0 = await sw();
  if (!s0) fails.push(`${vp.tag} sensors: no [data-jump-toggle] button or no [data-chart="compare"]`);
  else {
    await p.click('[data-jump-toggle]'); await p.waitForTimeout(900);
    const s1 = await sw();
    if (!s1 || s1.mode === s0.mode || !['raw', 'onescale'].includes(s1.mode) || !['raw', 'onescale'].includes(s0.mode)) fails.push(`${vp.tag} sensors: switch did not change data-mode between "raw" and "onescale" (${s0.mode} -> ${s1 && s1.mode})`);
    if (s1 && s1.pressed === s0.pressed) fails.push(`${vp.tag} sensors: aria-pressed did not change`);
    if (out) await p.screenshot({ path: `${out}/${vp.tag}-sensors-${s1 && s1.mode}.png` });
  }
  // 3. Home: a "pick a place" entry visible in the first screen, and the landing jump chart has the switch
  await p.goto(BASE + '?notour', { waitUntil: 'load' }); await p.waitForTimeout(5000);
  const home = await p.evaluate(() => { const e = document.querySelector('[data-quick-entry]'); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight, options: e.querySelectorAll('a,button,option').length }; });
  if (!home) fails.push(`${vp.tag} home: no [data-quick-entry] (pick a place / open a page)`);
  else if (home.bottom > home.vh || home.top < 0) fails.push(`${vp.tag} home: quick entry not fully inside the first screen (top ${Math.round(home.top)}, bottom ${Math.round(home.bottom)}, viewport ${home.vh})`);
  else if (home.options < 3) fails.push(`${vp.tag} home: quick entry offers fewer than 3 choices`);
  if (!(await p.evaluate(() => !!document.querySelector('#jump [data-jump-toggle]')))) fails.push(`${vp.tag} home: the 2012 jump chart has no [data-jump-toggle]`);
  if (out) await p.screenshot({ path: `${out}/${vp.tag}-home.png` });
  // 4. calendar: likely range in words for an estimated month; selected month not hidden under the phone bar
  await p.goto(BASE + '#/calendar?aoi=BGD&y=2008&m=3&notour=1', { waitUntil: 'load' }); await p.waitForTimeout(4500);
  const r08 = rec('BGD', 2008, 3);
  const cal = await p.evaluate(() => { const m = document.querySelector('main[data-page="calendar"]'); const sel = document.querySelector('[data-cal-grid] [aria-selected="true"], [data-cal-grid] .is-sel'); const bar = document.querySelector('nav[data-nav]'); const sr = sel?.getBoundingClientRect(), br = bar?.getBoundingClientRect(); return { text: m?.innerText || '', selBottom: sr ? sr.bottom : null, barTop: br && getComputedStyle(bar).position === 'fixed' && br.top > innerHeight / 2 ? br.top : innerHeight }; });
  if (!/likely between/i.test(cal.text) || !cal.text.includes(fmt(r08.estimate_interval_low)) || !cal.text.includes(fmt(r08.estimate_interval_high))) fails.push(`${vp.tag} calendar: March 2008 does not state its likely range in words ("likely between ${fmt(r08.estimate_interval_low)} and ${fmt(r08.estimate_interval_high)}")`);
  if (cal.selBottom == null) fails.push(`${vp.tag} calendar: selected cell not found`); else if (cal.selBottom > cal.barTop + 1) fails.push(`${vp.tag} calendar: selected month is under the bottom bar (${Math.round(cal.selBottom)} > ${Math.round(cal.barTop)})`);
  if (out) await p.screenshot({ path: `${out}/${vp.tag}-calendar.png` });
  // 5. display styles tucked into a small menu: look buttons hidden until it is opened
  await p.goto(BASE + '#/map?aoi=BGD&y=2024&m=3&notour=1', { waitUntil: 'load' }); await p.waitForTimeout(5000);
  const vis = () => p.evaluate(() => { const e = document.querySelector('[data-look="thermal"]'); if (!e) return 'missing'; const c = getComputedStyle(e), r = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 ? 'visible' : 'hidden'; });
  const v0 = await vis();
  if (v0 !== 'hidden') fails.push(`${vp.tag} map: display looks are ${v0} before opening the menu (should sit behind [data-looks-menu])`);
  try { await p.click('[data-looks-menu]', { timeout: 3000 }); await p.waitForTimeout(500); if ((await vis()) !== 'visible') fails.push(`${vp.tag} map: looks not visible after opening [data-looks-menu]`); } catch { fails.push(`${vp.tag} map: no clickable [data-looks-menu]`); }
  await ctx.close();
}
await b.close();
finish('story', [...new Set(fails)].concat([...new Set(errs)]));
