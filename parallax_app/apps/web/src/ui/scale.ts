// Sequential "burning activity" scale: amber → orange → red → deep red. Strong colours only.
const STOPS = ['#FDE047', '#FBBF24', '#F59E0B', '#F97316', '#EF4444', '#DC2626', '#B91C1C', '#7F1D1D'];
function hexToRgb(h: string) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const RGB = STOPS.map(hexToRgb);
export const ZERO_COLOR = '#4A3412'; // observed zero: dark amber-brown, distinct from "missing" hatch

export function rampColor(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (RGB.length - 1);
  const i = Math.min(RGB.length - 2, Math.floor(x)), f = x - i;
  const c = RGB[i].map((v, k) => Math.round(v + (RGB[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
/** log1p-normalised position of v within [0, max]. */
export function rampT(v: number, max: number): number {
  return max > 0 ? Math.log1p(Math.max(0, v)) / Math.log1p(max) : 0;
}
export function valueColor(v: number | null, max: number): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v <= 0) return ZERO_COLOR;
  return rampColor(0.04 + 0.96 * rampT(v, max));
}
/** dark text on light ramp cells, light text on dark ones */
export function textOn(v: number | null, max: number): string {
  if (v == null || v <= 0) return '#F3E8D2';
  return rampT(v, max) > 0.55 ? '#FFF7ED' : '#1C1305';
}
export const RAMP_CSS = `linear-gradient(90deg, ${STOPS.join(', ')})`;
