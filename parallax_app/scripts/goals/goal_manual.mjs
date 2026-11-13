// Goal: the app is plain (explanations live in the PDF manual), and the manual exists with real numbers.
import { launch, watch, finish, BASE } from './_brave.mjs';
import fs from 'node:fs';
const fails = [], errs = [];
const M = JSON.parse(fs.readFileSync(new URL('../../apps/web/public/data/parallax-20261010T190934Z-ce88f489/metrics.json', import.meta.url)));
const html = (() => { try { return fs.readFileSync(new URL('../../docs/manual/manual.html', import.meta.url), 'utf8'); } catch { return ''; } })();
if (html.length < 8000) fails.push('docs/manual/manual.html missing or too short (the PDF must be generated from it)');
const fmt = (v) => Math.round(v).toLocaleString('en-US');
for (const [k, r] of Object.entries(M.release.regions)) for (const v of [r.test_aoi_month_mae.selected, r.test_aoi_month_mae.B0_identity, r.test_aoi_month_mae.B0_month_ratio])
  if (!html.includes(fmt(v))) fails.push(`manual does not show ${k} result ${fmt(v)} from metrics.json`);
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 760 } }); const p = await ctx.newPage(); watch(p, errs);
// (the PDF is fetched below from inside the app page, same origin)
await p.goto(BASE + '#/calendar?aoi=BGD&y=2024&m=3&notour=1', { waitUntil: 'load' }); await p.waitForTimeout(3000);
const pdf2 = await p.evaluate(async () => { const r = await fetch('Parallax-Fire-Manual.pdf'); const buf = new Uint8Array(await r.arrayBuffer()); return { s: r.status, n: buf.length, head: String.fromCharCode(...buf.slice(0, 5)) }; });
if (!pdf2 || pdf2.s !== 200 || pdf2.head !== '%PDF-' || pdf2.n < 80000) fails.push(`manual PDF not served properly: ${JSON.stringify(pdf2)}`);
const PROSE_CAP = 70;
for (const r of ['calendar', 'map', 'sensors', 'live', 'method', 'data']) {
  await p.goto(BASE + `#/${r}?aoi=BGD&y=2024&m=3&notour=1`, { waitUntil: 'load' }); await p.waitForTimeout(r === 'live' || r === 'map' ? 6000 : 3500);
  const s = await p.evaluate(() => {
    const m = document.querySelector('main[data-page]'); if (!m) return null;
    let words = 0; const seen = [];
    for (const e of m.querySelectorAll('p, li, dd, .lede, figcaption')) {
      if (e.closest('[data-chart], table, details, nav, [data-earth], .maplibregl-map, [role="tooltip"]')) continue;
      const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden') continue;
      const t = e.innerText.trim(); if (!t || e.querySelector('p, li')) continue;
      words += t.split(/\s+/).length; seen.push(t.slice(0, 50));
    }
    const link = [...document.querySelectorAll('[data-manual-link]')].some((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && /Parallax-Fire-Manual\.pdf/.test(a.getAttribute('href') || ''); });
    return { words, seen: seen.slice(0, 6), link };
  });
  if (!s) { fails.push(`#/${r}: no page`); continue; }
  if (s.words > PROSE_CAP) fails.push(`#/${r}: ${s.words} words of explanation on screen (cap ${PROSE_CAP}; move detail to the manual). First lines: ${JSON.stringify(s.seen)}`);
  if (!s.link) fails.push(`#/${r}: no visible [data-manual-link] to Parallax-Fire-Manual.pdf`);
}
await b.close();
finish('manual', [...new Set(fails)].concat([...new Set(errs)]));
