// Goal: map sensor looks + live layer work with no page errors.
// Contract: buttons [data-look="normal|thermal|nvg|crt"] inside the map panel; the map stage element (.map__stage)
// carries data-look="<current>"; keys 1-4 switch looks when the map panel has focus; legend and attribution do not overlap.
import { launch, watch, finish, BASE } from './_brave.mjs';
import fs from 'node:fs';
const out = process.argv[2] || '';
const fails = [], errs = [];
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage(); watch(p, errs);
await p.goto(BASE + '#/map?aoi=BGD&y=2024&m=3&notour=1', { waitUntil: 'load' }); await p.waitForTimeout(5000);
for (const look of ['thermal', 'nvg', 'crt', 'normal']) {
  try { await p.click(`[data-look="${look}"]`, { timeout: 3000 }); } catch { fails.push(`no clickable [data-look="${look}"] button`); continue; }
  await p.waitForTimeout(900);
  const cur = await p.evaluate(() => document.querySelector('.map__stage')?.getAttribute('data-look'));
  if (cur !== look) fails.push(`after clicking ${look}, .map__stage[data-look] is "${cur}"`);
  if (out) { fs.mkdirSync(out, { recursive: true }); await p.screenshot({ path: `${out}/sensor-${look}.png` }); }
}
try { await p.click('button:has-text("Districts")', { timeout: 3000 }); await p.waitForTimeout(2500); } catch { fails.push('Districts toggle not clickable'); }
const ov = await p.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
  const a = r('.map__legend'), c = r('.map__attrib');
  if (!a || !c) return null;
  return !(a.right <= c.left || c.right <= a.left || a.bottom <= c.top || c.bottom <= a.top);
});
if (ov === true) fails.push('map legend and district attribution overlap');
try { await p.click('button:has-text("Live")', { timeout: 3000 }); await p.waitForTimeout(3000); } catch { fails.push('Live toggle not clickable'); }
if (out) await p.screenshot({ path: `${out}/sensor-live-districts.png` });
await ctx.close(); await b.close();
finish('sensor', [...fails, ...new Set(errs)]);
