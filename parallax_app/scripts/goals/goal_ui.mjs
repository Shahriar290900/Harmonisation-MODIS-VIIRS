// Goal: UI brief exists with machine-checkable contrast pairs that pass, and no horizontal overflow at 375/768/1440.
// The brief must contain one block:  <!-- contrast-pairs
//   [{"name":"body text on bg","fg":"#E6EDF7","bg":"#0B1220","min":4.5}, ...]
// -->   (hex colours actually used by the tokens in styles/app.css, dark AND light theme pairs, >= 12 pairs)
import { launch, watch, finish, BASE } from './_brave.mjs';
import fs from 'node:fs';
const out = process.argv[2] || '';
const fails = [], errs = [];
const briefPath = new URL('../../docs/UI_DESIGN_BRIEF.md', import.meta.url);
let pairs = [];
try {
  const md = fs.readFileSync(briefPath, 'utf8');
  if (md.length < 4000) fails.push('UI_DESIGN_BRIEF.md is too thin (< 4000 chars)');
  const m = md.match(/<!--\s*contrast-pairs\s*([\s\S]*?)-->/);
  if (!m) fails.push('brief has no <!-- contrast-pairs [...] --> block'); else pairs = JSON.parse(m[1]);
} catch (e) { fails.push('cannot read brief: ' + e.message); }
const lum = (hex) => { const n = hex.replace('#', ''); const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
if (pairs.length && pairs.length < 12) fails.push(`only ${pairs.length} contrast pairs listed (need >= 12, both themes)`);
const css = fs.readFileSync(new URL('../../apps/web/src/styles/app.css', import.meta.url), 'utf8').toLowerCase();
for (const p of pairs) {
  const r = ratio(p.fg, p.bg);
  if (r < (p.min ?? 4.5)) fails.push(`contrast "${p.name}" ${p.fg} on ${p.bg} = ${r.toFixed(2)} (< ${p.min ?? 4.5})`);
  for (const h of [p.fg, p.bg]) if (!css.includes(h.toLowerCase())) fails.push(`contrast pair "${p.name}" uses ${h}, which is not a colour in styles/app.css`);
}
const b = await launch();
for (const w of [375, 768, 1440]) for (const url of ['', '#aoi=BGD&y=2024&m=3&notour=1']) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage(); watch(p, errs, `${w} `);
  await p.goto(BASE + url, { waitUntil: 'load' }); await p.waitForTimeout(4000);
  const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  if (o.sw > o.iw + 1) fails.push(`horizontal overflow at ${w}px on "${url || 'landing'}": scrollWidth ${o.sw} > ${o.iw}`);
  if (out) { fs.mkdirSync(out, { recursive: true }); await p.screenshot({ path: `${out}/ui-${w}-${url ? 'app' : 'landing'}.png` }); }
  await ctx.close();
}
await b.close();
finish('ui', [...fails, ...new Set(errs)], { pairs: pairs.length });
