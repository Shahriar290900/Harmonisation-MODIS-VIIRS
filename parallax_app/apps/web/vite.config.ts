/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const root = fileURLToPath(new URL('.', import.meta.url));
// BASE_PATH env lets GitHub Pages serve from /<repo>/
const base = process.env.BASE_PATH ?? './';

// Dev only: serve the Netlify functions (netlify/functions/*.mts) at /api/* so the dev server shows real live data.
// Each response is kept (memory + a file in node_modules/.cache, so it survives a restart) for its CDN cache time, failures too (the CelesTrak
// policy says: no retries after an error, at most one request per 2 hours), so reloads never hammer NASA or CelesTrak.
const FUNCTIONS = ['firms-live', 'sats', 'gibs-times'];
function apiDevMiddleware(): Plugin {
  const cache = new Map<string, { until: number; status: number; headers: [string, string][]; body: Buffer }>();
  const fnDir = fileURLToPath(new URL('../../netlify/functions/', import.meta.url));
  const diskDir = fileURLToPath(new URL('../../node_modules/.cache/parallax-api/', import.meta.url));
  const file = (key: string) => diskDir + createHash('sha1').update(key).digest('hex') + '.json';
  const readDisk = (key: string) => {
    try {
      const j = JSON.parse(fs.readFileSync(file(key), 'utf8'));
      return j.until > Date.now() ? { ...j, body: Buffer.from(j.body, 'base64') } : undefined;
    } catch { return undefined; }
  };
  const writeDisk = (key: string, v: { until: number; status: number; headers: [string, string][]; body: Buffer }) => {
    try { fs.mkdirSync(diskDir, { recursive: true }); fs.writeFileSync(file(key), JSON.stringify({ ...v, body: v.body.toString('base64') })); } catch { /* cache is optional */ }
  };
  return {
    name: 'parallax-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/api\/([a-z-]+)(\?.*)?$/.exec(req.url ?? '');
        if (!m || !FUNCTIONS.includes(m[1]) || (req.method && req.method !== 'GET')) return next();
        const key = req.url as string;
        const hit = cache.get(key) ?? readDisk(key);
        let out = hit && hit.until > Date.now() ? hit : null;
        if (!out) {
          try {
            const mod = await server.ssrLoadModule(fnDir + m[1] + '.mts');
            const r: Response = await mod.default(new Request('http://localhost' + key));
            const body = Buffer.from(await r.arrayBuffer());
            const cc = r.headers.get('netlify-cdn-cache-control') ?? '';
            const ttl = r.ok ? Number(/s-maxage=(\d+)/.exec(cc)?.[1] ?? 0) * 1000 : m[1] === 'sats' ? 7_200_000 : 300_000;
            out = { until: Date.now() + (r.ok && !ttl ? 0 : ttl || 60_000), status: r.status, headers: [...r.headers.entries()].filter(([k]) => k !== 'netlify-cdn-cache-control'), body };
            if (out.until > Date.now()) { cache.set(key, out); writeDisk(key, out); }
          } catch (e) {
            res.statusCode = 502; res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'function failed', detail: String((e as Error)?.message ?? e) }));
            return;
          }
        }
        res.statusCode = out.status;
        for (const [k, v] of out.headers) if (k !== 'content-length' && k !== 'content-encoding') res.setHeader(k, v);
        res.setHeader('cache-control', 'no-store');
        res.end(out.body);
      });
    }
  };
}

export default defineConfig({
  root,
  base,
  build: { outDir: fileURLToPath(new URL('../../dist', import.meta.url)), emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  plugins: [
    react(),
    apiDevMiddleware(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'basemap/*.geojson'],
      manifest: {
        name: 'Parallax Fire',
        short_name: 'Fire Calendar',
        description: 'Harmonized MODIS + VIIRS burning-activity calendar (NASA Space Apps 2026, Team Lumos)',
        theme_color: '#0B1220',
        background_color: '#0B1220',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'basemap/*.geojson', 'data/index.json', 'data/*/manifest.json', 'data/*/regions.json', 'data/*/geo/*.geojson'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Live FIRMS function: never serve from the precache fallback, never cache in the SW.
        navigateFallbackDenylist: [/^\/api\//, /^\/\.netlify\//],
        runtimeCaching: [
          { urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/'), handler: 'NetworkOnly' },
          { urlPattern: /\/geo-admin2\/.*\.geojson$/, handler: 'CacheFirst', options: { cacheName: 'parallax-admin2-geo', expiration: { maxEntries: 20 } } },
          { urlPattern: /\/data\/.*\.(json|geojson|csv)$/, handler: 'CacheFirst', options: { cacheName: 'parallax-data', expiration: { maxEntries: 2000 } } }
        ]
      }
    })
  ],
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx', '../../tests/unit/**/*.test.ts'], globals: false, testTimeout: 60_000 }
});
