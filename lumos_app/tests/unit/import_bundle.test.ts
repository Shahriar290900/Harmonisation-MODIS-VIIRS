// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { SNAP_DIR, SNAP_ID } from './helpers';
// @ts-expect-error plain .mjs without types
import { importBundle, verifyBundle } from '../../scripts/import_bundle.mjs';
import { createHash } from 'node:crypto';

const quiet = () => {};
const made: string[] = [];
function tmp(name: string) { const d = fs.mkdtempSync(path.join(os.tmpdir(), `lumos-${name}-`)); made.push(d); return d; }
afterAll(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
function copyBundle(): string {
  const d = path.join(tmp('src'), 'lumos_app_bundle');
  fs.cpSync(SNAP_DIR, d, { recursive: true });
  return d;
}

/** Self-contained zip-slip archive: one entry whose name escapes the extraction root (adm-zip cannot add such a name directly). */
function makeSlipZip(): string {
  const zip = new AdmZip();
  zip.addFile('ok/manifest.json', Buffer.from('{}'));
  const zp = path.join(tmp('slip'), 'slip.zip');
  zip.writeZip(zp);
  const z2 = new AdmZip(zp);
  z2.getEntries()[0].entryName = '../evil/manifest.json';
  z2.writeZip(zp);
  return zp;
}

describe('scripts/import_bundle.mjs', () => {
  it('roundtrip from zip: verifies, copies, keeps other snapshots, sets default', () => {
    const src = copyBundle();
    const zip = new AdmZip();
    zip.addLocalFolder(src, 'lumos_app_bundle');
    const zp = path.join(tmp('zip'), 'lumos_app_bundle.zip');
    zip.writeZip(zp);
    const out = tmp('out');
    fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ snapshots: [{ snapshot_id: 'older', path: 'data/older/' }], default: 'older' }));
    const res = importBundle(zp, { out, log: quiet });
    expect(res.snapshotId).toBe(SNAP_ID);
    const idx = JSON.parse(fs.readFileSync(path.join(out, 'index.json'), 'utf8'));
    expect(idx.default).toBe(SNAP_ID);
    expect(idx.snapshots.map((s: { snapshot_id: string }) => s.snapshot_id).sort()).toEqual(['older', SNAP_ID].sort());
    expect(idx.snapshots.find((s: { snapshot_id: string }) => s.snapshot_id === SNAP_ID).path).toBe(`data/${SNAP_ID}/`);
    for (const rel of ['manifest.json', 'activity/BGD/2016.json', 'models/B1_poisson/weights.json', 'features/BGD/2016.json'])
      expect(fs.readFileSync(path.join(out, SNAP_ID, rel))).toEqual(fs.readFileSync(path.join(src, rel)));
    // re-import from directory with --no-default keeps 'older' default? (default already ours; set to older first)
    idx.default = 'older'; fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(idx));
    expect(() => importBundle(src, { out, setDefault: false, log: quiet })).toThrow(/already exists/); // keep-existing is the default
    importBundle(src, { out, setDefault: false, replace: true, log: quiet });
    const idx2 = JSON.parse(fs.readFileSync(path.join(out, 'index.json'), 'utf8'));
    expect(idx2.default).toBe('older');
    expect(idx2.snapshots).toHaveLength(2);
  });
  it('refuses a checksum mismatch', () => {
    const src = copyBundle();
    fs.appendFileSync(path.join(src, 'activity', 'BGD', '2016.json'), ' ');
    expect(() => importBundle(src, { out: tmp('out'), log: quiet })).toThrow(/checksum mismatch: activity\/BGD\/2016.json/);
  });
  it('refuses unknown schema_version', () => {
    const src = copyBundle();
    const mp = path.join(src, 'manifest.json');
    fs.writeFileSync(mp, fs.readFileSync(mp, 'utf8').replace('"schema_version": "1.0"', '"schema_version": "2.0"'));
    const out = tmp('out');
    expect(() => importBundle(src, { out, log: quiet })).toThrow(/unknown schema_version '2.0'/);
    expect(fs.existsSync(path.join(out, 'index.json'))).toBe(false);
  });
  it('refuses zip-slip entries', () => {
    const zp = makeSlipZip();
    expect(() => importBundle(zp, { out: tmp('out'), log: quiet })).toThrow(/unsafe path/);
  });
  // ---- REVIEW B1 / H3 / F4 / F5 regressions ----
  const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
  /** Rewrite manifest.json (via mutate) and fix its checksum line + drop manifest.files entry for it. */
  function patchManifest(src: string, mutate: (m: Record<string, unknown>) => void) {
    const mp = path.join(src, 'manifest.json');
    const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
    mutate(m);
    const txt = JSON.stringify(m);
    fs.writeFileSync(mp, txt);
    const cp = path.join(src, 'checksums.sha256');
    fs.writeFileSync(cp, fs.readFileSync(cp, 'utf8').split('\n').map((l) => (/\s\*?manifest\.json$/.test(l) ? `${sha(txt)}  manifest.json` : l)).join('\n'));
  }
  const leftovers = () => fs.readdirSync(os.tmpdir()).filter((n) => /^lumos-(import|stage)-/.test(n)).sort();

  for (const bad of ['.', '..', '../x', 'a/b', '.hidden', 'a..b', '']) {
    it(`refuses snapshot_id ${JSON.stringify(bad)} and never touches --out`, () => {
      const src = copyBundle();
      patchManifest(src, (m) => { m.snapshot_id = bad; });
      const out = tmp('out');
      fs.mkdirSync(path.join(out, 'other'));
      fs.writeFileSync(path.join(out, 'index.json'), '{"snapshots":[],"default":"other"}');
      expect(() => importBundle(src, { out, log: quiet })).toThrow(/invalid snapshot_id/);
      expect(fs.readdirSync(out).sort()).toEqual(['index.json', 'other']);
    });
  }
  it('refuses files not listed in checksums.sha256', () => {
    const src = copyBundle();
    fs.writeFileSync(path.join(src, 'unlisted_extra.js'), 'alert(1)');
    expect(() => importBundle(src, { out: tmp('out'), log: quiet })).toThrow(/not listed in checksums.sha256: unlisted_extra.js/);
  });
  it('refuses a manifest that fails the schema (no release_stage/aois/years)', () => {
    const src = copyBundle();
    patchManifest(src, (m) => { delete m.release_stage; delete m.aois; delete m.years; delete m.files; });
    const out = tmp('out');
    expect(() => importBundle(src, { out, log: quiet })).toThrow(/manifest.json schema/);
    expect(fs.existsSync(path.join(out, 'index.json'))).toBe(false);
  });
  it('refuses an invalid (but checksummed) activity file', () => {
    const src = copyBundle();
    const rel = 'activity/BGD/2016.json';
    const bogus = '[{"schema_version":"1.0"}]';
    fs.writeFileSync(path.join(src, rel), bogus);
    const cp = path.join(src, 'checksums.sha256');
    fs.writeFileSync(cp, fs.readFileSync(cp, 'utf8').split('\n').map((l) => (l.endsWith(rel) ? `${sha(bogus)}  ${rel}` : l)).join('\n'));
    patchManifest(src, (m) => { delete m.files; });
    expect(() => importBundle(src, { out: tmp('out'), log: quiet })).toThrow(/activity\/BGD\/2016.json schema/);
  });
  it('enforces the zip size cap and cleans temp dirs on every failure path', () => {
    const before = leftovers();
    const src = copyBundle();
    const zip = new AdmZip();
    zip.addLocalFolder(src, 'lumos_app_bundle');
    const zp = path.join(tmp('zip'), 'b.zip');
    zip.writeZip(zp);
    expect(() => importBundle(zp, { out: tmp('out'), log: quiet, limits: { maxEntries: 20000, maxTotalBytes: 1000, maxZipBytes: 1e9, activitySample: 5 } })).toThrow(/expands to/);
    expect(() => importBundle(zp, { out: tmp('out'), log: quiet, limits: { maxEntries: 3, maxTotalBytes: 1e9, maxZipBytes: 1e9, activitySample: 5 } })).toThrow(/too many entries/);
    expect(() => importBundle(makeSlipZip(), { out: tmp('out'), log: quiet })).toThrow(/unsafe path/);
    const out = tmp('out');
    importBundle(zp, { out, log: quiet });
    expect(fs.readdirSync(out).filter((n) => n.startsWith('.'))).toEqual([]); // no staging left in --out
    expect(leftovers()).toEqual(before);
  });
  it('verifyBundle accepts the sample bundle', () => {
    expect(verifyBundle(SNAP_DIR).nFiles).toBeGreaterThan(100);
  });
});
