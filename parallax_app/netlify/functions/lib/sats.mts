// Pure helpers for the satellite orbit-elements function. No I/O.
export const SATS = [
  { id: 25994, key: 'terra', name: 'Terra' },
  { id: 27424, key: 'aqua', name: 'Aqua' },
  { id: 37849, key: 'snpp', name: 'Suomi NPP' },
  { id: 43013, key: 'noaa20', name: 'NOAA-20' },
  { id: 54234, key: 'noaa21', name: 'NOAA-21' }
] as const;

export interface Tle { key: string; name: string; norad: number; line1: string; line2: string; epoch_utc: string | null }

/** Epoch of a TLE (line 1 columns 19-32: YYDDD.DDDDDDDD) as an ISO string, or null if unreadable. */
export function tleEpoch(line1: string): string | null {
  const yy = Number(line1.slice(18, 20)), day = Number(line1.slice(20, 32));
  if (!Number.isFinite(yy) || !Number.isFinite(day) || day < 1 || day > 367) return null;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return new Date(Date.UTC(year, 0, 1) + (day - 1) * 86_400_000).toISOString();
}

/** TLE checksum: sum of digits plus one per minus sign, modulo 10, compared with column 69. */
export function tleChecksumOk(line: string): boolean {
  if (line.length < 69) return false;
  let s = 0;
  for (let i = 0; i < 68; i++) { const c = line[i]; if (c >= '0' && c <= '9') s += +c; else if (c === '-') s += 1; }
  return s % 10 === Number(line[68]);
}

/** Parse a CelesTrak 3-line (or 2-line) TLE response for one satellite. Returns null when it does not look like a TLE of that catalogue number. */
export function parseTle(text: string, sat: { id: number; key: string; name: string }): Tle | null {
  const ls = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const i1 = ls.findIndex((l) => l.startsWith('1 ')), i2 = ls.findIndex((l) => l.startsWith('2 '));
  if (i1 < 0 || i2 !== i1 + 1) return null;
  const line1 = ls[i1], line2 = ls[i2];
  if (!tleChecksumOk(line1) || !tleChecksumOk(line2)) return null;
  if (Number(line1.slice(2, 7)) !== sat.id || Number(line2.slice(2, 7)) !== sat.id) return null;
  return { key: sat.key, name: sat.name, norad: sat.id, line1, line2, epoch_utc: tleEpoch(line1) };
}
