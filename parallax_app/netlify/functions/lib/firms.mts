// Pure helpers for the live FIRMS function: CSV parsing + region filtering. No I/O, unit-testable.

export type RegionId = 'BGD' | 'USA-CA' | 'AUS-NSW';
export type Bbox = [number, number, number, number]; // [west, south, east, north]

/** Bounding boxes from public/data/<snapshot>/regions.json (BGD, USA-CA, AUS-NSW). */
export const REGION_BBOXES: Record<RegionId, Bbox> = {
  BGD: [88.0844, 20.6709, 92.6727, 26.4465],
  'USA-CA': [-124.4092, 32.5317, -114.1191, 41.9995],
  'AUS-NSW': [141.0001, -37.5103, 159.1065, -28.1493]
};

/** [lon, lat, acq_date, acq_time, frp, confidence, daynight] */
export type LiveRow = [number, number, string, string, number | null, string | number | null, string];

export type RegionRows = Record<RegionId, LiveRow[]>;

export function emptyRegions(): RegionRows {
  return { BGD: [], 'USA-CA': [], 'AUS-NSW': [] };
}

/** Simple CSV line splitter (FIRMS CSVs contain no quoted commas, but quotes are handled anyway). */
export function splitCsvLine(line: string): string[] {
  if (line.indexOf('"') < 0) return line.split(',');
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const num = (s: string | undefined): number | null => {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Parse a FIRMS global CSV and keep only rows inside the region bounding boxes. Returns rows per region + total data rows seen. */
export function filterFirmsCsv(csv: string): { regions: RegionRows; totalRows: number } {
  const regions = emptyRegions();
  const lines = csv.split(/\r?\n/);
  if (lines.length < 2) return { regions, totalRows: 0 };
  const head = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const ix = (n: string) => head.indexOf(n);
  const iLat = ix('latitude'), iLon = ix('longitude'), iDate = ix('acq_date'), iTime = ix('acq_time');
  const iFrp = ix('frp'), iConf = ix('confidence'), iDn = ix('daynight');
  if (iLat < 0 || iLon < 0 || iDate < 0) return { regions, totalRows: 0 };
  const ids = Object.keys(REGION_BBOXES) as RegionId[];
  let total = 0;
  for (let k = 1; k < lines.length; k++) {
    const line = lines[k];
    if (!line) continue;
    total++;
    // Cheap pre-parse for speed: only fully split rows we need.
    const c = splitCsvLine(line);
    const lat = num(c[iLat]), lon = num(c[iLon]);
    if (lat == null || lon == null) continue;
    for (const id of ids) {
      const [w, s, e, n] = REGION_BBOXES[id];
      if (lon >= w && lon <= e && lat >= s && lat <= n) {
        const conf = c[iConf];
        const cn = num(conf);
        regions[id].push([
          Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4, c[iDate], (c[iTime] ?? '').padStart(4, '0'),
          iFrp >= 0 ? num(c[iFrp]) : null, cn != null ? cn : (conf ?? null), iDn >= 0 ? (c[iDn] ?? '') : ''
        ]);
        break;
      }
    }
  }
  return { regions, totalRows: total };
}
