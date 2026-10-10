// Landing / 3-D experience QA (agent 3). Runs in the lx-* projects (see playwright.config.ts):
//   lx-desktop 1440×900 · lx-tablet 820×1180 touch · lx-mobile 390×844 touch+isMobile (default GPU flags → SwiftShader WebGL)
//   lx-nowebgl-*  (--disable-webgl)  ·  lx-reduced-*  (reducedMotion: 'reduce')
// Uses the window.__lumosDebug hook (apps/web/src/experience/landing/debug.ts).
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cell, MONTHS_LONG, note, waitCalendar } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(root, 'artifacts/experience/qa');
fs.mkdirSync(OUT, { recursive: true });

const kind = (ti: TestInfo) => ({
  nowebgl: ti.project.name.includes('nowebgl'),
  reduced: ti.project.name.includes('reduced'),
  mobile: ti.project.name.includes('mobile'),
  tablet: ti.project.name.includes('tablet'),
  desktop: ti.project.name.includes('desktop'),
});

type Errs = { console: string[]; page: string[] };
function track(page: Page): Errs {
  const e: Errs = { console: [], page: [] };
  page.on('console', (m) => { if (m.type() === 'error') e.console.push(m.text()); });
  page.on('pageerror', (err) => e.page.push(String(err)));
  return e;
}

const shot = (page: Page, ti: TestInfo, name: string) => page.screenshot({ path: path.join(OUT, `${ti.project.name}-${name}.png`) });

async function gotoLanding(page: Page, url = './') {
  await page.goto(url);
  await expect(page.locator('.lx-h1')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as any).__lumosDebug?.globe ?? 'pending'), { timeout: 30_000 }).not.toBe('pending');
}

/**
 * Wait until the live ScrollTrigger count stops changing (data-dependent sections create theirs late). Counts the
 * persistent triggers: one-shot reveals are legitimately consumed when Back restores a deep scroll position.
 */
async function stableTriggers(page: Page): Promise<number> {
  let last = -1, same = 0;
  for (let i = 0; i < 60 && same < 3; i++) {
    const n = await page.evaluate(() => (window as any).__lumosDebug.persistentTriggers() as number);
    same = n === last ? same + 1 : 0;
    last = n;
    await page.waitForTimeout(300);
  }
  return last;
}

async function settleTop(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => window.scrollY === 0);
  // two frames so scrubbed triggers / scene progress catch up with the scroll position
  await page.evaluate(() => new Promise<void>((r) => { const t = setTimeout(r, 300); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); }));
}

const canvases = (page: Page) => page.evaluate(() => document.querySelectorAll('canvas').length);

// ───────────────────────────────────────────────────────────────────────────────────────────────
test('L01 landing loads clean: hero canvas (or fallback), DEMO DATA tag', async ({ page }, ti) => {
  const k = kind(ti);
  const errs = track(page);
  await gotoLanding(page);
  const mode = await page.evaluate(() => (window as any).__lumosDebug.globe);
  note(ti, 'globe-mode', mode);
  if (k.nowebgl) {
    expect(mode).toBe('fallback');
    await expect(page.locator('.lx-globe--fallback canvas.lx-fallback-canvas')).toHaveCount(1);
    if (!k.mobile) await expect(page.locator('.lx-aside__t')).toContainText('WebGL unavailable');
  } else {
    expect(mode).toBe('webgl');
    await expect(page.locator('.lx-globe--webgl canvas')).toHaveCount(1);
  }
  await expect(page.locator('.lx-demo:visible').first()).toBeVisible();
  await expect(page.locator('.lx-demo:visible').first()).toContainText('DEMO DATA');
  await expect(page.locator('.lx-aside__v')).toContainText(/hotspot cells/, { timeout: 20_000 });
  // nothing from the transition is lying around; exactly one hero canvas at the top of the page
  expect(await page.locator('.lx-transition').count()).toBe(0);
  // exactly one hero canvas; any other canvas belongs to the next section (the two-camera frames mount once within
  // 600 px of the viewport — under reduced motion the hero is one screen tall, so #how is already that close)
  await expect(page.locator('.lx-stage canvas')).toHaveCount(1);
  const outside = await page.evaluate(() => [...document.querySelectorAll('canvas')].filter((c) => !c.closest('.lx-stage') && !c.closest('#how')).length);
  note(ti, 'canvases-at-top', `${await canvases(page)} (outside hero/#how: ${outside})`);
  expect(outside, 'no stray canvases (transition, other sections)').toBe(0);
  await shot(page, ti, 'L01-hero');
  expect(errs.page, 'page errors').toEqual([]);
  expect(errs.console, 'console errors').toEqual([]);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
test('L02 scroll every section in 200 px steps: no errors, no horizontal overflow, progress drives scenes', async ({ page }, ti) => {
  test.setTimeout(240_000);
  const k = kind(ti);
  const errs = track(page);
  await gotoLanding(page);
  await stableTriggers(page);
  const r = await page.evaluate(async () => {
    const dbg = (window as any).__lumosDebug;
    const raf = () => new Promise<void>((res) => requestAnimationFrame(() => res()));
    const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
    const se = document.scrollingElement!;
    let maxOver = 0, overAt = -1, steps = 0;
    const prog: Record<string, number[]> = {};
    const stepIdx: Record<string, number[]> = { how: [], jump: [], read: [] };
    let galMinX = 0;
    for (let y = 0; y < 400_000; y += 200) {
      window.scrollTo(0, y);
      await raf(); await sleep(25);
      steps++;
      const over = se.scrollWidth - innerWidth;
      if (over > maxOver) { maxOver = over; overAt = scrollY; }
      const p = dbg.progress() as Record<string, number>;
      for (const key of Object.keys(p)) (prog[key] ??= []).push(p[key]);
      for (const id of Object.keys(stepIdx)) {
        const i = [...document.querySelectorAll(`#${id} .lx-step`)].findIndex((e) => e.classList.contains('is-on'));
        stepIdx[id].push(i);
      }
      const tr = document.querySelector('.lx-gal__track') as HTMLElement | null;
      if (tr) galMinX = Math.min(galMinX, new DOMMatrixReadOnly(getComputedStyle(tr).transform === 'none' ? undefined : getComputedStyle(tr).transform).m41);
      if (scrollY + innerHeight >= se.scrollHeight - 2) break;
    }
    await sleep(1200);
    galMinX = Math.min(galMinX, (() => { const tr = document.querySelector('.lx-gal__track') as HTMLElement | null; const t = tr ? getComputedStyle(tr).transform : 'none'; return t === 'none' ? 0 : new DOMMatrixReadOnly(t).m41; })());
    return { steps, maxOver, overAt, height: se.scrollHeight, prog, stepIdx, galMinX, scrubbed: dbg.scrubbed(), total: dbg.scrollTriggers() };
  });
  note(ti, 'scroll', `steps=${r.steps} height=${r.height} maxOverflow=${r.maxOver}@${r.overAt} triggers=${r.total} scrubbed=${r.scrubbed} galleryMinX=${Math.round(r.galMinX)}`);
  const summary: Record<string, string> = {};
  for (const [key, v] of Object.entries(r.prog)) summary[key] = `${Math.min(...v)}→${Math.max(...v)}`;
  note(ti, 'progress-range', JSON.stringify(summary));
  fs.writeFileSync(path.join(OUT, `${ti.project.name}-L02-scroll.json`), JSON.stringify(r, null, 1));

  expect(r.maxOver, `horizontal overflow at y=${r.overAt}`).toBeLessThanOrEqual(1);
  if (k.reduced) {
    expect(r.scrubbed, 'reduced motion: no scrubbed/pinned triggers').toBe(0);
    await expect(page.locator('.lx-stage.is-static')).toHaveCount(1);
    await expect(page.locator('.lx-scrolly.is-static')).toHaveCount(3);
  } else {
    const sections = ['lx-stage', 'how', 'jump', 'read', ...(k.mobile ? [] : ['regions'])];
    for (const key of sections) {
      const v = r.prog[key];
      expect(v, `trigger for ${key}`).toBeTruthy();
      expect(Math.min(...v), `${key} starts at 0`).toBeLessThanOrEqual(0.01);
      expect(Math.max(...v), `${key} reaches 1`).toBeGreaterThanOrEqual(0.99);
      for (let i = 1; i < v.length; i++) expect(v[i], `${key} progress monotonic while scrolling down`).toBeGreaterThanOrEqual(v[i - 1] - 1e-3);
    }
    for (const id of ['how', 'jump', 'read']) {
      const seq = r.stepIdx[id];
      expect(seq, `${id} steps`).toContain(0);
      expect(seq, `${id} steps`).toContain(1);
      expect(seq, `${id} steps`).toContain(2);
    }
    if (!k.mobile) expect(r.galMinX, 'pinned gallery travels horizontally').toBeLessThan(-100);
  }
  await shot(page, ti, 'L02-bottom');
  expect(errs.page).toEqual([]);
  expect(errs.console).toEqual([]);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
async function watchOverlay(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__ov = { added: 0, removed: 0, tAdd: 0, tRem: 0, kids: [] as string[] };
    new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          const el = n as HTMLElement;
          if (!el.classList?.contains('lx-transition')) return;
          w.__ov.added++; w.__ov.tAdd = performance.now();
          const rec = () => el.childNodes.forEach((c) => { const ce = c as HTMLElement; const tag = `${ce.tagName}.${ce.className || ''}`; if (!w.__ov.kids.includes(tag)) w.__ov.kids.push(tag); });
          new MutationObserver(rec).observe(el, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'], });
          for (const c of [el]) new MutationObserver(rec).observe(c, { subtree: true, attributes: true, attributeFilter: ['class'] });
          // The overlay's children can be added (and classed) before this async callback runs — record them now too.
          rec();
        });
        m.removedNodes.forEach((n) => { if ((n as HTMLElement).classList?.contains('lx-transition')) { w.__ov.removed++; w.__ov.tRem = performance.now(); } });
      }
    }).observe(document.body, { childList: true });
  });
}

async function expectOverlayGone(page: Page, ti: TestInfo) {
  await expect.poll(() => page.evaluate(() => (window as any).__ov.removed), { timeout: 10_000 }).toBe(1);
  const ov = await page.evaluate(() => (window as any).__ov);
  note(ti, 'overlay', `added=${ov.added} removed=${ov.removed} lifetime=${Math.round(ov.tRem - ov.tAdd)}ms children=${ov.kids.join(',')}`);
  expect(ov.added).toBe(1);
  expect(await page.locator('.lx-transition').count()).toBe(0);
  expect(await page.evaluate(() => document.querySelectorAll('body > canvas, .lx-transition canvas').length)).toBe(0);
  return ov as { added: number; removed: number; tAdd: number; tRem: number; kids: string[] };
}

test('L03 CTA → transition overlay → workspace deep link; overlay removed; clicks not blocked', async ({ page }, ti) => {
  const k = kind(ti);
  const errs = track(page);
  await gotoLanding(page);
  const cta = page.locator('.lx-hero .lx-btn--primary');
  await expect(cta).toHaveAttribute('href', /#aoi=BGD&y=\d{4}&m=\d{1,2}/, { timeout: 20_000 });
  const href = (await cta.getAttribute('href'))!;
  await watchOverlay(page);
  await cta.click();
  await expect.poll(() => page.evaluate(() => (window as any).__ov.added), { timeout: 10_000 }).toBe(1);
  if (!k.reduced) await shot(page, ti, 'L03-transition');
  await expect(page).toHaveURL(new RegExp(href.replace(/[?&]/g, '.').replace('#', '#')));
  await waitCalendar(page);
  const ov = await expectOverlayGone(page, ti);
  if (k.reduced) {
    // The overlay stays up until the workspace has mounted and loaded its data, so this measures load time, not
    // animation; 'instant' is asserted by the is-instant class below. 3 s bound avoids flakes on a busy machine.
    expect(ov.tRem - ov.tAdd, 'reduced motion: no long animated wipe').toBeLessThan(3000);
    expect(ov.kids.join(','), 'reduced motion uses the instant CSS cover').toMatch(/lx-wipe.*is-instant|is-instant/);
  } else if (k.nowebgl) {
    expect(ov.kids.join(','), 'no WebGL → CSS wipe').not.toMatch(/CANVAS/);
  } else {
    expect(ov.kids.join(','), 'WebGL shader wipe').toMatch(/CANVAS/);
  }
  // focus moved into the workspace
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main');
  // pointer events reach the calendar
  await cell(page, 2015, 5).click();
  await expect(page.locator('.evidence__title h2')).toContainText('May 2015');
  await shot(page, ti, 'L03-workspace');
  expect(errs.page).toEqual([]);
  expect(errs.console).toEqual([]);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
async function expectWorkspaceAt(page: Page, href: string) {
  const m = /#aoi=([^&]+)&y=(\d+)&m=(\d+)/.exec(href)!;
  const [aoi, y, mo] = [decodeURIComponent(m[1]), Number(m[2]), Number(m[3])];
  await expect(page).toHaveURL(new RegExp(`aoi=${aoi.replace('-', '\\-')}&y=${y}&m=${mo}`));
  await waitCalendar(page);
  await expect(page.locator('select[aria-label="Area of interest"]')).toHaveValue(aoi);
  await expect(page.locator('.evidence__title h2')).toContainText(`${MONTHS_LONG[mo - 1]} ${y}`);
  return { aoi, y, mo };
}

test('L04 gallery card + index link deep-link; Back re-initialises the landing cleanly', async ({ page }, ti) => {
  test.setTimeout(150_000);
  const errs = track(page);
  await gotoLanding(page);
  await settleTop(page);
  const st0 = await stableTriggers(page);
  const cv0 = await canvases(page);
  note(ti, 'baseline', `scrollTriggers=${st0} canvases=${cv0}`);

  // gallery: scroll to it and click the first card that is fully on screen and not the country card
  await page.evaluate(() => document.getElementById('regions')!.scrollIntoView({ block: 'start' }));
  const cards = page.locator('.lx-card[href*="aoi="]');
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });
  await expect(cards.nth(1)).toHaveAttribute('aria-label', /peak month/i, { timeout: 20_000 });
  // phones / reduced motion use a native horizontal scroller: bring the first region card into view (the pinned
  // desktop/tablet track already shows several cards once the section is at the top)
  if (!(await page.locator('#regions.is-pinned').count())) await cards.nth(1).scrollIntoViewIfNeeded();
  const vw = page.viewportSize()!.width;
  const findPick = async () => {
    const n = await cards.count();
    for (let i = 1; i < n; i++) {
      const b = await cards.nth(i).boundingBox();
      if (b && b.x >= 0 && b.x + b.width <= vw + 0.5) return i;
    }
    return -1;
  };
  await expect.poll(findPick, { message: 'a fully visible region card', timeout: 10_000 }).toBeGreaterThan(0);
  const pick = await findPick();
  const href = (await cards.nth(pick).getAttribute('href'))!;
  note(ti, 'gallery-card', href);
  await cards.nth(pick).click();
  await expectWorkspaceAt(page, href);
  await expect(page.locator('.lx-transition')).toHaveCount(0, { timeout: 8000 });

  // Back → landing, re-initialised (no duplicate canvases, no leaked triggers)
  await page.goBack();
  await expect(page.locator('.lx-h1')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.route)).toBe('landing');
  await settleTop(page);
  const st1 = await stableTriggers(page);
  const cv1 = await canvases(page);
  const dbg = await page.evaluate(() => { const d = (window as any).__lumosDebug; return { mounts: d.mounts, unmounts: d.unmounts }; });
  note(ti, 'after-back', `scrollTriggers=${st1} canvases=${cv1} mounts=${dbg.mounts} unmounts=${dbg.unmounts}`);
  expect(st1, 'no leaked ScrollTriggers').toBe(st0);
  expect(cv1, 'no duplicate canvases').toBe(cv0);
  expect(dbg.mounts - dbg.unmounts).toBe(1);

  // index: a specific month link
  await page.evaluate(() => document.getElementById('index')!.scrollIntoView({ block: 'start' }));
  const aoiSec = page.locator('.lx-ix__aoi').nth(2);
  const row = aoiSec.locator('.lx-ix__row', { has: page.locator('.lx-ix__y', { hasText: /^2015$/ }) });
  const month = row.locator('.lx-ix__m').nth(3);
  await expect(month).not.toHaveClass(/is-loading/, { timeout: 20_000 });
  const ixHref = (await month.getAttribute('href'))!;
  note(ti, 'index-link', ixHref);
  expect(ixHref).toMatch(/&y=2015&m=4$/);
  await month.click();
  await expectWorkspaceAt(page, ixHref);
  await page.goBack();
  await expect(page.locator('.lx-h1')).toBeVisible();
  await settleTop(page);
  expect(await stableTriggers(page)).toBe(st0);
  expect(await canvases(page)).toBe(cv0);
  expect(errs.page).toEqual([]);
  expect(errs.console).toEqual([]);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
test('L05 landing ⇄ workspace ×5: WebGL contexts and JS heap do not leak', async ({ page }, ti) => {
  const k = kind(ti);
  test.skip(k.tablet || k.reduced, 'leak loop runs on desktop, mobile and no-WebGL projects');
  test.setTimeout(300_000);
  const errs = track(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.__gl = [] as WebGLRenderingContext[];
    // rAF call counter (REVIEW M2: no ScrollTrigger keep-alive loop in the workspace after visiting the landing)
    w.__raf = 0;
    const origRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb: FrameRequestCallback) => { w.__raf++; return origRaf(cb); };
    const orig = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error wrap
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      // @ts-expect-error passthrough
      const ctx = orig.call(this, type, ...rest);
      if (ctx && /webgl/.test(type) && !w.__gl.includes(ctx)) w.__gl.push(ctx);
      return ctx;
    };
  });
  const cdp = await page.context().newCDPSession(page);
  const measure = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(200);
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage');
    const gl = await page.evaluate(() => { const a = (window as any).__gl as WebGLRenderingContext[]; return { created: a.length, live: a.filter((c) => !c.isContextLost()).length }; });
    const pm = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? null);
    return { heapMB: +(heap.usedSize / 1048576).toFixed(2), perfMemMB: pm ? +(pm / 1048576).toFixed(2) : null, ...gl, canvases: await canvases(page), triggers: await page.evaluate(() => (window as any).__lumosDebug?.persistentTriggers?.() ?? -1) };
  };
  await gotoLanding(page);
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i <= 5; i++) {
    // visit the two-cameras section so the second 3-D scene mounts, then come back to the hero
    await page.evaluate(() => document.getElementById('how')!.scrollIntoView({ block: 'start' }));
    await expect(page.locator('#how canvas').first()).toBeAttached({ timeout: 15_000 });
    await settleTop(page);
    await stableTriggers(page);
    const onLanding = await measure();
    const cta = page.locator('.lx-hero .lx-btn--primary');
    await expect(cta).toHaveAttribute('href', /#aoi=BGD&y=/, { timeout: 20_000 });
    await cta.click();
    await waitCalendar(page);
    await expect(page.locator('.lx-transition')).toHaveCount(0, { timeout: 10_000 });
    // idle workspace: well under one rAF per frame (the map may still be settling, so poll)
    const rafPerSec = () => page.evaluate(async () => { const w = window as any; const a = w.__raf; await new Promise((r) => setTimeout(r, 1000)); return w.__raf - a; });
    await expect.poll(rafPerSec, { message: 'rAF calls/s in the idle workspace', timeout: 15_000, intervals: [0] }).toBeLessThan(15);
    const onApp = await measure();
    await page.goBack();
    await expect(page.locator('.lx-h1')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__lumosDebug.globe)).not.toBe('pending');
    rows.push({ trip: i, landing: onLanding, workspace: onApp });
    note(ti, `trip-${i}`, `landing ${JSON.stringify(onLanding)} | workspace ${JSON.stringify(onApp)}`);
  }
  await settleTop(page);
  const final = await measure();
  note(ti, 'final', JSON.stringify(final));
  fs.writeFileSync(path.join(OUT, `${ti.project.name}-L05-leaks.json`), JSON.stringify({ rows, final }, null, 1));
  const first = rows[0].landing as { live: number; heapMB: number; canvases: number; triggers: number };
  const last = rows[4].landing as { live: number; heapMB: number; canvases: number; triggers: number };
  expect(last.live, 'live WebGL contexts stable across trips').toBeLessThanOrEqual(first.live);
  expect(final.live, 'live WebGL contexts at the landing top').toBeLessThanOrEqual(k.nowebgl ? 0 : 3);
  expect(last.canvases).toBe(first.canvases);
  expect(last.triggers).toBe(first.triggers);
  expect(last.heapMB - first.heapMB, 'JS heap growth over 4 extra round trips (MB)').toBeLessThan(12);
  expect(errs.page).toEqual([]);
  expect(errs.console).toEqual([]);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
test('L06 keyboard: skip link, tab order, focus visible, index arrows, gallery focus scroll', async ({ page }, ti) => {
  const k = kind(ti);
  test.skip(k.mobile || k.tablet, 'keyboard checks on desktop projects');
  test.setTimeout(120_000); // ~30 keyboard steps; each round-trip is slow while SwiftShader renders the hero globe
  const errs = track(page);
  await gotoLanding(page);
  const focused = () => page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a) return null;
    const cs = getComputedStyle(a);
    const r = a.getBoundingClientRect();
    return { name: (a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60), cls: a.className, outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, inView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth };
  });
  const seq: { name: string; cls: string; outline: boolean; inView: boolean }[] = [];
  // skip · brand · 3 section links · Open app · 2 hero CTAs · first region card = 9 stops
  for (let i = 0; i < 9; i++) { await page.keyboard.press('Tab'); seq.push((await focused())!); }
  note(ti, 'tab-order', seq.map((s) => s.name).join(' | '));
  expect(seq[0].name).toBe('Skip to main content');
  expect(seq[0].inView, 'skip link visible on focus').toBe(true);
  const names = seq.map((s) => s.name);
  const idx = (re: RegExp) => names.findIndex((n) => re.test(n));
  expect(idx(/^Lumos Fire Calendar — top/)).toBe(1);
  expect(idx(/^How it works/)).toBeGreaterThan(1);
  expect(idx(/^Open app/)).toBeGreaterThan(idx(/^Index/));
  expect(idx(/^Open the fire calendar/)).toBeGreaterThan(idx(/^Open app/));
  expect(idx(/^How harmonization works/)).toBe(idx(/^Open the fire calendar/) + 1);
  expect(seq[8].cls, 'after the hero the next stop is a region card').toMatch(/lx-card/);
  for (const s of seq) expect(s.outline, `focus visible on ${s.name}`).toBe(true);
  expect(seq[8].inView, 'focused region card is scrolled into view').toBe(true);

  // index arrow navigation
  await page.evaluate(() => document.getElementById('index')!.scrollIntoView());
  const sec = page.locator('.lx-ix__aoi').first();
  await expect(sec.locator('.lx-ix__m').first()).not.toHaveClass(/is-loading/, { timeout: 20_000 });
  const firstYear = sec.locator('.lx-ix__y').first();
  const y0 = Number(await firstYear.innerText());
  await firstYear.focus();
  const label = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  await page.keyboard.press('ArrowRight'); expect(await label()).toMatch(new RegExp(`^January ${y0}:`));
  await page.keyboard.press('ArrowDown'); expect(await label()).toMatch(new RegExp(`^January ${y0 + 1}:`));
  await page.keyboard.press('End'); expect(await label()).toMatch(new RegExp(`^December ${y0 + 1}:`));
  await page.keyboard.press('ArrowLeft'); expect(await label()).toMatch(new RegExp(`^November ${y0 + 1}:`));
  expect((await focused())!.outline).toBe(true);
  await page.keyboard.press('Home'); expect(await label()).toMatch(new RegExp(` ${y0 + 1}`));
  await page.keyboard.press('Tab'); expect(await label()).toMatch(new RegExp(` ${y0 + 2}`));
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  expect(await label()).toMatch(new RegExp(`^February ${y0 + 2}:`));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`&y=${y0 + 2}&m=2$`));
  await waitCalendar(page);
  await expect(page.locator('.lx-transition')).toHaveCount(0, { timeout: 8000 });

  // skip link → in-page anchor (#lx-main): focus moves into the landing's main region; no route change, no new entry
  await page.goto('./');
  await expect(page.locator('.lx-h1')).toBeVisible();
  const histLen = await page.evaluate(() => history.length);
  await page.keyboard.press('Tab');
  await expect(page.locator('.lx-skip')).toHaveAttribute('href', '#lx-main');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('lx-main');
  expect(await page.evaluate(() => document.documentElement.dataset.route)).toBe('landing');
  expect(await page.evaluate(() => history.length)).toBe(histLen);
  // and a native jump to the anchor (no JS handler, e.g. a pasted link) stays on the landing too
  await page.evaluate(() => { location.hash = '#lx-main'; });
  await expect(page.locator('.lx-h1')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.route)).toBe('landing');
  expect(errs.page).toEqual([]);
  expect(errs.console).toEqual([]);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
test('L07 hash routing edge cases', async ({ page }, ti) => {
  const k = kind(ti);
  test.skip(!k.desktop || k.reduced || k.nowebgl, 'routing is viewport-independent');
  const errs = track(page);
  // '#/app?aoi=bad' → workspace, falls back to a valid AOI without crashing
  await page.goto('./#/app?aoi=NOPE&y=1900&m=13');
  await expect(page.locator('.cal__grid, .boot--err')).toBeVisible({ timeout: 20_000 });
  note(ti, 'bad-aoi-url', page.url());
  expect(await page.evaluate(() => document.documentElement.dataset.route)).toBe('workspace');
  // '#/app' alone
  await page.goto('./#/app');
  await waitCalendar(page);
  // '#/' and '' → landing; '#' → landing
  for (const u of ['./#/', './', './#']) {
    await page.goto(u);
    await expect(page.locator('.lx-h1')).toBeVisible();
  }
  // in-page hash change landing → '#/app?aoi=BGD-B&y=2016&m=3' → normalised
  await page.evaluate(() => { location.hash = '#/app?aoi=BGD-B&y=2016&m=3'; });
  await waitCalendar(page);
  await expect(page).toHaveURL(/#aoi=BGD-B&y=2016&m=3/);
  await expect(page.locator('select[aria-label="Area of interest"]')).toHaveValue('BGD-B');
  await page.goBack();
  await expect(page.locator('.lx-h1')).toBeVisible();
  expect(errs.page).toEqual([]);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
const PORTS: Record<string, number> = { 'lx-desktop': 4191, 'lx-mobile': 4192, 'lx-nowebgl-mobile': 4193 };
async function startServer(port: number): Promise<ChildProcess> {
  const p = spawn('npx', ['vite', 'preview', '--config', 'apps/web/vite.config.ts', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${port}/`); if (r.ok) return p; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}
function stopServer(p: ChildProcess | null) { try { if (p?.pid) process.kill(-p.pid, 'SIGTERM'); } catch { /* gone */ } }

test('L08 offline after a landing-only visit: shell renders with honest fallback text; workspace honest', async ({ page, context }, ti) => {
  const port = PORTS[ti.project.name];
  test.skip(!port, 'offline check on lx-desktop, lx-mobile, lx-nowebgl-mobile');
  test.setTimeout(150_000);
  const base = `http://localhost:${port}/`;
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  let srv: ChildProcess | null = await startServer(port);
  try {
    await gotoLanding(page, base);
    // the SW must be registered from the LANDING (no workspace visit) and finish precaching
    const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { active: !!r.active, scope: r.scope }; });
    note(ti, 'sw-from-landing', JSON.stringify(sw));
    expect(sw.active).toBe(true);
    const cached = await page.evaluate(async () => {
      const out: Record<string, number> = {};
      for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length;
      return out;
    });
    note(ti, 'caches', JSON.stringify(cached));

    stopServer(srv); srv = null;
    await context.setOffline(true);
    await expect.poll(async () => { try { await fetch(base); return 'up'; } catch { return 'down'; } }).toBe('down');

    await page.reload();
    await expect(page.locator('.lx-h1')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.lx-demo:visible').first()).toBeVisible();
    await expect(page.locator('.lx-aside__v')).toContainText(/unavailable offline|hotspot cells/i, { timeout: 20_000 });
    note(ti, 'offline-hero-text', await page.locator('.lx-aside__v').innerText());
    await page.evaluate(() => document.getElementById('jump')!.scrollIntoView());
    await expect(page.locator('#jump .lx-jump__box > svg')).toContainText(/unavailable offline|VIIRS arrives/i, { timeout: 10_000 });
    note(ti, 'offline-jump-text', ((await page.locator('#jump .lx-jump__box > svg text').last().textContent()) ?? '').slice(0, 120));
    await shot(page, ti, 'L08-offline-landing');

    // workspace, area never opened → honest "not available offline"
    await page.evaluate(() => { window.scrollTo(0, 0); location.hash = '#aoi=BGD-G&y=2016&m=3'; });
    await expect(page.locator('.cal__grid')).toBeVisible({ timeout: 20_000 });
    // the workspace's honest wording: "unavailable — not cached for offline use … This is not missing data."
    await expect(page.locator('body')).toContainText(/not cached for offline use|not available offline|unavailable offline/i, { timeout: 15_000 });
    await expect(page.locator('body')).toContainText(/not missing data/i);
    expect(await page.locator('.cal__cell.st-observed').count()).toBe(0);
    expect(await page.locator('.cal__cell.is-zero').count()).toBe(0);
    await shot(page, ti, 'L08-offline-workspace');
    expect(pageErrors).toEqual([]);
  } finally {
    stopServer(srv);
    await context.setOffline(false);
  }
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
test('L09 Back while Replay runs returns to the landing; Back restores the landing scroll position', async ({ page }, ti) => {
  const k = kind(ti);
  test.skip(k.tablet || k.reduced || k.nowebgl, 'history behaviour is viewport/GPU independent; desktop + mobile');
  test.setTimeout(120_000);
  const errs = track(page);

  // REVIEW H1: Replay holds hash sync; releasing it on unmount must not write '#aoi=…' over the landing entry.
  await gotoLanding(page);
  await page.evaluate(() => { location.hash = '#aoi=BGD&y=2016&m=3'; });
  await waitCalendar(page);
  const replay = page.locator('.replay button');
  await replay.click();
  await expect(replay).toHaveAttribute('aria-pressed', 'true');
  await expect(page).not.toHaveURL(/&m=3$/, { timeout: 5000 }); // replay has advanced at least one month
  await page.goBack();
  await expect(page.locator('.lx-h1')).toBeVisible({ timeout: 20_000 });
  // stays on the landing (no late/throttled hash write bouncing the router back) for > one sync interval
  const seen = await page.evaluate(() => new Promise<string[]>((res) => {
    const out = new Set<string>(); const t0 = performance.now();
    const tick = () => { out.add(`${document.documentElement.dataset.route}|${location.hash}`); if (performance.now() - t0 < 1600) setTimeout(tick, 50); else res([...out]); };
    tick();
  }));
  note(ti, 'after-back-states', seen.join(' , '));
  expect(seen).toEqual(['landing|']);

  // REVIEW M1: leave from deep in the page (the index), come Back, land at the same place.
  await page.evaluate(() => document.getElementById('index')!.scrollIntoView({ block: 'start' }));
  const link = page.locator('.lx-ix__aoi').first().locator('.lx-ix__y').first();
  await expect(page.locator('.lx-ix__aoi').first().locator('.lx-ix__m').first()).not.toHaveClass(/is-loading/, { timeout: 20_000 });
  await link.scrollIntoViewIfNeeded();
  const yBefore = await page.evaluate(() => Math.round(window.scrollY));
  note(ti, 'scroll-before', String(yBefore));
  expect(yBefore).toBeGreaterThan(2000);
  await link.click();
  await waitCalendar(page);
  await expect(page.locator('.lx-transition')).toHaveCount(0, { timeout: 15_000 });
  await page.goBack();
  await expect(page.locator('.lx-h1')).toBeAttached({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as any).__lumosDebug?.restoredScroll ?? null), { timeout: 15_000 }).not.toBeNull();
  const yAfter = await page.evaluate(() => Math.round(window.scrollY));
  note(ti, 'scroll-after', String(yAfter));
  expect(Math.abs(yAfter - yBefore), 'landing scroll restored after Back').toBeLessThan(150);
  expect(errs.page).toEqual([]);
  expect(errs.console).toEqual([]);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
test('L10 transition never hangs when rAF stops firing (hidden tab): overlay removed, workspace focused', async ({ page }, ti) => {
  const k = kind(ti);
  test.skip(!k.desktop || k.reduced, 'one WebGL + one no-WebGL desktop run');
  await gotoLanding(page);
  const cta = page.locator('.lx-hero .lx-btn--primary');
  await expect(cta).toHaveAttribute('href', /#aoi=BGD&y=\d{4}&m=\d{1,2}/, { timeout: 20_000 });
  await watchOverlay(page);
  // WATCHDOG 1: simulate a hidden tab — from now on requestAnimationFrame callbacks never run.
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await cta.dispatchEvent('click', { button: 0, detail: 1, clientX: 200, clientY: 200 });
  await expect.poll(() => page.evaluate(() => (window as any).__ov.added), { timeout: 3000 }).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__ov.removed), { timeout: 9000 }).toBe(1);
  const ov = await page.evaluate(() => (window as any).__ov);
  note(ti, 'hidden-overlay-lifetime', `${Math.round(ov.tRem - ov.tAdd)}ms`);
  expect(ov.tRem - ov.tAdd, 'bounded by the transition cap').toBeLessThan(7000);
  expect(await page.evaluate(() => document.documentElement.dataset.route)).toBe('workspace');
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main');
});
