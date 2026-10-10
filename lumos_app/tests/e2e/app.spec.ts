import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { HAS_USA, MONTHS, SNAP, SNAP_REGIONS, cell, gotoApp, hasRegion, isMobile, note, openEvidence, selectAoi, shot, showCalendar, trackErrors, waitCalendar } from './helpers';

test.describe('Lumos Fire Calendar e2e', () => {
  test('01 loads with DEMO banner, UI-prototype stage tag, no console errors', async ({ page }, ti) => {
    const errs = trackErrors(page);
    await gotoApp(page);
    await expect(page.locator('.demo-banner')).toBeVisible();
    await expect(page.locator('.demo-banner')).toContainText('DEMO DATA');
    const pill = page.locator('.topbar .stage-tag');
    await expect(pill).toHaveAttribute('aria-label', /UI prototype/);
    await expect(pill).toContainText(isMobile(ti) ? 'Prototype' : 'UI prototype');
    await page.waitForTimeout(2500); // allow map + SW to settle
    await shot(page, ti, '01-load');
    note(ti, 'console-errors', JSON.stringify(errs));
    expect(errs.page, 'uncaught page errors').toEqual([]);
    expect(errs.console, 'console errors').toEqual([]);
  });

  test('02 linked selection across calendar/drawer/chart/map/hash, survives reload', async ({ page }, ti) => {
    await gotoApp(page, '#aoi=BGD&y=2016&m=3');
    const selLine = page.locator('line.chart__sel');
    await expect(selLine).toBeAttached();
    const x0 = await selLine.getAttribute('x1');
    await cell(page, 2018, 8).click();
    await expect(cell(page, 2018, 8)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.evidence__title h2')).toContainText('August 2018');
    await expect(page.locator('.evidence__explain')).toContainText(/Aug(ust)? 2018/);
    await expect(page.locator('.map .panel__title')).toContainText('Aug 2018');
    await expect(page.locator('.map .panel__title')).toContainText('Bangladesh');
    await expect.poll(() => selLine.getAttribute('x1')).not.toBe(x0);
    await expect(page).toHaveURL(/aoi=BGD&y=2018&m=8/);
    await shot(page, ti, '02-linked');
    await page.reload();
    await waitCalendar(page);
    await expect(cell(page, 2018, 8)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.evidence__title h2')).toContainText('August 2018');
  });

  test('03 keyboard navigation of calendar grid', async ({ page }, ti) => {
    await gotoApp(page, '#aoi=BGD&y=2016&m=3');
    await page.locator('.cal__cell[data-sel="true"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, 2016, 4)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(cell(page, 2017, 4)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await expect(cell(page, 2016, 3)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(cell(page, 2016, 12)).toHaveAttribute('aria-selected', 'true');
    // focus follows selection (roving tabindex)
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
    expect(focused).toMatch(/^Dec 2016:/);
    await expect(page.locator('.evidence__title h2')).toContainText('December 2016');
    await shot(page, ti, '03-keyboard');
    if (isMobile(ti)) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const tab = await page.locator('.tabbar button[aria-current="page"]').innerText();
      note(ti, 'enter-on-cell-mobile', `After Enter on focused cell the active tab is "${tab.trim()}"`);
      // E2E B4 (fixed): Enter/Space on a focused cell opens the Evidence tab in compact mode.
      await expect(page.locator('.tabbar button[aria-current="page"]')).toContainText('Evidence');
      await expect(page.locator('.evidence__title h2')).toContainText('December 2016');
    }
  });

  test('04 missing != zero: AUS 2016 VIIRS missing', async ({ page }, ti) => {
    await gotoApp(page, '#aoi=AUS&y=2016&m=6');
    await expect(page.locator('select[aria-label="Area of interest"]')).toHaveValue('AUS');
    const row = page.locator('.cal__cell[aria-label*=" 2016:"]');
    await expect(row).toHaveCount(12);
    for (let m = 1; m <= 12; m++) {
      const c = cell(page, 2016, m);
      const cls = (await c.getAttribute('class')) ?? '';
      expect(cls, `${MONTHS[m - 1]} 2016 state`).toMatch(/st-(partial|missing)/);
      expect(cls).not.toContain('is-zero');
      expect((await c.innerText()).trim()).not.toBe('0');
      await expect(c.locator('svg.glyph')).toHaveCount(1);
    }
    await openEvidence(page, ti);
    const viirs = page.locator('.kv', { has: page.locator('dt', { hasText: 'S-NPP VIIRS' }) }).locator('dd');
    await expect(viirs).toHaveText('—');
    await expect(page.locator('.evidence .badge').first()).toContainText(/Partial|Missing/);
    const explain = await page.locator('.evidence__explain').innerText();
    note(ti, 'aus2016-explain', explain.replace(/\s+/g, ' ').slice(0, 300));
    expect(explain).not.toMatch(/\bVIIRS[^.]*\b0 detections/);
    await shot(page, ti, '04-missing');
  });

  test('04b whole-country AUS / USA: no cell grid, the map says which state to pick (driven by cells_exported)', async ({ page }, ti) => {
    test.skip(isMobile(ti), 'table-mode message is checked on desktop/tablet');
    const countries = SNAP_REGIONS.filter((r) => r.kind === 'country' && r.cells_exported === false);
    expect(countries.map((r) => r.aoi_id)).toContain('AUS');
    expect(countries.map((r) => r.aoi_id)).toContain('USA');
    for (const c of countries) {
      const subs = SNAP_REGIONS.filter((r) => r.kind === 'admin1' && r.country === c.country && r.cells_exported);
      await page.goto(`./?nowebgl#aoi=${c.aoi_id}&y=2016&m=6`);
      await waitCalendar(page);
      const fb = page.locator('.map__fallback');
      await expect(fb).toContainText(`whole-country ${c.name} is too large`);
      for (const s of subs) await expect(fb).toContainText(s.name);
    }
  });

  test('04c AOI picker lists every region of regions.json, grouped by country; default stays Bangladesh', async ({ page }, ti) => {
    await gotoApp(page, '#aoi=BGD&y=2016&m=3');
    const sel = page.locator('select[aria-label="Area of interest"]');
    await expect(sel).toHaveValue('BGD'); // default region stays Bangladesh
    const values = await sel.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(values.sort()).toEqual(SNAP_REGIONS.map((r) => r.aoi_id).sort());
    const groups = await sel.locator('optgroup').evaluateAll((gs) => gs.map((g) => (g as HTMLOptGroupElement).label));
    expect(groups).toEqual([...new Set(SNAP_REGIONS.map((r) => r.country))]);
  });

  test('04d USA-CA opens with its cell grid', async ({ page }, ti) => {
    expect(HAS_USA).toBe(true);
    await gotoApp(page, '#aoi=BGD&y=2016&m=3');
    await selectAoi(page, 'USA-CA');
    await expect(page.locator('.cal-panel .panel__title')).toContainText('California');
    await expect(page.locator('.map__legend-sub, .map__fallback')).not.toContainText('No cell grid exported', { timeout: 15_000 });
    note(ti, 'usa-ca', 'cells + features first-class');
  });

  test('05 AOI switch BGD -> BGD-B -> AUS-NSW -> USA-CA, 2001-2002 unsupported', async ({ page }, ti) => {
    await gotoApp(page, '#aoi=BGD&y=2016&m=3');
    // names come from regions.json
    const walk = ['BGD-B', 'AUS-NSW', 'USA-CA'].filter(hasRegion).map((id) => [id, SNAP_REGIONS.find((r) => r.aoi_id === id)!.name] as const);
    for (const [id, name] of walk) {
      await selectAoi(page, id);
      await expect(page.locator('.cal-panel .panel__title')).toContainText(name);
      await expect(page.locator('.map .panel__title')).toContainText(name);
      await expect(page.locator('.evidence__title h2')).toContainText(name);
      for (const y of [2001, 2002]) {
        const cls = await page.locator(`.cal__cell[aria-label*=" ${y}:"]`).evaluateAll((els) => els.map((e) => e.className));
        expect(cls.length).toBe(12);
        // CONTRACT: 2001–2002 unsupported (2002 H2 may carry an estimate if supported; record)
        const uns = cls.filter((c) => c.includes('st-unsupported')).length;
        note(ti, `${id}-${y}-unsupported`, `${uns}/12`);
        expect(uns).toBe(12);
      }
      await expect(page.locator('.map__legend-sub, .map__fallback')).not.toContainText('Loading cells', { timeout: 15_000 });
      await shot(page, ti, `05-aoi-${id}`);
    }
  });

  test('06 harmonize-in-browser toggle shows parity (CircleCheck)', async ({ page }, ti) => {
    await gotoApp(page, '#aoi=BGD&y=2016&m=3');
    await openEvidence(page, ti);
    const sw = page.locator('.harm input[role="switch"]');
    await sw.scrollIntoViewIfNeeded();
    await page.locator('.harm label.switch').click();
    await expect(sw).toBeChecked();
    const parity = page.locator('.harm .parity');
    await expect(parity).toBeVisible({ timeout: 15_000 });
    note(ti, 'parity', (await parity.innerText()).replace(/\s+/g, ' '));
    await expect(parity).toContainText('Parity');
    await expect(parity).not.toContainText('fails');
    await expect(parity.locator('svg.i3d--teal')).toHaveCount(1);
    await parity.scrollIntoViewIfNeeded();
    await shot(page, ti, '06-harmonize');
  });

  test('07 CSV export has snapshot/release/provenance; print brief has metadata', async ({ page }, ti) => {
    await gotoApp(page, '#aoi=BGD&y=2016&m=3');
    if (isMobile(ti)) await openEvidence(page, ti);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.evidence__actions button', { hasText: 'Export CSV' }).click()]);
    const p = await dl.path();
    const csv = fs.readFileSync(p!, 'utf8');
    fs.mkdirSync(ti.outputDir, { recursive: true });
    fs.writeFileSync(`${ti.outputDir}/export.csv`, csv);
    note(ti, 'csv-filename', dl.suggestedFilename());
    const snap = SNAP;
    expect(csv).toContain(snap);
    expect(csv).toMatch(/ui_prototype/);
    const header = csv.split(/\r?\n/).find((l) => /period_start_utc/.test(l)) ?? '';
    note(ti, 'csv-header', header.slice(0, 400));
    expect(header).toMatch(/provenance/);
    expect(header).toMatch(/snapshot_id|release_stage/);

    // Print brief via hidden iframe: intercept print() and read the iframe document.
    await page.evaluate(() => {
      (window as unknown as { __briefs: string[] }).__briefs = [];
      new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
        if (n instanceof HTMLIFrameElement) {
          const w = n.contentWindow!; w.print = () => {};
          setTimeout(() => { (window as unknown as { __briefs: string[] }).__briefs.push(n.contentDocument?.documentElement.outerHTML ?? ''); }, 100);
        }
      }))).observe(document.body, { childList: true });
    });
    await page.locator('.evidence__actions button', { hasText: 'Print brief' }).click();
    const html = await expect.poll(() => page.evaluate(() => (window as unknown as { __briefs: string[] }).__briefs[0] ?? ''), { timeout: 5000 }).not.toBe('')
      .then(() => page.evaluate(() => (window as unknown as { __briefs: string[] }).__briefs[0]));
    fs.writeFileSync(`${ti.outputDir}/brief.html`, html);
    for (const s of [snap, 'Bangladesh', 'UTC', 'MODIS']) expect(html, `brief contains ${s}`).toContain(s);
    expect(html).toMatch(/UI prototype|ui_prototype/);
    expect(html).toMatch(/DEMO|SYNTHETIC|synthetic/i);
    // render brief for the record
    const b = await page.context().newPage();
    await b.setContent(html);
    await shot(b, ti, '07-brief', true);
    await b.close();
  });

  test('08 mobile tabs keep selection; touch target sizes', async ({ page }, ti) => {
    test.skip(!isMobile(ti), 'mobile only');
    await gotoApp(page, '#aoi=BGD&y=2016&m=3');
    await cell(page, 2019, 11).click();
    await expect(page.locator('.selsum__when')).toHaveText('Nov 2019');
    for (const t of ['Map', 'Evidence', 'Calendar', 'Evidence']) {
      await page.locator('.tabbar button', { hasText: t }).click();
      await expect(page.locator('.tabbar button[aria-current="page"]')).toContainText(t);
      await expect(page).toHaveURL(/y=2019&m=11/);
      if (t === 'Map') await expect(page.locator('.map .panel__title')).toContainText('Nov 2019');
      if (t === 'Evidence') await expect(page.locator('.evidence__title h2')).toContainText('November 2019');
      if (t === 'Calendar') await expect(cell(page, 2019, 11)).toHaveAttribute('aria-selected', 'true');
      await shot(page, ti, `08-tab-${t.toLowerCase()}`);
    }
    await page.locator('.tabbar button', { hasText: 'Calendar' }).click();
    const tabs = await page.locator('.tabbar button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    const c = await cell(page, 2019, 11).boundingBox();
    const others: Record<string, number[]> = {};
    for (const [k, sel] of Object.entries({ aoiSelect: 'select[aria-label="Area of interest"]', pill: '.topbar .stage-tag', models: '.topbar__right button:has-text("Models")', explain: '.topbar__right .btn--ghost >> nth=0', evidenceBtn: '.selsum button', replay: '.replay button' })) {
      const bb = await page.locator(sel).first().boundingBox();
      if (bb) others[k] = [Math.round(bb.width), Math.round(bb.height)];
    }
    note(ti, 'touch-tabs', JSON.stringify(tabs));
    note(ti, 'touch-cell', JSON.stringify([Math.round(c!.width), Math.round(c!.height)]));
    note(ti, 'touch-other', JSON.stringify(others));
    for (const [, h] of tabs) expect(h).toBeGreaterThanOrEqual(44);
    // E2E B2 (fixed): ≥44×44 px targets on mobile (grid scrolls horizontally with a sticky year column).
    expect(c!.height, 'calendar cell height ≥44px').toBeGreaterThanOrEqual(44);
    expect(c!.width, 'calendar cell width ≥44px').toBeGreaterThanOrEqual(44);
    for (const k of ['aoiSelect', 'pill', 'explain', 'models', 'evidenceBtn', 'replay']) {
      expect(others[k]?.[1] ?? 0, `${k} height ≥44px`).toBeGreaterThanOrEqual(44);
      expect(others[k]?.[0] ?? 0, `${k} width ≥44px`).toBeGreaterThanOrEqual(44);
    }
  });

  test('11 model panel: comparison rows, QML labelled research/simulated', async ({ page }, ti) => {
    await gotoApp(page);
    await page.locator('.topbar__right button', { hasText: 'Models' }).click();
    const dlg = page.locator('dialog[open]');
    await expect(dlg).toBeVisible();
    const rows = dlg.locator('.models > .table-wrap tbody tr');
    await expect(rows.first()).toBeVisible();
    const n = await rows.count();
    note(ti, 'model-rows', String(n));
    expect(n).toBeGreaterThan(0);
    await expect(dlg.locator('.qml .badge--research')).toContainText(/research/i);
    await expect(dlg.locator('.qml .badge--research')).toContainText(/simulated/i);
    const qn = await dlg.locator('.qml tbody tr').count();
    note(ti, 'qml-rows', String(qn));
    expect(qn).toBeGreaterThan(0);
    await shot(page, ti, '11-models');
  });

  test('12 explainer modal opens, Escape closes, focus returns', async ({ page }, ti) => {
    await gotoApp(page);
    const btn = page.locator('.topbar__right .btn--ghost').first();
    await btn.focus();
    await page.keyboard.press('Enter');
    const dlg = page.locator('dialog[open]');
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('What is harmonization?');
    await shot(page, ti, '12-explainer');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    const focusedIsBtn = await btn.evaluate((el) => el === document.activeElement);
    expect(focusedIsBtn, 'focus returns to opener').toBe(true);
  });

  test('10 ?nowebgl -> table fallback, calendar still works', async ({ page }, ti) => {
    await page.goto('./?nowebgl#aoi=BGD&y=2016&m=3');
    await waitCalendar(page);
    if (isMobile(ti)) await page.locator('.tabbar button', { hasText: 'Map' }).click();
    await expect(page.locator('.map__fallback .notice')).toContainText('WebGL is not available');
    await expect(page.locator('.map__fallback table.tbl')).toBeAttached({ timeout: 15_000 });
    expect(await page.locator('.map__fallback tbody tr').count()).toBeGreaterThan(0);
    await expect(page.locator('.map__canvas canvas')).toHaveCount(0);
    await shot(page, ti, '10-nowebgl-map');
    await showCalendar(page, ti);
    await cell(page, 2017, 2).click();
    await expect(page.locator('.evidence__title h2')).toContainText('February 2017');
    await expect(page.locator('.map__fallback caption')).toBeAttached();
    await shot(page, ti, '10-nowebgl-cal');
  });
});

