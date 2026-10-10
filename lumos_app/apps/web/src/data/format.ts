// Formatting helpers. All dates are UTC calendar months. null/undefined/NaN → '—' (never 0).
export const DASH = '—';
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 'Mar 2016' (or 'March 2016' with long=true). month is 1-12. */
export function monthLabel(year: number, month: number, long = false): string {
  const m = (long ? MONTHS_LONG : MONTHS_SHORT)[month - 1];
  return m ? `${m} ${year}` : DASH;
}

/** Parse 'YYYY-MM-01T00:00:00Z' → {year, month} using UTC (no local-timezone shifts). */
export function parseUtcMonth(iso: string | null | undefined): { year: number; month: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

export function monthLabelFromIso(iso: string | null | undefined, long = false): string {
  const p = parseUtcMonth(iso);
  return p ? monthLabel(p.year, p.month, long) : DASH;
}

/** 'Mar 2016 (2016-03-01 to 2016-04-01 UTC, end exclusive)' */
export function utcRangeLabel(startIso: string, endExclusiveIso: string): string {
  return `${startIso.slice(0, 10)} to ${endExclusiveIso.slice(0, 10)} UTC (end exclusive)`;
}

/** Counts: integer with thousands separators. Non-integers keep `digits` decimals when < 100, else 0. */
export function fmtNum(v: number | null | undefined, digits?: number): string {
  if (!isNum(v)) return DASH;
  const d = digits ?? (Number.isInteger(v) ? 0 : Math.abs(v) < 10 ? 1 : 0);
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtCount(v: number | null | undefined): string {
  return isNum(v) ? Math.round(v).toLocaleString('en-US') : DASH;
}

/** Compact: 1.2k, 3.4M (calendar cells). */
export function fmtCompact(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  const a = Math.abs(v);
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e4) return `${Math.round(v / 1e3)}k`;
  if (a >= 1e3) return `${trim(v / 1e3)}k`;
  return a < 10 && !Number.isInteger(v) ? v.toFixed(1) : String(Math.round(v));
}
function trim(x: number): string {
  return x.toFixed(1).replace(/\.0$/, '');
}

/** 0.8 → '80%' */
export function fmtPct(v: number | null | undefined, digits = 0): string {
  return isNum(v) ? `${(v * 100).toFixed(digits)}%` : DASH;
}

/** 3.07 → '3.1×' */
export function fmtRatio(v: number | null | undefined, digits = 1): string {
  return isNum(v) ? `${v.toFixed(digits)}×` : DASH;
}

export function fmtSigned(v: number | null | undefined, digits = 2): string {
  if (!isNum(v)) return DASH;
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`;
}

/** 1 → '1st', 2 → '2nd', 13 → '13th' */
export function ordinal(n: number | null | undefined): string {
  if (!isNum(n)) return DASH;
  const k = Math.round(n), t = k % 100;
  const s = t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[k % 10] ?? 'th';
  return `${k}${s}`;
}

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). First non-comment row is the header. */
export function parseCsv(input: string): Record<string, string>[] {
  // Leading '#' comment lines (our export's provenance header) are skipped.
  const text = input.replace(/^\uFEFF/, '').replace(/^(#[^\n]*(\r?\n|$))+/, '');
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const lines = rows;
  if (!lines.length) return [];
  const header = lines[0];
  return lines.slice(1).map((r) => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ''])));
}
