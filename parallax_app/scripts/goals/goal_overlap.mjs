// Goal: no overlapping words anywhere. Checks every page at 3 sizes x 2 themes by measuring the actual text boxes
// (DOM text + SVG text) and reporting pairs that overlap while both are visible on top.
// Usage: node scripts/goals/goal_overlap.mjs [shots dir] [--docs=<dir>]   (--docs saves a small screenshot set for the README)
import { launch, watch, finish, BASE } from './_brave.mjs';
import fs from 'node:fs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
const docs = (process.argv.find((a) => a.startsWith('--docs=')) || '').split('=')[1];
const PAGES = [['home', '?notour', [0, 1600, 4200, 7200]], ['story', '#/story?aoi=BGD&y=2024&m=3&notour=1', [0]], ['calendar', '#/calendar?aoi=BGD&y=2024&m=3&notour=1', [0, 500]],
  ['map', '#/map?aoi=BGD&y=2024&m=3&notour=1', [0, 400]], ['sensors', '#/sensors?aoi=BGD&y=2024&m=3&notour=1', [0, 600]], ['live', '#/live?aoi=BGD&y=2024&m=3&notour=1', [0, 500]],
  ['results', '#/method?aoi=BGD&y=2024&m=3&notour=1', [0, 600]], ['data', '#/data?aoi=BGD&y=2024&m=3&notour=1', [0, 600]]];
const fails = [], errs = [];
const b = await launch();
for (const vp of [{ w: 1440, h: 760, tag: 'laptop' }, { w: 1280, h: 680, tag: 'small' }, { w: 390, h: 844, tag: 'phone' }]) for (const theme of ['dark', 'light']) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem('parallax-theme', t); localStorage.setItem('parallax.tour.v1', 'done'); } catch { /* */ } }, theme);
  const p = await ctx.newPage(); watch(p, errs, `${vp.tag}/${theme} `);
  for (const [name, url, ys] of PAGES) {
    await p.goto(BASE + url, { waitUntil: 'load' }); await p.waitForTimeout(name === 'live' || name === 'map' || name === 'home' ? 7000 : 4000);
    for (const y of ys) {
      await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(y ? 1600 : 300);
      const hits = await p.evaluate(() => {
        const boxes = [];
        const vis = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.15) return false; } return true; };
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim().length > 1 ? 1 : 2) });
        for (let n = w.nextNode(); n && boxes.length < 2500; n = w.nextNode()) {
          const el = n.parentElement; if (!el || el.closest('script,style,noscript,.lx-sr,.sr-only,.live__sr,[aria-hidden="true"] .sr-only')) continue;
          if (!vis(el)) continue;
          const r = document.createRange(); r.selectNodeContents(n);
          // clip by every scrolling/clipping ancestor: text scrolled out of view inside a panel is not on screen
          const clips = []; for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const c = getComputedStyle(e); if (c.overflowX !== 'visible' || c.overflowY !== 'visible') { const z = e.getBoundingClientRect(); clips.push(z); } }
          for (const q0 of r.getClientRects()) {
            let q = { l: q0.left, t: q0.top, r: q0.right, b: q0.bottom };
            for (const z of clips) q = { l: Math.max(q.l, z.left), t: Math.max(q.t, z.top), r: Math.min(q.r, z.right), b: Math.min(q.b, z.bottom) };
            if (q.r - q.l > 2 && q.b - q.t > 4 && q.b > 0 && q.t < innerHeight && q.r > 0 && q.l < innerWidth) boxes.push({ q, el, text: n.nodeValue.trim().slice(0, 40) });
          }
        }
        const top = (b2) => { const x = (b2.q.l + b2.q.r) / 2, y = (b2.q.t + b2.q.b) / 2; const t = document.elementFromPoint(x, y); return t && (t === b2.el || b2.el.contains(t) || t.contains(b2.el)); };
        const outp = [];
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].q, c = boxes[j].q; if (boxes[i].el === boxes[j].el) continue;
          const ix = Math.min(a.r, c.r) - Math.max(a.l, c.l), iy = Math.min(a.b, c.b) - Math.max(a.t, c.t); if (ix <= 1 || iy <= 2) continue;
          const area = ix * iy, small = Math.min((a.r - a.l) * (a.b - a.t), (c.r - c.l) * (c.b - c.t));
          if (area < 0.2 * small || area < 25) continue;
          if (!top(boxes[i]) && !top(boxes[j])) continue;    // both are covered by something else: not a visible collision
          outp.push(`"${boxes[i].text}" x "${boxes[j].text}"`); if (outp.length > 6) return outp;
        }
        return outp;
      });
      for (const h of hits) fails.push(`${vp.tag}/${theme} ${name}@${y}: overlapping text ${h}`);
      const sx = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); if (sx[0] > sx[1] + 1) fails.push(`${vp.tag}/${theme} ${name}: horizontal overflow ${sx[0]} > ${sx[1]}`);
      if (out && y === ys[0]) { fs.mkdirSync(out, { recursive: true }); await p.screenshot({ path: `${out}/${vp.tag}-${theme}-${name}.jpg`, type: 'jpeg', quality: 60 }); }
      if (docs && y === ys[0] && theme === 'dark' && vp.tag !== 'small') { fs.mkdirSync(docs, { recursive: true }); await p.screenshot({ path: `${docs}/${vp.tag}-${name}.jpg`, type: 'jpeg', quality: 72 }); }
    }
  }
  await ctx.close();
}
await b.close();
finish('overlap', [...new Set(fails)].concat([...new Set(errs)]));
