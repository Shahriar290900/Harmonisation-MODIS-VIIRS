import * as THREE from 'three';
import { gsap } from 'gsap';
import type { GlobeHandle, GlobeHome, HotPoint } from '../contract';
import { srgb, clampDpr, createLoop, createRenderer, damp, disposeRenderer, disposeTree, hostSize, seeded, smooth, SERIES_COLORS } from './util';
import { defaultBasemapUrl, loadCountries } from './data';

const DEG = Math.PI / 180;
/** Default focus/highlight (Bangladesh-first story); overridden per mount by `opts.home` (from regions.json). */
const DEFAULT_HOME = { iso3: 'BGD', lon: 90.35, lat: 23.7 };

/** lon/lat (deg) → unit-sphere xyz. lon=0,lat=0 faces +Z; north = +Y. */
function ll(lon: number, lat: number, r: number, out: Float32Array | number[], o: number): void {
  const la = lat * DEG, lo = lon * DEG, c = Math.cos(la);
  out[o] = r * c * Math.sin(lo);
  out[o + 1] = r * Math.sin(la);
  out[o + 2] = r * c * Math.cos(lo);
}

// ───────────────────────── shaders ─────────────────────────
const earthVert = /* glsl */ `
varying vec3 vN; varying vec3 vW; varying vec3 vObj;
void main(){
  vObj = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const earthFrag = /* glsl */ `
uniform vec3 uSun; uniform vec3 uDay; uniform vec3 uNight; uniform vec3 uRim; uniform vec3 uRim2; uniform float uRimK;
varying vec3 vN; varying vec3 vW; varying vec3 vObj;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float l = dot(N, uSun);
  float day = smoothstep(-0.3, 0.7, l);
  vec3 col = mix(uNight, uDay, day);
  // graticule every 15°
  vec3 p = normalize(vObj);
  vec2 g = vec2(atan(p.x, p.z), asin(clamp(p.y, -1.0, 1.0))) / radians(15.0);
  vec2 fw = max(fwidth(g), vec2(1e-4));
  vec2 gg = abs(fract(g + 0.5) - 0.5) / fw;
  float line = (1.0 - min(min(gg.x, gg.y), 1.0)) * (1.0 - smoothstep(0.02, 0.12, max(fw.x, fw.y)));
  col += uRim * line * 0.07;
  float ndv = max(dot(N, V), 0.0);
  float fres = pow(1.0 - ndv, 3.2);
  col += mix(uRim2, uRim, day) * fres * (0.3 + 0.6 * day) * uRimK;
  vec3 H = normalize(uSun + V);
  col += vec3(0.18, 0.42, 0.62) * pow(max(dot(N, H), 0.0), 48.0) * 0.28 * day;
  gl_FragColor = vec4(col, 1.0);
}`;

const atmoVert = /* glsl */ `
varying vec3 vN; varying vec3 vW;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const atmoFrag = /* glsl */ `
uniform vec3 uColor; uniform vec3 uSun; uniform float uStrength;
varying vec3 vN; varying vec3 vW;
void main(){
  vec3 V = normalize(cameraPosition - vW);
  float d = clamp(-dot(normalize(vN), V), 0.0, 1.0);
  float i = pow(d, 2.2) * uStrength;
  float sunSide = 0.55 + 0.45 * smoothstep(-0.6, 0.8, dot(normalize(vW), uSun));
  gl_FragColor = vec4(uColor * i * sunSide, i * sunSide);
}`;

/** lines + dots drawn on the surface; fade toward the limb */
const surfVert = /* glsl */ `
uniform float uPx; uniform float uSize;
varying float vFace; varying float vDay;
uniform vec3 uSun;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(wp.xyz);
  vFace = dot(n, normalize(cameraPosition - wp.xyz));
  vDay = smoothstep(-0.5, 0.6, dot(n, uSun));
  vec4 mv = viewMatrix * wp;
  gl_PointSize = clamp(uSize * uPx / -mv.z, 1.0, 3.0 * uPx / 900.0 + 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const lineFrag = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity;
varying float vFace; varying float vDay;
void main(){
  float a = smoothstep(0.0, 0.35, vFace) * uOpacity * (0.45 + 0.55 * vDay);
  gl_FragColor = vec4(uColor, a);
}`;
const dotFrag = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity;
varying float vFace; varying float vDay;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float m = smoothstep(0.5, 0.2, d);
  float a = m * smoothstep(0.0, 0.3, vFace) * uOpacity * (0.35 + 0.65 * vDay);
  gl_FragColor = vec4(uColor, a);
}`;

const hotVert = /* glsl */ `
attribute float aValue; attribute float aSeries; attribute float aSeed;
uniform float uTime; uniform float uPx; uniform float uSize; uniform float uFlicker; uniform float uMaxV; uniform float uHeat; uniform float uMinPx; uniform float uGain;
uniform vec3 uMask; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(wp.xyz);
  float facing = dot(n, normalize(cameraPosition - wp.xyz));
  float m = aSeries < 0.5 ? uMask.x : (aSeries < 1.5 ? uMask.y : uMask.z);
  float v = clamp(log(1.0 + aValue) / log(1.0 + uMaxV), 0.0, 1.0);
  float fl = 1.0 + uFlicker * (0.22 * sin(uTime * (2.1 + aSeed * 3.7) + aSeed * 40.0) * (0.6 + 0.4 * sin(uTime * 1.3 + aSeed * 13.0)));
  vec4 mv = viewMatrix * wp;
  float px = uSize * (0.55 + 1.6 * v) * uPx / -mv.z;
  gl_PointSize = clamp(px, uMinPx * (0.7 + 0.6 * v), 64.0) * fl * (0.6 + 0.4 * m);
  vec3 base = aSeries < 0.5 ? uC0 : (aSeries < 1.5 ? uC1 : uC2);
  vec3 heat = mix(vec3(1.0, 0.72, 0.18), vec3(1.0, 0.16, 0.08), v);
  vColor = mix(base, heat, uHeat);
  vAlpha = (0.22 + 0.62 * v) * m * smoothstep(-0.02, 0.22, facing) * fl * uGain;
  gl_Position = projectionMatrix * mv;
}`;
const hotFrag = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float glow = exp(-d * d * 4.5);
  float core = smoothstep(0.32, 0.0, d);
  vec3 col = vColor * (0.5 + 0.5 * glow) + mix(vColor, vec3(1.0), 0.45) * core * 0.3;
  gl_FragColor = vec4(col, vAlpha * glow);
}`;

const spikeVert = /* glsl */ `
attribute float aT; attribute float aValue; attribute float aSeries;
uniform float uGrow; uniform float uMaxV; uniform float uHeat;
uniform vec3 uMask; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2;
varying vec3 vColor; varying float vAlpha;
void main(){
  float v = clamp(log(1.0 + aValue) / log(1.0 + uMaxV), 0.0, 1.0);
  float m = aSeries < 0.5 ? uMask.x : (aSeries < 1.5 ? uMask.y : uMask.z);
  vec3 n = normalize(position);
  vec3 p = n * (1.003 + aT * uGrow * (0.004 + 0.05 * v) * m);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  float facing = dot(normalize(wp.xyz), normalize(cameraPosition - wp.xyz));
  vec3 base = aSeries < 0.5 ? uC0 : (aSeries < 1.5 ? uC1 : uC2);
  vColor = mix(base, mix(vec3(1.0, 0.72, 0.18), vec3(1.0, 0.16, 0.08), v), uHeat);
  vAlpha = (1.0 - aT) * (0.25 + 0.75 * v) * m * uGrow * smoothstep(0.0, 0.2, facing);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const spikeFrag = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main(){ gl_FragColor = vec4(vColor, vAlpha); }`;

const starVert = /* glsl */ `
attribute float aSize; attribute float aSeed;
uniform float uTime; uniform float uPx; uniform float uTwinkle;
varying float vA; varying float vTint;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 1.0 - uTwinkle * 0.45 * (0.5 + 0.5 * sin(uTime * (0.6 + aSeed * 1.7) + aSeed * 60.0));
  vA = tw * (0.35 + 0.65 * aSize);
  vTint = aSeed;
  gl_PointSize = (0.9 + aSize * 2.2) * uPx;
  gl_Position = projectionMatrix * mv;
}`;
const starFrag = /* glsl */ `
varying float vA; varying float vTint;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  vec3 c = mix(vec3(0.70, 0.82, 1.0), vec3(1.0, 0.88, 0.75), step(0.82, vTint));
  gl_FragColor = vec4(c, a * a * vA);
}`;

const ringVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ringFrag = /* glsl */ `
uniform float uTime; uniform vec3 uColor; uniform float uOpacity; uniform float uAnim;
varying vec2 vUv;
void main(){
  float d = length(vUv - 0.5) * 2.0;
  float a = 0.0;
  for (int i = 0; i < 2; i++) {
    float ph = fract(uTime * 0.35 * uAnim + float(i) * 0.5);
    float r = mix(0.12, 1.0, ph);
    a += smoothstep(0.06, 0.0, abs(d - r)) * (1.0 - ph) * (uAnim > 0.5 ? 1.0 : 0.0);
  }
  a += smoothstep(0.14, 0.0, abs(d - 0.38)) * (1.0 - uAnim) * 0.7;
  a += smoothstep(0.1, 0.0, d) * 0.9;
  gl_FragColor = vec4(uColor, a * uOpacity);
}`;

// ───────────────────────── geometry builders ─────────────────────────
function ringsOf(geom: GeoJSON.Geometry | null): number[][][] {
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates as number[][][];
  if (geom.type === 'MultiPolygon') return (geom.coordinates as number[][][][]).flat();
  return [];
}

function buildOutlines(fc: GeoJSON.FeatureCollection, iso: string): { all: Float32Array; hi: Float32Array } {
  const all: number[] = [];
  const hi: number[] = [];
  const tmp = [0, 0, 0];
  for (const f of fc.features) {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const isHi = props.ISO_A3 === iso || props.ADM0_A3 === iso;
    const target = isHi ? hi : all;
    const r = isHi ? 1.0025 : 1.0015;
    for (const ring of ringsOf(f.geometry)) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
        if (Math.abs(x1 - x0) > 180) continue; // antimeridian
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
        for (let s = 0; s < steps; s++) {
          const a = s / steps, b = (s + 1) / steps;
          ll(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, r, tmp, 0); target.push(tmp[0], tmp[1], tmp[2]);
          ll(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b, r, tmp, 0); target.push(tmp[0], tmp[1], tmp[2]);
        }
      }
    }
  }
  return { all: new Float32Array(all), hi: new Float32Array(hi) };
}

function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Fibonacci-sphere dot matrix of land, via point-in-polygon on Natural Earth.
 * REVIEW L2: time-sliced (≤ ~10 ms per slice, idle callback when available) so a 42k-sample build never blocks the
 * main thread for > 50 ms. Resolves null if aborted.
 */
async function buildLandDots(fc: GeoJSON.FeatureCollection, samples: number, signal?: AbortSignal): Promise<Float32Array | null> {
  type Poly = { bbox: [number, number, number, number]; rings: number[][][] };
  const polys: Poly[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const list = g.type === 'Polygon' ? [g.coordinates as number[][][]] : g.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : [];
    for (const rings of list) {
      let a = 180, b = 90, c = -180, d = -90;
      for (const p of rings[0]) { if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0]; if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1]; }
      polys.push({ bbox: [a, b, c, d], rings });
    }
  }
  const out: number[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const tmp = [0, 0, 0];
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  const yieldSlice = () => new Promise<void>((r) => (w.requestIdleCallback ? w.requestIdleCallback(() => r(), { timeout: 60 }) : setTimeout(r, 0)));
  let sliceStart = performance.now();
  for (let i = 0; i < samples; i++) {
    if ((i & 255) === 0 && performance.now() - sliceStart > 10) {
      await yieldSlice();
      if (signal?.aborted) return null;
      sliceStart = performance.now();
    }
    const y = 1 - (i / (samples - 1)) * 2;
    const th = golden * i;
    const lat = Math.asin(y) / DEG;
    let lon = ((th / DEG) % 360);
    if (lon > 180) lon -= 360;
    let land = false;
    for (const p of polys) {
      if (lon < p.bbox[0] || lon > p.bbox[2] || lat < p.bbox[1] || lat > p.bbox[3]) continue;
      if (pointInRing(lon, lat, p.rings[0])) {
        let hole = false;
        for (let h = 1; h < p.rings.length; h++) if (pointInRing(lon, lat, p.rings[h])) { hole = true; break; }
        if (!hole) { land = true; break; }
      }
    }
    if (land) { ll(lon, lat, 1.001, tmp, 0); out.push(tmp[0], tmp[1], tmp[2]); }
  }
  return new Float32Array(out);
}

// ───────────────────────── mount ─────────────────────────
export interface GlobeOptions { reducedMotion: boolean; quality: 'high' | 'low'; basemapUrl?: string; heatRamp?: boolean; home?: GlobeHome }

export function mountGlobe(host: HTMLElement, opts: GlobeOptions): GlobeHandle | null {
  const renderer = createRenderer(host, opts.quality);
  if (!renderer) return null;
  const rm = opts.reducedMotion;
  const high = opts.quality === 'high';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.005, 300);
  const globe = new THREE.Group();
  globe.rotation.order = 'XYZ';
  scene.add(globe);

  const sun = new THREE.Vector3(-0.55, 0.42, 0.72).normalize();
  const col = (h: string) => srgb(h);
  const cAqua = col(SERIES_COLORS.aqua), cViirs = col(SERIES_COLORS.viirs), cEst = col(SERIES_COLORS.est);

  // earth
  const earthGeo = new THREE.SphereGeometry(1, high ? 128 : 64, high ? 96 : 48);
  const earthMat = new THREE.ShaderMaterial({
    vertexShader: earthVert, fragmentShader: earthFrag,
    uniforms: {
      uSun: { value: sun }, uDay: { value: col('#0C2244') }, uNight: { value: col('#030712') },
      uRim: { value: col('#22D3EE') }, uRim2: { value: col('#2563EB') }, uRimK: { value: 1 }
    }
  });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  globe.add(earth);

  // atmosphere halo (back faces of a slightly larger shell)
  const atmoMat = new THREE.ShaderMaterial({
    vertexShader: atmoVert, fragmentShader: atmoFrag, side: THREE.BackSide, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uColor: { value: col('#2DD4BF') }, uSun: { value: sun }, uStrength: { value: 1.25 } }
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.16, 64, 48), atmoMat);
  scene.add(atmo);

  // starfield
  const starCount = high ? 3200 : 1100;
  const rnd = seeded(1337);
  const sPos = new Float32Array(starCount * 3), sSize = new Float32Array(starCount), sSeed = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = 60 + rnd() * 60, s = Math.sqrt(1 - u * u);
    sPos[i * 3] = r * s * Math.cos(th); sPos[i * 3 + 1] = r * u; sPos[i * 3 + 2] = r * s * Math.sin(th);
    sSize[i] = Math.pow(rnd(), 3); sSeed[i] = rnd();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
  starGeo.setAttribute('aSeed', new THREE.BufferAttribute(sSeed, 1));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: starVert, fragmentShader: starFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uTwinkle: { value: rm ? 0 : 1 } }
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // surface layers (filled when geojson arrives)
  const lineMat = new THREE.ShaderMaterial({
    vertexShader: surfVert, fragmentShader: lineFrag, transparent: true, depthWrite: false,
    uniforms: { uColor: { value: col('#5EEAD4') }, uOpacity: { value: 0.42 }, uSun: { value: sun }, uPx: { value: 1 }, uSize: { value: 1 } }
  });
  const hiMat = new THREE.ShaderMaterial({
    vertexShader: surfVert, fragmentShader: lineFrag, transparent: true, depthWrite: false,
    uniforms: { uColor: { value: col('#FBBF24') }, uOpacity: { value: 0.95 }, uSun: { value: sun }, uPx: { value: 1 }, uSize: { value: 1 } }
  });
  const dotMat = new THREE.ShaderMaterial({
    vertexShader: surfVert, fragmentShader: dotFrag, transparent: true, depthWrite: false,
    uniforms: { uColor: { value: col('#38BDF8') }, uOpacity: { value: 0.42 }, uSun: { value: sun }, uPx: { value: 1 }, uSize: { value: 0.011 } }
  });
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat);
  const hiLines = new THREE.LineSegments(new THREE.BufferGeometry(), hiMat);
  const dots = new THREE.Points(new THREE.BufferGeometry(), dotMat);
  lines.renderOrder = 1; hiLines.renderOrder = 3; dots.renderOrder = 1;
  lines.frustumCulled = false; hiLines.frustumCulled = false; dots.frustumCulled = false;
  globe.add(dots, lines, hiLines);

  // hotspot layers
  const hotUniforms = {
    uTime: { value: 0 }, uPx: { value: 1 }, uSize: { value: 0.0065 }, uFlicker: { value: rm ? 0 : 1 }, uMaxV: { value: 10 },
    uHeat: { value: opts.heatRamp ? 1 : 0 }, uMinPx: { value: 3 }, uGain: { value: 1 },
    uMask: { value: new THREE.Vector3(1, 1, 1) }, uC0: { value: cAqua }, uC1: { value: cViirs }, uC2: { value: cEst }
  };
  const hotMat = new THREE.ShaderMaterial({
    vertexShader: hotVert, fragmentShader: hotFrag, uniforms: hotUniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const hot = new THREE.Points(new THREE.BufferGeometry(), hotMat);
  hot.renderOrder = 5; hot.frustumCulled = false;
  globe.add(hot);
  const spikeMat = new THREE.ShaderMaterial({
    vertexShader: spikeVert, fragmentShader: spikeFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uGrow: { value: 0 }, uMaxV: hotUniforms.uMaxV, uHeat: hotUniforms.uHeat, uMask: hotUniforms.uMask, uC0: hotUniforms.uC0, uC1: hotUniforms.uC1, uC2: hotUniforms.uC2 }
  });
  const spikes = new THREE.LineSegments(new THREE.BufferGeometry(), spikeMat);
  spikes.renderOrder = 4; spikes.frustumCulled = false;
  if (high) globe.add(spikes);

  // focus beacon
  const ringMat = new THREE.ShaderMaterial({
    vertexShader: ringVert, fragmentShader: ringFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: col('#FBBF24') }, uOpacity: { value: 1 }, uAnim: { value: rm ? 0 : 1 } }
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), ringMat);
  ring.renderOrder = 6;
  globe.add(ring);
  const placeRing = (lon: number, lat: number) => {
    const p = [0, 0, 0];
    ll(lon, lat, 1.004, p, 0);
    ring.position.set(p[0], p[1], p[2]);
    ring.lookAt(p[0] * 2, p[1] * 2, p[2] * 2);
  };
  const HOME = { ...DEFAULT_HOME, ...(opts.home ?? {}) };
  placeRing(HOME.lon, HOME.lat);

  // ───── state ─────
  const st = {
    pTarget: 0, p: 0,
    autoLon: HOME.lon - 38, // start with the home region (Bangladesh by default) coming round from the east
    dLon: 0, dLat: 0, vLon: 0, vLat: 0,
    pin: 0, fLon: HOME.lon, fLat: HOME.lat,
    viewLon: 0, viewLat: 0,
    mask: new THREE.Vector3(1, 1, 1), maskTarget: new THREE.Vector3(1, 1, 1),
    dragging: false, lastX: 0, lastY: 0, w: 1, h: 1, baseDist: 3.4
  };
  const target = new THREE.Vector3();
  let disposed = false;
  // REVIEW L8: a focus() tween killed by dispose (or a newer focus) still resolves its promise.
  let focusResolve: (() => void) | null = null;
  const settleFocus = () => { const r = focusResolve; focusResolve = null; r?.(); };

  const geoAbort = new AbortController();
  loadCountries(opts.basemapUrl ?? defaultBasemapUrl(), geoAbort.signal).then((fc) => {
    if (!fc || disposed) return;
    const { all, hi } = buildOutlines(fc, HOME.iso3);
    lines.geometry.setAttribute('position', new THREE.BufferAttribute(all, 3));
    hiLines.geometry.setAttribute('position', new THREE.BufferAttribute(hi, 3));
    for (const o of [lines, hiLines]) o.geometry.computeBoundingSphere();
    loop.wake();
    return buildLandDots(fc, high ? 42000 : 16000, geoAbort.signal);
  }).then((land) => {
    if (!land || disposed) return;
    dots.geometry.setAttribute('position', new THREE.BufferAttribute(land, 3));
    dots.geometry.computeBoundingSphere();
    loop.wake();
  }).catch(() => undefined);

  const resize = () => {
    const { w, h } = hostSize(host);
    st.w = w; st.h = h;
    renderer.setPixelRatio(clampDpr(opts.quality));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dpr = renderer.getPixelRatio();
    const proj = (h * dpr) / (2 * Math.tan((camera.fov * DEG) / 2));
    hotUniforms.uPx.value = proj;
    hotUniforms.uMinPx.value = 2.6 * dpr;
    dotMat.uniforms.uPx.value = proj;
    starMat.uniforms.uPx.value = dpr;
    // fit whole earth (radius ~1.2 incl. halo) in the narrower dimension
    const tanH = Math.tan((camera.fov * DEG) / 2);
    st.baseDist = Math.max(3.3, 1.28 / (tanH * Math.min(1, camera.aspect)));
    loop.wake();
  };

  // ───── interaction ─────
  const cv = renderer.domElement;
  const onDown = (e: PointerEvent) => {
    st.dragging = true; st.lastX = e.clientX; st.lastY = e.clientY; st.vLon = 0; st.vLat = 0;
    if (st.pin > 0) {
      gsap.killTweensOf(st, 'pin'); settleFocus();
      st.autoLon = st.viewLon; st.dLon = 0; st.dLat = st.viewLat - 18; st.pin = 0;
    }
    try { cv.setPointerCapture(e.pointerId); } catch { /* noop */ }
    loop.wake();
  };
  const onMove = (e: PointerEvent) => {
    if (!st.dragging) return;
    const k = 180 / Math.max(300, Math.min(st.w, st.h));
    const dx = (e.clientX - st.lastX) * k, dy = (e.clientY - st.lastY) * k;
    st.lastX = e.clientX; st.lastY = e.clientY;
    st.dLon -= dx; st.dLat = Math.max(-60, Math.min(60, st.dLat + dy));
    st.vLon = -dx * 60; st.vLat = dy * 60;
    loop.wake();
  };
  const onUp = (e: PointerEvent) => {
    st.dragging = false;
    try { cv.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (rm) { st.vLon = 0; st.vLat = 0; }
    loop.wake();
  };
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.style.cursor = 'grab';

  // ───── frame ─────
  const lerpAngle = (a: number, b: number, t: number) => { let d = ((b - a + 540) % 360) - 180; return a + d * t; };

  const frame = (dt: number, t: number): boolean => {
    let active = false;
    // progress damping
    const kp = rm ? 1 : damp(5, dt);
    st.p += (st.pTarget - st.p) * kp;
    if (Math.abs(st.pTarget - st.p) > 1e-4) active = true; else st.p = st.pTarget;
    // inertia
    if (!st.dragging && (Math.abs(st.vLon) > 0.01 || Math.abs(st.vLat) > 0.01)) {
      st.dLon += st.vLon * dt; st.dLat = Math.max(-60, Math.min(60, st.dLat + st.vLat * dt));
      const f = Math.exp(-3.2 * dt); st.vLon *= f; st.vLat *= f; active = true;
    }
    // auto rotate when unpinned and near the start of the story
    const w = Math.max(st.pin, smooth(0.04, 0.55, st.p));
    if (!rm && !st.dragging) st.autoLon += dt * 4.2 * (1 - w);
    st.viewLon = lerpAngle(st.autoLon + st.dLon, st.fLon, w);
    st.viewLat = (18 + st.dLat) + (st.fLat - (18 + st.dLat)) * w;
    globe.rotation.set(st.viewLat * DEG, -st.viewLon * DEG, 0);

    // camera choreography: whole earth → tilt → close-up
    const p = st.p;
    const k1 = smooth(0, 0.6, p), k2 = smooth(0.4, 1, p);
    const dist = Math.exp(Math.log(st.baseDist) * (1 - k2) + Math.log(0.27) * k2) * (1 - 0.32 * k1 * (1 - k2));
    const tilt = (k1 * 22 + k2 * 36) * DEG;
    const tz = 0.55 * k1 + 0.45 * k2;
    target.set(0, 0, tz);
    camera.position.set(0, -Math.sin(tilt) * dist, tz + Math.cos(tilt) * dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    // a gentle off-centre at the start so the globe breathes
    atmoMat.uniforms.uStrength.value = 1.0 - 0.45 * k2;
    earthMat.uniforms.uRimK.value = 1 - 0.6 * k2;
    hotUniforms.uGain.value = 1 - 0.35 * k2;

    // series mask
    st.mask.lerp(st.maskTarget, rm ? 1 : damp(6, dt));
    if (st.mask.distanceToSquared(st.maskTarget) > 1e-5) active = true;
    hotUniforms.uMask.value.copy(st.mask);

    spikeMat.uniforms.uGrow.value = smooth(0.35, 0.9, p);
    ringMat.uniforms.uOpacity.value = 1 - smooth(0.6, 0.95, p);
    hotUniforms.uTime.value = t;
    starMat.uniforms.uTime.value = t;
    ringMat.uniforms.uTime.value = t;

    renderer.render(scene, camera);
    return active || st.dragging;
  };
  const loop = createLoop(host, frame, !rm);

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(host);
  resize();

  // ───── handle ─────
  const handle: GlobeHandle = {
    setPoints(points: HotPoint[]) {
      const n = points.length;
      const pos = new Float32Array(n * 3), val = new Float32Array(n), ser = new Float32Array(n), seed = new Float32Array(n);
      const sp = new Float32Array(n * 6), sT = new Float32Array(n * 2), sV = new Float32Array(n * 2), sS = new Float32Array(n * 2);
      const r = seeded(7);
      let maxV = 1;
      for (let i = 0; i < n; i++) {
        const q = points[i];
        ll(q.lon, q.lat, 1.0035, pos, i * 3);
        val[i] = q.value; ser[i] = q.series === 'aqua' ? 0 : q.series === 'viirs' ? 1 : 2; seed[i] = r();
        if (q.value > maxV) maxV = q.value;
        sp[i * 6] = sp[i * 6 + 3] = pos[i * 3]; sp[i * 6 + 1] = sp[i * 6 + 4] = pos[i * 3 + 1]; sp[i * 6 + 2] = sp[i * 6 + 5] = pos[i * 3 + 2];
        sT[i * 2] = 0; sT[i * 2 + 1] = 1; sV[i * 2] = sV[i * 2 + 1] = q.value; sS[i * 2] = sS[i * 2 + 1] = ser[i];
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aValue', new THREE.BufferAttribute(val, 1));
      g.setAttribute('aSeries', new THREE.BufferAttribute(ser, 1));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      hot.geometry.dispose(); hot.geometry = g;
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      sg.setAttribute('aT', new THREE.BufferAttribute(sT, 1));
      sg.setAttribute('aValue', new THREE.BufferAttribute(sV, 1));
      sg.setAttribute('aSeries', new THREE.BufferAttribute(sS, 1));
      spikes.geometry.dispose(); spikes.geometry = sg;
      hotUniforms.uMaxV.value = maxV;
      loop.wake();
    },
    setProgress(p: number) {
      st.pTarget = Math.max(0, Math.min(1, p));
      loop.wake();
    },
    focus(lon: number, lat: number, durationMs = 1600) {
      placeRing(lon, lat);
      return new Promise<void>((resolve) => {
        gsap.killTweensOf(st, 'fLon,fLat,pin');
        settleFocus();
        if (disposed) { resolve(); return; }
        // shortest path on longitude
        const from = st.pin > 0.01 ? st.fLon : st.viewLon;
        const toLon = from + (((lon - from + 540) % 360) - 180);
        if (st.pin < 0.01) { st.fLon = st.viewLon; st.fLat = st.viewLat; }
        const d = rm ? 0 : durationMs / 1000;
        if (d === 0) { st.fLon = toLon; st.fLat = lat; st.pin = 1; loop.wake(); resolve(); return; }
        focusResolve = resolve;
        gsap.to(st, { fLon: toLon, fLat: lat, pin: 1, duration: d, ease: 'power3.inOut', onUpdate: () => loop.wake(), onComplete: settleFocus });
        loop.wake();
      });
    },
    setSeries(s) {
      const lo = 0.12;
      st.maskTarget.set(s === 'all' || s === 'aqua' ? 1 : lo, s === 'all' || s === 'viirs' ? 1 : lo, s === 'all' || s === 'est' ? 1 : lo);
      loop.wake();
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      geoAbort.abort();
      gsap.killTweensOf(st);
      settleFocus();
      loop.dispose();
      ro?.disconnect();
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onUp);
      disposeTree(scene);
      disposeRenderer(renderer);
    }
  };
  return handle;
}
