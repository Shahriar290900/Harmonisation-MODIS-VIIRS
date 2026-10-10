import { SERIES_COLORS as C } from '../types';

// Fixed "scene" of fires: [x, y, size] in a 160×120 field. Big fires (size ≥ 3) are visible to both cameras.
const FIRES: [number, number, number][] = [
  [22, 28, 4], [30, 34, 2], [70, 22, 1.5], [92, 58, 4.5], [100, 64, 2], [128, 30, 1.5], [44, 86, 1.5], [60, 92, 3.2], [138, 96, 1.5], [116, 84, 2], [14, 104, 1.2]
];

function Field({ cell, detects, color, label, sub }: { cell: number; detects: (s: number) => boolean; color: string; label: string; sub: string }) {
  const cols = Math.ceil(160 / cell), rows = Math.ceil(120 / cell);
  const hot = new Set<string>();
  for (const [x, y, s] of FIRES) if (detects(s)) hot.add(`${Math.floor(x / cell)}_${Math.floor(y / cell)}`);
  return (
    <g>
      <rect width="160" height="120" rx="6" fill="#132037" />
      {[...hot].map((k) => { const [i, j] = k.split('_').map(Number); return <rect key={k} x={i * cell} y={j * cell} width={cell} height={cell} fill={color} opacity="0.55" />; })}
      {Array.from({ length: cols - 1 }, (_, i) => <line key={'v' + i} x1={(i + 1) * cell} x2={(i + 1) * cell} y1="0" y2="120" stroke="#2B3B5E" strokeWidth="0.7" />)}
      {Array.from({ length: rows - 1 }, (_, j) => <line key={'h' + j} y1={(j + 1) * cell} y2={(j + 1) * cell} x1="0" x2="160" stroke="#2B3B5E" strokeWidth="0.7" />)}
      {FIRES.map(([x, y, s], i) => <circle key={i} cx={x} cy={y} r={s} fill="#FBBF24" stroke="#EF4444" strokeWidth="0.8" />)}
      <rect width="160" height="120" rx="6" fill="none" stroke={color} strokeWidth="1.5" />
      <text x="0" y="138" fill="#E6EDF7" fontSize="11" fontWeight="600">{label}</text>
      <text x="0" y="152" fill="#93A4C3" fontSize="10">{sub} · <tspan fill={color} fontWeight="700">{hot.size} hot pixels</tspan></text>
    </g>
  );
}

function Camera({ color, x }: { color: string; x: number }) {
  return (
    <g transform={`translate(${x},0)`}>
      <rect x="-16" y="4" width="32" height="20" rx="4" fill="#1E2A44" stroke={color} strokeWidth="1.5" />
      <rect x="-6" y="0" width="12" height="6" rx="2" fill="#1E2A44" stroke={color} strokeWidth="1.2" />
      <circle cx="0" cy="14" r="6" fill="#0B1220" stroke={color} strokeWidth="1.5" />
      <circle cx="0" cy="14" r="2.2" fill={color} />
      <path d="M-4 26 L-22 44 M4 26 L22 44" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity="0.8" />
    </g>
  );
}

export function Explainer() {
  // tiny illustrative series (not data): steady burning, sensor switch in "2012"
  const yrs = Array.from({ length: 14 }, (_, i) => i);
  const truth = yrs.map((i) => 10 + 2 * Math.sin(i * 1.3));
  const xs = (i: number) => 8 + i * 17, ys = (v: number) => 74 - v * 1.6;
  const pathOf = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const naive = pathOf(yrs.map((i) => [xs(i), ys(i < 7 ? truth[i] : truth[i] * 3.2)]));
  const aquaPart = pathOf(yrs.slice(0, 7).map((i) => [xs(i), ys(truth[i])]));
  const viirsPart = pathOf(yrs.slice(7).map((i) => [xs(i), ys(truth[i] * 3.2)]));
  const harm = pathOf(yrs.slice(0, 8).map((i) => [xs(i), ys(truth[i] * 3.2 * (i < 7 ? 0.98 : 1))]));

  return (
    <div className="explainer">
      <svg viewBox="0 0 400 220" className="explainer__art" role="img" aria-label="Two cameras photograph the same field of fires. The coarse MODIS camera finds 3 hot pixels; the sharp VIIRS camera finds 10.">
        <g transform="translate(20,6)"><Camera color={C.aqua} x={80} /><Camera color={C.viirs} x={280} /></g>
        <g transform="translate(20,56)"><Field cell={40} detects={(s) => s >= 3} color={C.aqua} label="MODIS (2000–)" sub="~1 km pixels" /></g>
        <g transform="translate(220,56)"><Field cell={16} detects={() => true} color={C.viirs} label="VIIRS (2012–)" sub="375 m pixels" /></g>
      </svg>

      <ol className="explainer__steps">
        <li><b>Two cameras, one field.</b> MODIS is an older heat camera with big pixels — it sees the large fires. VIIRS is sharper and also catches the small ones, so for the same place it usually counts <b>several times more</b> hot pixels.</li>
        <li><b>Joining them naively fakes a jump.</b> Glue the MODIS years to the VIIRS years and the chart leaps upward in 2012 — even if burning never changed.
          <svg viewBox="0 0 250 84" className="explainer__mini" role="img" aria-label="Naive join jumps at 2012; harmonized line stays on one scale.">
            <line x1="127" x2="127" y1="4" y2="80" stroke="#93A4C3" strokeDasharray="2 3" />
            <text x="130" y="12" fill="#93A4C3" fontSize="9">2012</text>
            <path d={naive} fill="none" stroke="#EF4444" strokeWidth="1" opacity="0.35" />
            <path d={aquaPart} fill="none" stroke={C.aqua} strokeWidth="2" />
            <path d={viirsPart} fill="none" stroke={C.viirs} strokeWidth="2" />
            <path d={harm} fill="none" stroke={C.estimate} strokeWidth="2" strokeDasharray="5 3" />
            <text x="8" y="80" fill={C.aqua} fontSize="9">raw MODIS</text>
            <text x="8" y="14" fill={C.estimate} fontSize="9">harmonized (VIIRS scale)</text>
            <text x="180" y="80" fill={C.viirs} fontSize="9">raw VIIRS</text>
          </svg>
        </li>
        <li><b>Learn the translation.</b> Both cameras flew together from 2012 to 2024. In every 5 km square and month we learn “when Aqua-MODIS saw <i>X</i>, VIIRS saw <i>Y</i>” — then test it on years and places it never saw.</li>
        <li><b>Back-translate the past.</b> We turn 2003–2011 MODIS counts into <b>VIIRS-scale estimates</b>, each with an 80% error band, so 20+ years sit on one fair scale.</li>
      </ol>
      <p className="explainer__cant"><b>What it can’t do:</b> recover individual small fires MODIS missed, see through clouds, or count wildfires. A hotspot is a hot pixel, not a fire incident.</p>
    </div>
  );
}
