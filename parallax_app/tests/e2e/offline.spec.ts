import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cell, note, selectAoi, shot, waitCalendar } from './helpers';

// Playwright's context.setOffline()/route() do not stop fetches made *by the service worker* in Chromium
// (verified: uncached AOI still loaded from network). So this test runs its own preview server on a
// private port and kills it to simulate real offline, plus setOffline() so navigator.onLine is false.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORTS: Record<string, number> = { desktop: 4181, tablet: 4182, mobile: 4183 };

async function startServer(port: number): Promise<ChildProcess> {
  const p = spawn('npx', ['vite', 'preview', '--config', 'apps/web/vite.config.ts', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${port}/`); if (r.ok) return p; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}
function stopServer(p: ChildProcess | null) { try { if (p?.pid) process.kill(-p.pid, 'SIGTERM'); } catch { /* gone */ } }

test('09 offline reload: shell + cached AOI render; uncached AOI honest', async ({ page, context }, ti) => {
  test.setTimeout(120_000);
  const port = PORTS[ti.project.name] ?? 4189;
  const base = `http://localhost:${port}/`;
  let srv: ChildProcess | null = await startServer(port);
  try {
    await page.goto(base + '#aoi=BGD&y=2016&m=3');
    await waitCalendar(page);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await waitCalendar(page);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
    await selectAoi(page, 'BGD-B');
    await cell(page, 2016, 3).click();
    await page.waitForTimeout(1500); // let runtime cache writes finish
    const cached = await page.evaluate(async () => {
      const out: Record<string, number> = {};
      for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length;
      return out;
    });
    note(ti, 'cache-entries', JSON.stringify(cached));

    // go offline for real
    stopServer(srv); srv = null;
    await context.setOffline(true);
    await expect.poll(async () => { try { await fetch(base); return 'up'; } catch { return 'down'; } }).toBe('down');

    await page.reload();
    await waitCalendar(page);
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('select[aria-label="Area of interest"]')).toHaveValue('BGD-B');
    await expect(page.locator('.cal-panel .panel__title')).toContainText('Chattogram');
    await expect(cell(page, 2016, 3)).toHaveAttribute('class', /st-observed|st-estimated|st-partial/);
    const net = page.locator('.statusline .net').first();
    if (await net.count()) note(ti, 'offline-status', await net.innerText());
    if (ti.project.name !== 'mobile') {
      await expect(page.locator('.map .panel__title')).toContainText('Chattogram');
      note(ti, 'offline-map-legend', await page.locator('.map__legend-sub, .map__fallback').first().innerText().catch(() => 'n/a'));
    }
    await shot(page, ti, '09-offline-cached');

    // never-visited AOI
    await page.selectOption('select[aria-label="Area of interest"]', 'BGD-G');
    await page.waitForTimeout(3000);
    const states = await page.locator('.cal__cell').evaluateAll((els) => {
      const c: Record<string, number> = {};
      for (const e of els) { const s = (e.className.match(/st-(\w+)/) || [])[1]; c[s] = (c[s] ?? 0) + 1; }
      return c;
    });
    const zeros = await page.locator('.cal__cell.is-zero').count();
    const bodyText = await page.locator('body').innerText();
    const honest = /not available offline|unavailable offline|not cached|you are offline|could not load|failed to load|couldn.t load/i.test(bodyText);
    note(ti, 'uncached-aoi-states', JSON.stringify(states));
    note(ti, 'uncached-aoi-zero-cells', String(zeros));
    note(ti, 'uncached-aoi-explicit-message', String(honest));
    note(ti, 'uncached-aoi-evidence', (await page.locator('.evidence__explain').innerText()).replace(/\s+/g, ' ').slice(0, 250));
    await shot(page, ti, '09-offline-uncached');
    expect(zeros, 'no cell may claim observed zero when data is unavailable').toBe(0);
    expect(states.observed ?? 0).toBe(0);
    // E2E B1 / REVIEW H1 (fixed): unvisited AOI offline is "unavailable", rendered distinctly from "missing".
    expect(honest, 'uncached AOI offline should show an explicit "not available offline" message').toBe(true);
    expect(states.unavailable ?? 0, 'uncached years render as unavailable').toBeGreaterThan(0);
    expect(states.missing ?? 0, 'nothing claims "missing in the snapshot"').toBe(0);
    await expect(page.locator('.cal__unavail button', { hasText: 'Retry' })).toBeVisible();
  } finally {
    stopServer(srv);
    await context.setOffline(false);
  }
});
