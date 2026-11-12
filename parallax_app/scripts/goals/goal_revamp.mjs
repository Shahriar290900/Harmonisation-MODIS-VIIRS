// Goal: the revamped multi-page experience (docs/REVAMP_SPEC.md) works at the owner's real viewport sizes.
// Usage: node scripts/goals/goal_revamp.mjs [shots dir] [--routes=calendar,map,...] [--live]
import { launch, watch, finish, BASE } from './_brave.mjs';
import fs from 'node:fs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
const wantLive = process.argv.includes('--live');
const ROUTES = (arg('routes') || 'calendar,map,sensors,method,data').split(',').concat(wantLive ? ['live'] : []);
const SEL = '?aoi=BGD&y=2024&m=3&notour=1';
const BANNED = [/\bAOI\b/, /\bbackcast/i, /validated[_ ]calibration/i, /observed[_ ]comparison/i, /ui[_ ]prototype/i, /\bB0_|\bB1_|\bB2_|\bD1_/, /Poisson deviance/i, /\bval split\b/i, /\btrain split\b/i, /\btest split\b/i,
  /lorem ipsum/i, /coming soon/i, /placeholder/i, /\bTODO\b/, /sample data/i, /mock/i, /forecast/i, /\bpredict/i, /early warning/i];
const fails = [], errs = [];
const b = await launch();
for (const vp of [{ w: 1440, h: 760, tag: 'laptop' }, { w: 1280, h: 680, tag: 'small-laptop' }, { w: 390, h: 844, tag: 'phone' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
  const p = await ctx.newPage(); watch(p, errs, vp.tag + ' ');
  for (const r of ROUTES) {
    const tag = `${vp.tag} #/${r}`;
    await p.goto(BASE + '#/' + r + SEL, { waitUntil: 'load' }); await p.waitForTimeout(r === 'live' || r === 'map' ? 7000 : 4500);
    const s = await p.evaluate(({ r }) => {
      const main = document.querySelector(`main[data-page="${r}"]`);
      const nav = document.querySelector('nav[data-nav]');
      const vis = (e) => { const c = getComputedStyle(e); const q = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && q.width > 0 && q.height > 0; };
      const charts = [...document.querySelectorAll('[data-chart]')].filter(vis).map((e) => {
        e.scrollIntoView({ block: 'center' });
        const q = e.getBoundingClientRect();
        const probe = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (e.contains(t) || t.contains(e)); };
        return { name: e.getAttribute('data-chart'), w: Math.round(q.width), h: Math.round(q.height), inView: q.top >= -1 && q.bottom <= innerHeight + 1 || q.height > innerHeight, bottomVisible: q.height > innerHeight || probe(q.left + q.width / 2, Math.min(innerHeight - 2, q.bottom - 6)), marks: e.querySelectorAll('path, rect, circle, line').length };
      });
      window.scrollTo(0, 0);
      const g = document.querySelector('[data-cal-grid]'), l = document.querySelector('[data-cal-legend]');
      return { hasMain: !!main, h1: main ? main.querySelectorAll('h1').length : 0, text: main ? main.innerText : '', navLinks: nav ? [...nav.querySelectorAll('a[data-route]')].filter(vis).map((a) => a.getAttribute('data-route')) : [],
        sw: document.documentElement.scrollWidth, iw: innerWidth, charts,
        cal: g && l ? { gridBottom: g.getBoundingClientRect().bottom, legendTop: l.getBoundingClientRect().top } : null,
        stuck: main ? /\bLoading\b/.test(main.innerText) : false,
        mapCanvas: !!document.querySelector('.maplibregl-canvas'), liveCount: document.querySelector('[data-live-count]')?.textContent || null };
    }, { r });
    if (!s.hasMain) { fails.push(`${tag}: no <main data-page="${r}">`); continue; }
    if (s.h1 !== 1) fails.push(`${tag}: expected exactly one <h1>, found ${s.h1}`);
    if (s.navLinks.length < (vp.w < 700 ? 4 : 6)) fails.push(`${tag}: nav shows only ${s.navLinks.length} links (${s.navLinks.join(',')})`);
    if (s.sw > s.iw + 1) fails.push(`${tag}: horizontal overflow (${s.sw} > ${s.iw})`);
    if (s.stuck) fails.push(`${tag}: still shows "Loading" after the wait`);
    if (s.text.trim().length < 120) fails.push(`${tag}: page has almost no content`);
    for (const re of BANNED) { const m = s.text.match(re); if (m) fails.push(`${tag}: jargon/placeholder word in visible text: "${m[0]}" (move technical terms into a closed <details> or a tooltip)`); }
    const minH = vp.w < 700 ? 220 : 280;
    for (const c of s.charts) {
      if (c.h < minH) fails.push(`${tag}: chart "${c.name}" is ${c.h}px tall (min ${minH})`);
      if (!c.bottomVisible) fails.push(`${tag}: chart "${c.name}" is clipped (its bottom edge is hidden)`);
      if (c.marks < 8) fails.push(`${tag}: chart "${c.name}" has no drawn data (${c.marks} marks)`);
    }
    if ((r === 'sensors' || r === 'calendar') && s.charts.length === 0) fails.push(`${tag}: no [data-chart] on this page`);
    if (r === 'calendar') { if (!s.cal) fails.push(`${tag}: calendar grid/legend markers missing`); else if (s.cal.gridBottom > s.cal.legendTop + 1) fails.push(`${tag}: calendar rows overlap the legend by ${Math.round(s.cal.gridBottom - s.cal.legendTop)}px`); }
    if ((r === 'map' || r === 'live') && !s.mapCanvas) fails.push(`${tag}: no map canvas`);
    if (r === 'live' && !(s.liveCount && /\d/.test(s.liveCount))) fails.push(`${tag}: [data-live-count] shows no number (live feed not rendered)`);
    if (out) { fs.mkdirSync(out, { recursive: true }); await p.screenshot({ path: `${out}/${vp.tag}-${r}.png` }); }
  }
  // navigation really works: click every nav link from the calendar page and land on its page
  await p.goto(BASE + '#/calendar' + SEL, { waitUntil: 'load' }); await p.waitForTimeout(3500);
  for (const r of ROUTES) {
    const link = p.locator(`nav[data-nav] a[data-route="${r}"]`).first();
    if (!(await link.isVisible().catch(() => false))) continue;   // may live under "More" on phones
    await link.click(); await p.waitForTimeout(1500);
    const ok = await p.evaluate((rr) => !!document.querySelector(`main[data-page="${rr}"]`) && location.hash.includes('aoi=BGD'), r);
    if (!ok) fails.push(`${vp.tag}: clicking nav "${r}" did not open its page or lost the selected place from the URL`);
  }
  // legacy deep link
  await p.goto(BASE + '#aoi=USA-CA&y=2020&m=9&notour=1', { waitUntil: 'load' }); await p.waitForTimeout(3500);
  if (!(await p.evaluate(() => !!document.querySelector('main[data-page="calendar"]')))) fails.push(`${vp.tag}: legacy link #aoi=... does not open the Calendar page`);
  await ctx.close();
}
await b.close();
finish('revamp', [...new Set(fails)].concat([...new Set(errs)]));
