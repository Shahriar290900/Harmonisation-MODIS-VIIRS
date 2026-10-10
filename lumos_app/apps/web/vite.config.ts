/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
// BASE_PATH env lets GitHub Pages serve from /<repo>/
const base = process.env.BASE_PATH ?? './';

export default defineConfig({
  root,
  base,
  build: { outDir: fileURLToPath(new URL('../../dist', import.meta.url)), emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'basemap/*.geojson'],
      manifest: {
        name: 'Lumos Fire Calendar',
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
        runtimeCaching: [
          { urlPattern: /\/data\/.*\.(json|geojson|csv)$/, handler: 'CacheFirst', options: { cacheName: 'lumos-data', expiration: { maxEntries: 2000 } } }
        ]
      }
    })
  ],
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx', '../../tests/unit/**/*.test.ts'], globals: false }
});
