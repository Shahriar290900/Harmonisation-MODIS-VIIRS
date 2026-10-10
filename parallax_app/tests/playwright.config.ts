import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// Landing / 3-D experience specs run in their own projects (default GPU flags so SwiftShader WebGL works,
// plus a no-WebGL and a reduced-motion run). The workspace specs keep their original three projects.
const LANDING = /landing.*\.spec\.ts$/;
const noWebgl = { launchOptions: { args: ['--disable-webgl', '--disable-webgl2'] } };
const reduced = { contextOptions: { reducedMotion: 'reduce' as const } };
const lxDesktop = { browserName: 'chromium' as const, viewport: { width: 1440, height: 900 } };
const lxTablet = { browserName: 'chromium' as const, viewport: { width: 820, height: 1180 }, hasTouch: true };
const lxMobile = { browserName: 'chromium' as const, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };

export default defineConfig({
  testDir: path.join(here, 'e2e'),
  outputDir: path.join(root, 'artifacts/e2e/test-results'),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: path.join(root, 'artifacts/e2e/results.json') }]],
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
  },
  webServer: {
    command: 'npm run preview',
    cwd: root,
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', testIgnore: LANDING, use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', testIgnore: LANDING, use: { browserName: 'chromium', viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'mobile', testIgnore: LANDING, use: { browserName: 'chromium', viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
    { name: 'lx-desktop', testMatch: LANDING, use: lxDesktop },
    { name: 'lx-tablet', testMatch: LANDING, use: lxTablet },
    { name: 'lx-mobile', testMatch: LANDING, use: lxMobile },
    { name: 'lx-nowebgl-desktop', testMatch: LANDING, use: { ...lxDesktop, ...noWebgl } },
    { name: 'lx-nowebgl-mobile', testMatch: LANDING, use: { ...lxMobile, ...noWebgl } },
    { name: 'lx-reduced-desktop', testMatch: LANDING, use: { ...lxDesktop, ...reduced } },
    { name: 'lx-reduced-mobile', testMatch: LANDING, use: { ...lxMobile, ...reduced } },
  ],
});
