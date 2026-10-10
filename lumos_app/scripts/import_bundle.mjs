#!/usr/bin/env node
// Import a Notebook-B app bundle (zip or directory) into apps/web/public/data/<snapshot_id>/ and update data/index.json.
// Usage: node scripts/import_bundle.mjs <lumos_app_bundle.zip | dir> [--out <dataDir>] [--no-default] [--replace]
//
// Safety (REVIEW B1/H3, WATCHDOG F4/F5):
//  * snapshot_id must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ and contain no '..'; the destination is asserted to be a
//    direct child of --out before anything is removed.
//  * zip: entry count / total uncompressed size are capped; zip-slip paths and symlinks are rejected.
//  * every file in the bundle must be listed in checksums.sha256 (unlisted files → refuse) and match its hash.
//  * manifest.json, regions.json and a sample of activity files are schema-checked before the switch.
//  * staging happens in an OS temp dir (outside public/data); the final move is a rename; index.json is written
//    atomically (tmp + rename); every temp dir is removed on every exit path.
//  * existing snapshots are never replaced unless --replace is given (versioned paths keep SW CacheFirst safe).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { ActivityFileSchema, ManifestSchema, RegionSchema, issues } from './bundle_schema.mjs';

export const SUPPORTED_SCHEMA = ['1.0'];
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.join(REPO, 'apps', 'web', 'public', 'data');
export const SNAP_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const LIMITS = { maxEntries: 20_000, maxTotalBytes: 500 * 1024 * 1024, maxZipBytes: 300 * 1024 * 1024, activitySample: 1000 };
const IGNORED = new Set(['checksums.sha256']);

export class ImportError extends Error {}

export function validSnapshotId(id) {
  return typeof id === 'string' && SNAP_RE.test(id) && !id.includes('..');
}

function sha256File(p) {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function safeRel(rel) {
  const n = path.posix.normalize(String(rel).replace(/\\/g, '/'));
  if (!n || n === '.' || n.startsWith('../') || n === '..' || path.posix.isAbsolute(n) || /^[A-Za-z]:/.test(n) || n.includes('\0'))
    throw new ImportError(`unsafe path in bundle: ${rel}`);
  return n;
}

function rmQuiet(p) {
  if (!p) return;
  try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* best effort */ }
}

/** Extract into a fresh temp dir; the dir is removed here on any failure (F4). */
function extractZip(zipPath, limits = LIMITS) {
  const st = fs.statSync(zipPath);
  if (st.size > limits.maxZipBytes) throw new ImportError(`zip is too large (${st.size} bytes > ${limits.maxZipBytes})`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumos-import-'));
  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    if (entries.length > limits.maxEntries) throw new ImportError(`zip has too many entries (${entries.length} > ${limits.maxEntries})`);
    let declared = 0;
    for (const e of entries) declared += Math.max(0, Number(e.header?.size) || 0);
    if (declared > limits.maxTotalBytes) throw new ImportError(`zip expands to ${declared} bytes (> ${limits.maxTotalBytes})`);
    let written = 0;
    for (const e of entries) {
      const rel = safeRel(e.entryName);
      const dest = path.join(tmp, rel);
      if (!dest.startsWith(tmp + path.sep)) throw new ImportError(`unsafe path in bundle: ${e.entryName}`);
      // Unix mode bits live in the high 16 bits of the external attributes; reject symlinks (0o120000).
      const mode = (Number(e.header?.attr) >>> 16) & 0o170000;
      if (mode === 0o120000) throw new ImportError(`symlink in bundle: ${e.entryName}`);
      if (e.isDirectory) { fs.mkdirSync(dest, { recursive: true }); continue; }
      const data = e.getData();
      written += data.length;
      if (written > limits.maxTotalBytes) throw new ImportError(`zip expands to more than ${limits.maxTotalBytes} bytes`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, data);
    }
    return tmp;
  } catch (e) {
    rmQuiet(tmp);
    throw e;
  }
}

/** Locate the directory containing manifest.json (bundle root may be nested, e.g. lumos_app_bundle/). */
function findRoot(dir, depth = 0) {
  if (fs.existsSync(path.join(dir, 'manifest.json'))) return dir;
  if (depth >= 3) return null;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.isDirectory() && !d.name.startsWith('.') && d.name !== '__MACOSX') {
      const r = findRoot(path.join(dir, d.name), depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/** All entries under root as posix relative paths: { files, links } (links = symlinks / special files). */
function walk(root) {
  const files = [], links = [];
  const rec = (dir, relDir) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${d.name}` : d.name;
      if (d.isSymbolicLink()) links.push(rel);
      else if (d.isDirectory()) rec(path.join(dir, d.name), rel);
      else if (d.isFile()) files.push(rel);
      else links.push(rel);
    }
  };
  rec(root, '');
  return { files, links };
}

function readJsonOrError(fp, rel, errors) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { errors.push(`${rel}: invalid JSON (${e.message})`); return undefined; }
}

/** Evenly spaced sample (always includes first and last). */
function sample(arr, n) {
  if (arr.length <= n) return arr;
  const out = new Set();
  for (let i = 0; i < n; i++) out.add(arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
  return [...out];
}

export function verifyBundle(root, { limits = LIMITS } = {}) {
  const mp = path.join(root, 'manifest.json');
  if (!fs.existsSync(mp)) throw new ImportError('manifest.json not found');
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(mp, 'utf8')); } catch (e) { throw new ImportError(`manifest.json is not valid JSON: ${e.message}`); }
  if (!manifest || typeof manifest !== 'object') throw new ImportError('manifest.json is not an object');
  if (!SUPPORTED_SCHEMA.includes(String(manifest.schema_version)))
    throw new ImportError(`unknown schema_version '${manifest.schema_version}' (supported: ${SUPPORTED_SCHEMA.join(', ')}) — refusing to import`);
  if (!validSnapshotId(manifest.snapshot_id)) throw new ImportError(`invalid snapshot_id '${manifest.snapshot_id}'`);
  const cp = path.join(root, 'checksums.sha256');
  if (!fs.existsSync(cp)) throw new ImportError('checksums.sha256 not found');
  const lines = fs.readFileSync(cp, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  const errors = [];
  const listed = new Set();
  for (const line of lines) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line.trim());
    if (!m) { errors.push(`bad checksum line: ${line}`); continue; }
    const rel = safeRel(m[2].trim());
    listed.add(rel);
    const fp = path.join(root, rel);
    if (!fs.existsSync(fp) || !fs.lstatSync(fp).isFile()) { errors.push(`missing file: ${rel}`); continue; }
    if (sha256File(fp) !== m[1].toLowerCase()) errors.push(`checksum mismatch: ${rel}`);
  }
  if (!listed.size) errors.push('checksums.sha256 lists no files');
  if (!listed.has('manifest.json')) errors.push('manifest.json not covered by checksums.sha256');
  // Every file present must be listed (H3): no unlisted extras, no symlinks.
  const { files, links } = walk(root);
  for (const l of links) errors.push(`symlink or special file not allowed: ${l}`);
  for (const f of files) if (!IGNORED.has(f) && !listed.has(f)) errors.push(`file not listed in checksums.sha256: ${f}`);
  // manifest.files (path → sha256) must agree where it overlaps.
  for (const [rel, h] of Object.entries(manifest.files ?? {})) {
    let r;
    try { r = safeRel(rel); } catch (e) { errors.push(e.message); continue; }
    const fp = path.join(root, r);
    if (!fs.existsSync(fp)) errors.push(`manifest.files lists missing file: ${rel}`);
    else if (sha256File(fp) !== String(h).toLowerCase()) errors.push(`manifest.files sha256 mismatch: ${rel}`);
  }
  // Schema checks (H3): manifest, regions, a sample of activity files.
  const ms = ManifestSchema.safeParse(manifest);
  if (!ms.success) errors.push(`manifest.json schema: ${issues(ms.error)}`);
  const rp = path.join(root, 'regions.json');
  if (!fs.existsSync(rp)) errors.push('regions.json not found');
  else {
    const v = readJsonOrError(rp, 'regions.json', errors);
    if (v !== undefined) {
      const arr = Array.isArray(v) ? v : v?.regions;
      const rs = RegionSchema.array().min(1).safeParse(arr);
      if (!rs.success) errors.push(`regions.json schema: ${issues(rs.error)}`);
    }
  }
  const act = files.filter((f) => /^activity\/[^/]+\/\d{4}\.json$/.test(f)).sort();
  if (!act.length) errors.push('bundle contains no activity/<aoi>/<year>.json files');
  for (const rel of sample(act, limits.activitySample)) {
    const v = readJsonOrError(path.join(root, rel), rel, errors);
    if (v === undefined) continue;
    const r = ActivityFileSchema.safeParse(v);
    if (!r.success) { errors.push(`${rel} schema: ${issues(r.error)}`); continue; }
    const recs = Array.isArray(r.data) ? r.data : r.data.records;
    const aoi = rel.split('/')[1], year = rel.split('/')[2].slice(0, 4);
    for (const x of recs) {
      if (x.aoi_id !== aoi) { errors.push(`${rel}: record aoi_id '${x.aoi_id}' does not match path`); break; }
      if (!x.period_start_utc.startsWith(year)) { errors.push(`${rel}: record ${x.period_start_utc} outside ${year}`); break; }
    }
  }
  if (errors.length) throw new ImportError(`bundle verification failed (${errors.length} problems):\n  ${errors.slice(0, 20).join('\n  ')}`);
  return { manifest, nFiles: listed.size, listed: [...listed] };
}

/** Copy only the listed files (plus checksums.sha256) from src to dst. */
function copyListed(src, dst, listed) {
  fs.mkdirSync(dst, { recursive: true });
  for (const rel of [...listed, 'checksums.sha256']) {
    const s = path.join(src, rel), t = path.join(dst, rel);
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.copyFileSync(s, t);
  }
}

/** dest must be a direct child of out (guards rm/rename against '.', '..', separators). */
function assertChild(out, dest) {
  const o = path.resolve(out), d = path.resolve(dest);
  if (path.dirname(d) !== o || d === o || !d.startsWith(o + path.sep)) throw new ImportError(`refusing: ${d} is not inside ${o}`);
}

function writeFileAtomic(fp, text) {
  const tmp = `${fp}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, fp);
  } finally {
    rmQuiet(tmp);
  }
}

/** Move dir src → dest (dest must not exist). Same-FS rename; across devices copy into a sibling then rename. */
function moveDir(src, dest, out, id, cleanup) {
  try {
    fs.renameSync(src, dest);
    return;
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
  }
  const sib = fs.mkdtempSync(path.join(out, `.import-${id}-`));
  cleanup.push(sib);
  fs.cpSync(src, sib, { recursive: true });
  fs.renameSync(sib, dest);
}

export function importBundle(input, { out = DEFAULT_OUT, setDefault = true, keepExisting = true, replace, log = console.log, limits = LIMITS } = {}) {
  if (replace !== undefined) keepExisting = !replace;
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) throw new ImportError(`not found: ${input}`);
  const outAbs = path.resolve(out);
  const cleanup = [];
  try {
    let base = abs;
    if (fs.statSync(abs).isFile()) {
      if (!/\.zip$/i.test(abs)) throw new ImportError('input must be a .zip or a directory');
      base = extractZip(abs, limits);
      cleanup.push(base);
    }
    const root = findRoot(base);
    if (!root) throw new ImportError('manifest.json not found in bundle');
    const { manifest, nFiles, listed } = verifyBundle(root, { limits });
    const id = manifest.snapshot_id;
    const dest = path.join(outAbs, id);
    assertChild(outAbs, dest);
    const exists = fs.existsSync(dest);
    if (exists && keepExisting) throw new ImportError(`snapshot ${id} already exists at ${dest} (pass --replace to overwrite)`);

    // Stage outside public/data, verify the staged copy, then switch.
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), `lumos-stage-${id}-`));
    cleanup.push(staging);
    copyListed(root, staging, listed);
    verifyBundle(staging, { limits });
    fs.mkdirSync(outAbs, { recursive: true });
    let backup = null;
    if (exists) {
      log(`replacing existing snapshot ${id}`);
      backup = path.join(outAbs, `.old-${id}-${process.pid}-${Date.now()}`);
      assertChild(outAbs, backup);
      fs.renameSync(dest, backup);
      cleanup.push(backup);
    }
    try {
      moveDir(staging, dest, outAbs, id, cleanup);
    } catch (e) {
      if (backup && !fs.existsSync(dest)) { fs.renameSync(backup, dest); cleanup.splice(cleanup.indexOf(backup), 1); }
      throw e;
    }

    const ip = path.join(outAbs, 'index.json');
    let index = { snapshots: [], default: id };
    if (fs.existsSync(ip)) {
      try { index = JSON.parse(fs.readFileSync(ip, 'utf8')); } catch { log('warning: existing index.json unreadable; recreating'); }
      if (!index || typeof index !== 'object') index = { snapshots: [], default: id };
      if (!Array.isArray(index.snapshots)) index.snapshots = [];
    }
    index.snapshots = index.snapshots.filter((s) => s && s.snapshot_id !== id);
    index.snapshots.push({ snapshot_id: id, path: `data/${id}/`, synthetic: !!manifest.synthetic, release_stage: manifest.release_stage, created_utc: manifest.created_utc });
    if (setDefault || !index.default || !index.snapshots.some((s) => s.snapshot_id === index.default)) index.default = id;
    writeFileAtomic(ip, JSON.stringify(index) + '\n');
    log(`imported ${id} (${nFiles} files verified, release_stage=${manifest.release_stage}${manifest.synthetic ? ', SYNTHETIC' : ''}) → ${dest}`);
    log(`index.json default = ${index.default} (${index.snapshots.length} snapshot(s))`);
    return { snapshotId: id, dest, index };
  } finally {
    for (const p of cleanup.reverse()) rmQuiet(p);
  }
}

const USAGE = 'usage: node scripts/import_bundle.mjs <bundle.zip|dir> [--out dataDir] [--no-default] [--replace]';

function main(argv) {
  const args = argv.slice(2);
  const opts = { out: DEFAULT_OUT, setDefault: true, keepExisting: true };
  let input = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out') opts.out = path.resolve(args[++i]);
    else if (a === '--no-default') opts.setDefault = false;
    else if (a === '--keep-existing') opts.keepExisting = true; // default; kept for compatibility
    else if (a === '--replace') opts.keepExisting = false;
    else if (a === '-h' || a === '--help') { console.log(USAGE); return 0; }
    else input = a;
  }
  if (!input) { console.error(USAGE); return 2; }
  try {
    importBundle(input, opts);
    return 0;
  } catch (e) {
    console.error(`import failed: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv));
