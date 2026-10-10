import { chromium } from 'playwright-core';
import fs from 'node:fs';
const dir = '/home/claude/lumos_app/apps/web/public/icons/';
const svg = fs.readFileSync(dir + 'logo.svg', 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
for (const [name, size, mask] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-512-maskable.png', 512, true], ['apple-touch-icon.png', 180, false]]) {
  await p.setViewportSize({ width: size, height: size });
  const pad = mask ? size * 0.18 : size * 0.04;
  await p.setContent(`<html><body style="margin:0;background:#0B1220;width:${size}px;height:${size}px;display:grid;place-items:center">
    <div style="width:${size - 2 * pad}px;height:${size - 2 * pad}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  await p.screenshot({ path: dir + name, omitBackground: false });
}
await b.close();
console.log('ok');
