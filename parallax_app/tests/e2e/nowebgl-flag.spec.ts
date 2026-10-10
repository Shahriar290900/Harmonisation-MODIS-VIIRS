import { test, expect } from '@playwright/test';
import { cell, note, shot, waitCalendar } from './helpers';

test.use({ launchOptions: { args: ['--disable-webgl', '--disable-webgl2'] } });

test('10b --disable-webgl launch flag -> table fallback, calendar works', async ({ page }, ti) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('./#aoi=BGD&y=2016&m=3');
  await waitCalendar(page);
  const gl = await page.evaluate(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); });
  note(ti, 'webgl-available', String(gl));
  if (ti.project.name === 'mobile') await page.locator('.tabbar button', { hasText: 'Map' }).click();
  await expect(page.locator('.map__fallback .notice')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.map__fallback table.tbl')).toBeAttached();
  await shot(page, ti, '10b-disable-webgl');
  if (ti.project.name === 'mobile') await page.locator('.tabbar button', { hasText: 'Calendar' }).click();
  await cell(page, 2015, 5).click();
  await expect(page.locator('.evidence__title h2')).toContainText('May 2015');
  expect(errs).toEqual([]);
});
