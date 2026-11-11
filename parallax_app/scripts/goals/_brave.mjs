// Shared launcher for goal scripts: headless Brave via Playwright against the dev server.
import { chromium } from '@playwright/test';
export const BASE = process.env.GOAL_BASE || 'http://127.0.0.1:5173/';
export async function launch() {
  return chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true });
}
export function watch(page, errs, tag = '') {
  page.on('pageerror', (e) => errs.push(`${tag}pageerror: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/firms-live|404/.test(m.text())) errs.push(`${tag}console: ${m.text().slice(0, 160)}`); });
}
export function finish(name, fails, info = {}) {
  console.log(JSON.stringify({ goal: name, pass: fails.length === 0, fails: fails.slice(0, 25), ...info }, null, 1));
  process.exit(fails.length ? 1 : 0);
}
