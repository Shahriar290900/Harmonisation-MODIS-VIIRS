import { expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ARTIFACTS = path.resolve(here, '../../artifacts/e2e');

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type Errors = { console: string[]; page: string[] };

/** Collect console errors + uncaught page errors. */
export function trackErrors(page: Page): Errors {
  const e: Errors = { console: [], page: [] };
  page.on('console', (m) => { if (m.type() === 'error') e.console.push(m.text()); });
  page.on('pageerror', (err) => e.page.push(String(err)));
  return e;
}

export const cell = (page: Page, y: number, m: number) => page.locator(`.cal__cell[aria-label^="${MONTHS[m - 1]} ${y}:"]`);

/** Wait until the calendar has loaded records (at least one non-missing cell). */
export async function waitCalendar(page: Page) {
  await expect(page.locator('.cal__grid')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.cal__cell.st-observed, .cal__cell.st-estimated, .cal__cell.st-partial').first()).toBeAttached({ timeout: 20_000 });
}

export async function gotoApp(page: Page, suffix = '') {
  // '/' (empty hash) is now the landing experience; the workspace lives at '#/app' or any '#aoi=…' deep link.
  await page.goto('./' + (suffix || '#/app'));
  await waitCalendar(page);
}

export async function selectAoi(page: Page, id: string) {
  await page.selectOption('select[aria-label="Area of interest"]', id);
  await expect(page).toHaveURL(new RegExp(`aoi=${id.replace('-', '\\-')}(&|$)`));
  await waitCalendar(page);
}

export const isMobile = (ti: TestInfo) => ti.project.name === 'mobile';
export const isDesktop = (ti: TestInfo) => ti.project.name === 'desktop';

/** Make the full evidence drawer visible for the current layout. */
export async function openEvidence(page: Page, ti: TestInfo) {
  if (isMobile(ti)) {
    await page.locator('.tabbar button', { hasText: 'Evidence' }).click();
  } else if (isDesktop(ti)) {
    const btn = page.locator('.evidence__actions button', { hasText: 'All evidence' });
    if (await btn.count()) await btn.click();
  }
  await expect(page.locator('.evidence.is-open')).toBeAttached();
}

export async function showCalendar(page: Page, ti: TestInfo) {
  if (isMobile(ti)) await page.locator('.tabbar button', { hasText: 'Calendar' }).click();
}

export const shot = (page: Page, ti: TestInfo, name: string, fullPage = false) =>
  page.screenshot({ path: path.join(ARTIFACTS, `${ti.project.name}-${name}.png`), fullPage });

export function note(ti: TestInfo, type: string, description: string) {
  ti.annotations.push({ type, description });
  console.log(`[${ti.project.name}] ${type}: ${description}`);
}

// ───────── three-region set (CONTRACT §8/§9): the AOI list is read from the snapshot on disk, never hard-coded ─────────
const PUBLIC_DATA = path.resolve(here, '../../apps/web/public/data');
export interface SnapRegion { aoi_id: string; name: string; country: string; kind: 'country' | 'admin1'; cells_exported?: boolean; features_exported?: boolean }
const readJson = <T,>(p: string): T => JSON.parse(fs.readFileSync(p, 'utf8')) as T;
export const SNAP = readJson<{ default: string }>(path.join(PUBLIC_DATA, 'index.json')).default;
export const SNAP_REGIONS = readJson<SnapRegion[]>(path.join(PUBLIC_DATA, SNAP, 'regions.json'));
export const hasRegion = (id: string) => SNAP_REGIONS.some((r) => r.aoi_id === id);
/** Registry display kind (CONTRACT §9): admin1 in Bangladesh = Division, elsewhere = State. */
export const displayKind = (r: SnapRegion) => (r.kind === 'country' ? 'Country' : r.aoi_id.startsWith('BGD') ? 'Division' : 'State');
/** True when the snapshot carries the three-region AOI set (USA + USA-CA). */
export const HAS_USA = hasRegion('USA') && hasRegion('USA-CA');
