import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ARTIFACTS, cell, MONTHS_LONG, note, waitCalendar } from './helpers';

test('13 performance measurements (report only)', async ({ browser }, ti) => {
  test.skip(ti.project.name === 'tablet', 'desktop + mobile only');
  test.setTimeout(180_000);
  const out: Record<string, unknown> = { project: ti.project.name };

  // A) first view without service worker (what the user waits for)
  for (const sw of ['block', 'allow'] as const) {
    const { viewport, hasTouch, isMobile, deviceScaleFactor } = ti.project.use;
    const ctx = await browser.newContext({ viewport, hasTouch, isMobile, deviceScaleFactor, serviceWorkers: sw, baseURL: 'http://localhost:4173/' });
    const page = await ctx.newPage();
    const res: { url: string; raw: number; gz: number; br: number; type: string; fromSW: boolean; body?: Buffer }[] = [];
    const pending: Promise<void>[] = [];
    ctx.on('response', (r) => {
      pending.push((async () => {
        try {
          const b = await r.body();
          if (r.url().startsWith('blob:') || r.url().startsWith('data:')) return; // not network transfer
          res.push({ url: r.url().replace('http://localhost:4173', ''), raw: b.length, gz: 0, br: 0, body: b, type: r.request().resourceType(), fromSW: r.fromServiceWorker() });
        } catch { /* redirects etc. */ }
      })());
    });
    const t0 = Date.now();
    await page.goto('./#aoi=BGD&y=2016&m=3');
    await waitCalendar(page);
    const tCal = Date.now() - t0;
    await page.waitForLoadState('networkidle');
    if (sw === 'allow') { await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(4000); }
    await Promise.all(pending);
    for (const r of res) { r.gz = zlib.gzipSync(r.body!, { level: 6 }).length; r.br = zlib.brotliCompressSync(r.body!).length; delete r.body; }
    const sum = (k: 'raw' | 'gz' | 'br') => res.reduce((a, r) => a + r[k], 0);
    const nav = await page.evaluate(() => {
      const e = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return { entries: e.length, transferSize: e.reduce((a, x) => a + x.transferSize, 0), decoded: e.reduce((a, x) => a + x.decodedBodySize, 0) };
    });
    const top = [...res].sort((a, b) => b.raw - a.raw).slice(0, 8).map((r) => `${r.url} raw=${r.raw} gz=${r.gz}`);
    out[`firstLoad_sw_${sw}`] = { requests: res.length, rawBytes: sum('raw'), gzipBytes: sum('gz'), brotliBytes: sum('br'), msToCalendar: tCal, perfApi: nav, top };
    if (sw === 'block') {
      // B) cached selection latency: click → evidence drawer heading updated (all records for AOI already loaded)
      const lat: number[] = [];
      const targets: [number, number][] = [[2017, 1], [2018, 2], [2019, 3], [2020, 4], [2021, 5], [2022, 6], [2023, 7], [2014, 8], [2015, 9], [2013, 10], [2016, 11]];
      for (const [y, m] of targets) {
        const label = `${MONTHS_LONG[m - 1]} ${y}`;
        const handle = await cell(page, y, m).elementHandle();
        const ms = await page.evaluate(([el, label]) => new Promise<number>((resolve) => {
          const h = document.querySelector('.evidence__title h2')!;
          const t0 = performance.now();
          const obs = new MutationObserver(() => { if (h.textContent?.includes(label as string)) { obs.disconnect(); requestAnimationFrame(() => resolve(performance.now() - t0)); } });
          obs.observe(h, { childList: true, subtree: true, characterData: true });
          (el as HTMLElement).click();
        }), [handle, label] as const);
        lat.push(ms);
      }
      lat.shift(); // warm-up
      const sorted = [...lat].sort((a, b) => a - b);
      out.selectionLatencyMs = { samples: lat.map((x) => +x.toFixed(1)), median: +sorted[Math.floor(sorted.length / 2)].toFixed(1), max: +sorted[sorted.length - 1].toFixed(1) };
    }
    await ctx.close();
  }
  note(ti, 'perf', JSON.stringify(out));
  fs.writeFileSync(path.join(ARTIFACTS, `perf-${ti.project.name}.json`), JSON.stringify(out, null, 2));
  expect(out.selectionLatencyMs).toBeTruthy();
});
