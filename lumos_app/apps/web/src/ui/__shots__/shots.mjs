// Screenshot script: node apps/web/src/ui/__shots__/shots.mjs [outDir] [baseUrl]
// WATCHDOG F6: the browser is always closed (try/finally), navigation waits for 'load' (not 'networkidle', which can
// stall on the service worker / map tiles), and a global watchdog kills the run after 3 minutes.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '/home/claude/lumos_app/artifacts/screens';
const base = process.argv[3] ?? 'http://localhost:4173/';
const exe = process.env.LUMOS_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let b = null;
const watchdog = setTimeout(async () => {
  console.error('shots: watchdog timeout, closing browser');
  try { await b?.close(); } finally { process.exit(2); }
}, 180_000);

// Detailed regions (cells + features exported: BGD, AUS-NSW, USA-CA in the v1.2 set) come from the snapshot's regions.json.
async function detailedAois() {
  try {
    const idx = await (await fetch(new URL('data/index.json', base))).json();
    const regions = await (await fetch(new URL(`data/${idx.default}/regions.json`, base))).json();
    const ids = regions.filter((r) => r.cells_exported === true && r.features_exported === true).map((r) => r.aoi_id);
    if (ids.length) return ids;
  } catch { /* fall through */ }
  return ['BGD', 'AUS-NSW', 'USA-CA'];
}

async function settle(p, ms = 1500) {
  await p.locator('.cal__grid').waitFor({ timeout: 20_000 });
  await p.waitForFunction(() => !document.querySelector('.cal__cell.st-loading'), null, { timeout: 20_000 });
  await p.waitForTimeout(ms);
}

try {
  b = await chromium.launch({ executablePath: exe });
  const views = [['desktop', 1440, 900], ['tablet', 820, 1180], ['mobile', 360, 780]];
  for (const [name, w, h] of views) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: name === 'mobile' ? 2 : 1, hasTouch: name !== 'desktop', isMobile: name === 'mobile', serviceWorkers: 'block' });
    try {
      ctx.setDefaultTimeout(15_000);
      const p = await ctx.newPage();
      const errs = [];
      p.on('console', (m) => m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text()) && errs.push(m.text()));
      p.on('pageerror', (e) => errs.push(String(e)));
      await p.goto(base + '#aoi=BGD&y=2016&m=3', { waitUntil: 'load' });
      await settle(p, 2500);
      await p.screenshot({ path: `${out}/${name}.png`, fullPage: false });
      await p.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
      if (name === 'mobile') {
        await p.getByRole('button', { name: /^.?\s*Map$/ }).click(); await p.waitForTimeout(2000);
        await p.screenshot({ path: `${out}/mobile-map.png` });
        await p.getByRole('button', { name: /^.?\s*Evidence$/ }).last().click(); await p.waitForTimeout(800);
        await p.screenshot({ path: `${out}/mobile-evidence.png`, fullPage: true });
        await p.getByRole('button', { name: /^.?\s*Calendar$/ }).click();
      }
      if (name === 'desktop') {
        await p.getByRole('button', { name: 'What is harmonization?' }).click(); await p.waitForTimeout(500);
        await p.screenshot({ path: `${out}/desktop-explainer.png` });
        await p.keyboard.press('Escape');
        await p.getByRole('button', { name: 'Models' }).click(); await p.waitForTimeout(800);
        await p.screenshot({ path: `${out}/desktop-models.png` });
        await p.keyboard.press('Escape');
        await p.getByRole('button', { name: /UI prototype/ }).click(); await p.waitForTimeout(400);
        await p.screenshot({ path: `${out}/desktop-about.png` });
        await p.keyboard.press('Escape');
        await p.getByRole('button', { name: /All evidence/ }).click(); await p.waitForTimeout(500);
        await p.getByText('Recompute from exported weights').click(); await p.waitForTimeout(1500);
        await p.screenshot({ path: `${out}/desktop-drawer.png` });
        await p.getByRole('button', { name: /Close/ }).click();
        await p.locator('[role=gridcell][aria-selected=true]').focus();
        for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight']) await p.keyboard.press(k);
        await p.waitForTimeout(600);
        console.log('after keys hash', await p.evaluate(() => location.hash));
        await p.screenshot({ path: `${out}/desktop-keyboard.png` });
      }
      // Unavailable (failed to load) state: some years of Sylhet fail, the rest load.
      await p.route(/\/activity\/BGD-G\/20(0[5-9]|1[0-2])\.json$/, (r) => r.abort('failed'));
      await p.selectOption('select[aria-label="Area of interest"]', 'BGD-G');
      await settle(p, 800);
      await p.screenshot({ path: `${out}/${name}-unavailable.png`, fullPage: name !== 'desktop' });
      console.log(name, errs.length ? errs.slice(0, 5) : 'no errors');
    } finally {
      await ctx.close();
    }
  }
  // WebGL-disabled fallback: one shot per detailed region (first-class regions all get the same treatment)
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  try {
    const p = await ctx.newPage();
    for (const aoi of await detailedAois()) {
      await p.goto(base + `?nowebgl#aoi=${aoi}&y=2019&m=12`, { waitUntil: 'load' });
      await settle(p, 1500);
      await p.screenshot({ path: `${out}/desktop-nowebgl-${aoi}.png` });
    }
  } finally {
    await ctx.close();
  }
} finally {
  clearTimeout(watchdog);
  await b?.close();
}
