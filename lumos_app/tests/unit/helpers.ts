import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PUBLIC = path.join(REPO, 'apps', 'web', 'public');
export const INDEX = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data', 'index.json'), 'utf8')) as { default: string };
export const SNAP_ID = INDEX.default;
export const SNAP_DIR = path.join(PUBLIC, 'data', SNAP_ID);

export function readJson<T = unknown>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(SNAP_DIR, rel), 'utf8')) as T;
}

/** fetch() replacement serving apps/web/public from disk; baseUrl must be '/'. */
export async function diskFetch(url: string) {
  const rel = decodeURIComponent(url.replace(/^\/+/, '').replace(/^\.\//, ''));
  const fp = path.join(PUBLIC, rel);
  if (!fp.startsWith(PUBLIC) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) return { ok: false, status: 404, text: async () => '' };
  return { ok: true, status: 200, text: async () => fs.readFileSync(fp, 'utf8') };
}

export function activityFiles(): string[] {
  const out: string[] = [];
  const root = path.join(SNAP_DIR, 'activity');
  for (const aoi of fs.readdirSync(root)) for (const f of fs.readdirSync(path.join(root, aoi))) if (f.endsWith('.json')) out.push(`activity/${aoi}/${f}`);
  return out.sort();
}
