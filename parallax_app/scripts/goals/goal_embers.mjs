// Goal: landing embers are tied to their page visuals and never hang over unrelated content.
// Contract (dev only): window.__embers.debug() -> {
//   scene: number,                // current blended scene value
//   alpha: number,                // 0..1 visibility of the SHAPED field (not the ambient gutter drift)
//   primary: string|null,         // id of the anchor the shaped field is currently drawn on (data-ember-anchor value)
//   frame: {x,y,w,h}|null,        // CSS px rect (viewport coords) converted BACK from the rect uniform uploaded to the
//                                 // shader for the current scene (not the anchor's own DOMRect)
//   anchors: [{ id, rect:{x,y,w,h}, visible:boolean }],  // every [data-ember-anchor] element
//   tick: number,                 // frames rendered so far (must keep rising while a shape is visible)
//   clock: number                 // the private animation clock in seconds (must never jump after an idle period)
// }
// Review round 1 added: shapes stay INSIDE their anchor (inset), shaped alpha is capped at 0.5 so labels stay readable,
// shapes never sit on real-data visuals other than as a border, and the loop must not freeze while a shape is on screen.
import { launch, watch, finish, BASE } from './_brave.mjs';
import fs from 'node:fs';
const out = process.argv[2] || '';
const fails = [], errs = [];
const b = await launch();
for (const vp of [{ w: 1440, h: 900, tag: 'desktop' }, { w: 390, h: 844, tag: 'mobile' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
  const p = await ctx.newPage(); watch(p, errs, vp.tag + ' ');
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForTimeout(4500);
  const has = await p.evaluate(() => !!(window.__embers && window.__embers.debug));
  if (!has) { fails.push(`${vp.tag}: window.__embers.debug() missing`); await ctx.close(); continue; }
  const total = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  let prev = null, shapedSteps = 0, seen = new Set(), i = 0;
  for (let y = 0; y <= total; y += 250, i++) {
    await p.evaluate((yy) => window.scrollTo(0, yy), y);
    await p.waitForTimeout(450);
    const d = await p.evaluate(() => window.__embers.debug());
    const vis = d.anchors.filter((a) => a.visible).map((a) => a.id);
    if (d.alpha > 0.05) {
      shapedSteps++;
      if (d.primary) seen.add(d.primary);
      if (!d.primary || !vis.includes(d.primary)) fails.push(`${vp.tag} y=${y}: shaped embers visible (alpha ${d.alpha.toFixed(2)}) on "${d.primary}" but that anchor is off screen (visible: ${vis.join(',') || 'none'})`);
      else if (d.frame) {
        const a = d.anchors.find((x) => x.id === d.primary).rect;
        const cx = Math.abs((d.frame.x + d.frame.w / 2) - (a.x + a.w / 2)), cy = Math.abs((d.frame.y + d.frame.h / 2) - (a.y + a.h / 2));
        if (cx > 12 || cy > 12) fails.push(`${vp.tag} y=${y}: ember frame is ${Math.round(cx)}px,${Math.round(cy)}px away from anchor "${d.primary}" (max 12)`);
      }
      if (d.alpha > 0.5) fails.push(`${vp.tag} y=${y}: shaped alpha ${d.alpha.toFixed(2)} exceeds the 0.5 cap (labels must stay readable)`);
      if (d.primary === 'places') fails.push(`${vp.tag} y=${y}: shaped embers on the region gallery (cards slide under them); that scene must fade to ambient`);
      if (d.frame && vis.includes(d.primary) && d.primary === 'cameras') {   // jump and fair are border traces, drawn outside the visual
        const a = d.anchors.find((x) => x.id === d.primary).rect, f = d.frame;
        if (f.x < a.x + a.w * 0.05 || f.y < a.y + a.h * 0.05 || f.x + f.w > a.x + a.w * 0.95 || f.y + f.h > a.y + a.h * 0.95) fails.push(`${vp.tag} y=${y}: frame for "${d.primary}" is not inset at least 5% inside its anchor on every side`);
      }
    }
    if (vis.length === 0 && d.alpha > 0.05) fails.push(`${vp.tag} y=${y}: no anchor on screen but shaped alpha is ${d.alpha.toFixed(2)} (max 0.05)`);
    if (prev !== null && d.scene < prev - 0.02) fails.push(`${vp.tag} y=${y}: scene went backwards while scrolling down (${prev.toFixed(2)} -> ${d.scene.toFixed(2)})`);
    prev = d.scene;
    if (out && i % 3 === 0) { fs.mkdirSync(out, { recursive: true }); await p.screenshot({ path: `${out}/embers-${vp.tag}-${String(y).padStart(5, '0')}.png` }); }
  }
  if (shapedSteps < 4) fails.push(`${vp.tag}: shaped embers were visible on only ${shapedSteps} scroll steps (expected them on every chapter visual)`);
  // freeze check: park on the first chapter visual, idle well past the old 15 s sleep, the loop must still be running
  // and the clock must not jump when scrolling resumes
  await p.evaluate(() => document.querySelector('[data-ember-anchor="cameras"]')?.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(2500);
  const a0 = await p.evaluate(() => window.__embers.debug());
  if (typeof a0.tick !== 'number' || typeof a0.clock !== 'number') fails.push(`${vp.tag}: debug() has no tick/clock`);
  else if (a0.alpha > 0.05) {
    await p.waitForTimeout(17000);
    const a1 = await p.evaluate(() => window.__embers.debug());
    await p.waitForTimeout(1000);
    const a2 = await p.evaluate(() => window.__embers.debug());
    if (a2.tick - a1.tick < 10) fails.push(`${vp.tag}: loop froze while a shape is on screen (only ${a2.tick - a1.tick} frames in 1 s after 17 s idle)`);
    await p.evaluate(() => window.scrollBy(0, 40)); await p.waitForTimeout(300);
    const a3 = await p.evaluate(() => window.__embers.debug());
    if (a3.clock - a2.clock > 2) fails.push(`${vp.tag}: animation clock jumped ${(a3.clock - a2.clock).toFixed(1)} s on scroll resume`);
  } else fails.push(`${vp.tag}: no shaped embers on the "cameras" visual when it is centred`);
  if (seen.size < 3) fails.push(`${vp.tag}: embers attached to only ${seen.size} different anchors (${[...seen].join(',')}); expected at least 3 chapters`);
  // leaving the landing must remove the canvas
  await p.goto(BASE + '#aoi=BGD&y=2024&m=3&notour=1'); await p.waitForTimeout(2500);
  if (await p.evaluate(() => !!document.querySelector('.lx-embers canvas'))) fails.push(`${vp.tag}: ember canvas still present in the workspace`);
  await ctx.close();
}
await b.close();
finish('embers', [...fails, ...new Set(errs)]);
