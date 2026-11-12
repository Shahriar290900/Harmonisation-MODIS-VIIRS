/** Year tick years that never collide: picks a step so ticks are >= minPx apart. */
export function yearTicks(y0: number, y1: number, pxPerYear: number, minPx = 48): number[] {
  const steps = [1, 2, 3, 5, 10, 20];
  const step = steps.find((s) => s * pxPerYear >= minPx) ?? 20;
  const out: number[] = [];
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) out.push(y);
  return out;
}
/** Log-ish ticks for a symlog axis: 0, 1, 3, 10, 30, ... */
export function symlogTicks(max: number): number[] {
  const t = [0];
  for (let p = 1; p <= max; p *= 10) { t.push(p); if (p * 3 <= max) t.push(p * 3); }
  return t;
}
