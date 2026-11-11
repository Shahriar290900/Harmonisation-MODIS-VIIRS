// Recompute manifest.files and checksums.sha256 for a snapshot whose files were edited after export
// (the lumos -> parallax rename rewrote ids inside every file; admin2/ was added later).
// Usage: node scripts/rehash_snapshot.mjs <snapshot dir> [...]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else if (e.name !== '.DS_Store') out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}
for (const root of process.argv.slice(2)) {
  const mp = path.join(root, 'manifest.json');
  const raw = fs.readFileSync(mp, 'utf8');
  const indent = (raw.match(/\n( +)"/) || [, ''])[1].length;
  const m = JSON.parse(raw);
  const files = walk(root).filter((f) => f !== 'manifest.json' && f !== 'checksums.sha256').sort();
  m.files = Object.fromEntries(files.map((f) => [f, sha(path.join(root, f))]));
  fs.writeFileSync(mp, JSON.stringify(m, null, indent || undefined) + (raw.endsWith('\n') ? '\n' : ''));
  const all = [...files, 'manifest.json'].sort();
  fs.writeFileSync(path.join(root, 'checksums.sha256'), all.map((f) => `${f === 'manifest.json' ? sha(mp) : m.files[f]}  ${f}`).join('\n') + '\n');
  console.log(path.basename(root), files.length, 'files rehashed');
}
