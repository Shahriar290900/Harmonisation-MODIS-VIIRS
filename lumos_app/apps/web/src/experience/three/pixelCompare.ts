import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PixelCompareHandle } from '../contract';
import { srgb, clampDpr, createLoop, createRenderer, damp, disposeRenderer, disposeTree, hostSize, seeded, smooth, SERIES_COLORS } from './util';

/*
 * "Two cameras" explainer. 1 world unit = 1 km. A 6 × 6 km field holds ILLUSTRATIVE, deterministic
 * (seeded) fires — not data. MODIS sees it through 36 cells of 1 km; VIIRS through 256 cells of 375 m
 * (≈7.1× more cells per area). MODIS only flags cells whose fire heat is large; VIIRS flags small fires too.
 */
const FIELD = 6;
const MODIS_N = 6; // 6×6 cells of 1 km
const VIIRS_N = 16; // 16×16 cells of 0.375 km

interface Fire { x: number; z: number; heat: number; seed: number }

function makeFires(): Fire[] {
  const r = seeded(20260109);
  const fires: Fire[] = [];
  const clusters = [[-1.7, -1.2], [1.4, 1.6], [1.9, -1.9], [-1.3, 2.0]];
  for (const [cx, cz] of clusters) {
    const n = 5 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 0.9;
      fires.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, heat: 0.1 + Math.pow(r(), 2.2) * 0.9, seed: r() });
    }
  }
  for (let i = 0; i < 14; i++) fires.push({ x: (r() - 0.5) * FIELD * 0.92, z: (r() - 0.5) * FIELD * 0.92, heat: 0.08 + r() * 0.22, seed: r() });
  return fires;
}

interface GridData { n: number; size: number; lit: Float32Array; h: Float32Array; delay: Float32Array; litCount: number; total: number }

function rasterize(fires: Fire[], n: number, threshold: number, gain: number): GridData {
  const size = FIELD / n;
  const sum = new Float32Array(n * n);
  for (const f of fires) {
    const i = Math.min(n - 1, Math.max(0, Math.floor((f.x + FIELD / 2) / size)));
    const j = Math.min(n - 1, Math.max(0, Math.floor((f.z + FIELD / 2) / size)));
    sum[j * n + i] += f.heat;
  }
  const lit = new Float32Array(n * n), h = new Float32Array(n * n), delay = new Float32Array(n * n);
  const r = seeded(n * 31 + 7);
  let litCount = 0, total = 0;
  for (let k = 0; k < n * n; k++) {
    const s = sum[k];
    if (s >= threshold) { lit[k] = 1; h[k] = 0.18 + Math.sqrt(s) * gain; litCount++; total += h[k]; }
    const i = k % n, j = Math.floor(k / n);
    delay[k] = 0.65 * ((i + j) / (2 * n - 2)) + 0.35 * r();
  }
  return { n, size, lit, h, delay, litCount, total };
}

// ───────────────────────── shaders ─────────────────────────
const cellVert = /* glsl */ `
attribute float aLit; attribute float aH; attribute float aDelay;
uniform float uRise; uniform float uLight; uniform float uScale; uniform float uMorph; uniform float uGhost;
varying vec3 vN; varying vec2 vUv; varying float vY; varying float vLit; varying float vHgt;
void main(){
  float r = clamp((uRise * 1.6 - aDelay * 0.6), 0.0, 1.0);
  r = r * r * (3.0 - 2.0 * r);
  float l = clamp((uLight * 1.6 - aDelay * 0.6), 0.0, 1.0);
  l = 1.0 - pow(1.0 - l, 3.0);
  float base = 0.035 * r;
  float hgt = mix(base, aH * mix(1.0, uScale, uMorph), l * aLit);
  hgt *= mix(1.0, 0.0, uGhost * (1.0 - aLit * 0.0));
  hgt = max(hgt, 0.002 * r);
  vec3 p = position;
  p.y = (p.y + 0.5) * hgt;
  p.xz *= mix(0.15, 1.0, r);
  vLit = aLit * l; vY = p.y; vHgt = hgt;
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
}`;
const cellFrag = /* glsl */ `
uniform vec3 uBase; uniform vec3 uGlow; uniform vec3 uTeal; uniform float uMorph; uniform float uAlpha; uniform float uRise; uniform float uGhost;
varying vec3 vN; varying vec2 vUv; varying float vY; varying float vLit; varying float vHgt;
void main(){
  vec3 N = normalize(vN);
  vec3 L = normalize(vec3(0.5, 1.0, 0.25));
  float top = step(0.9, N.y);
  float diff = 0.45 + 0.55 * max(dot(N, L), 0.0);
  vec3 lit = mix(uGlow, uTeal, uMorph);
  // vertical gradient = fake contact AO on sides
  float ao = top > 0.5 ? 1.0 : mix(0.35, 1.0, clamp(vY / max(vHgt, 1e-3), 0.0, 1.0));
  vec3 col = mix(uBase * diff, lit * diff * 1.25, vLit) * ao;
  col += lit * top * vLit * 0.55;
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = 1.0 - smoothstep(0.0, 0.06, min(e.x, e.y));
  col += mix(uGlow, lit, vLit) * edge * (0.55 + 0.6 * vLit);
  float a = uAlpha * mix(0.55 + 0.45 * edge, 1.0, vLit) * (1.0 - uGhost * (1.0 - edge) * 0.9);
  gl_FragColor = vec4(col, a * step(0.001, uRise));
}`;

const shadowVert = /* glsl */ `
attribute float aLit; attribute float aH; attribute float aDelay;
uniform float uLight; uniform float uScale; uniform float uMorph; uniform float uGhost;
varying vec2 vUv; varying float vS;
void main(){
  float l = clamp((uLight * 1.6 - aDelay * 0.6), 0.0, 1.0);
  float hgt = aH * mix(1.0, uScale, uMorph) * l * aLit * (1.0 - uGhost);
  vec3 p = position; // plane in xz, [-0.5,0.5]
  float far = step(0.0, p.z);
  p.z = p.z * (1.0 + hgt * 0.9) + hgt * 0.45;
  p.x = p.x * 1.25 + far * hgt * 0.25;
  vUv = uv; vS = clamp(hgt * 1.2, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p.x, 0.003, p.z, 1.0);
}`;
const shadowFrag = /* glsl */ `
varying vec2 vUv; varying float vS;
void main(){
  vec2 c = abs(vUv - 0.5) * 2.0;
  float m = (1.0 - smoothstep(0.35, 1.0, c.x)) * (1.0 - smoothstep(0.2, 1.0, c.y));
  gl_FragColor = vec4(0.0, 0.0, 0.02, m * vS * 0.55);
}`;

const groundVert = /* glsl */ `
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const groundFrag = /* glsl */ `
uniform float uHalf; uniform float uFine; uniform float uCoarse;
varying vec2 vP;
float gridLine(vec2 p, float s){ vec2 g = abs(fract(p / s + 0.5) - 0.5) * s; vec2 fw = fwidth(p); vec2 a = smoothstep(fw * 1.2, vec2(0.0), g); return max(a.x, a.y); }
void main(){
  float d = max(abs(vP.x), abs(vP.y));
  float inField = 1.0 - smoothstep(uHalf - 0.02, uHalf + 0.02, d);
  float r = length(vP) / (uHalf * 1.9);
  vec3 col = mix(vec3(0.055, 0.10, 0.17), vec3(0.03, 0.05, 0.09), r);
  col += vec3(0.0, 0.7, 0.85) * gridLine(vP, 1.0) * 0.12 * uCoarse * inField;
  col += vec3(0.55, 0.36, 0.96) * gridLine(vP, 0.375) * 0.10 * uFine * inField;
  float frame = smoothstep(0.03, 0.0, abs(d - uHalf));
  col += vec3(0.37, 0.92, 0.83) * frame * 0.35;
  float a = (1.0 - smoothstep(0.6, 1.0, r)) * 0.96;
  gl_FragColor = vec4(col, a);
}`;

const fireVert = /* glsl */ `
attribute float aHeat; attribute float aSeed;
uniform float uTime; uniform float uPx; uniform float uFlicker;
varying float vHeat; varying float vF;
void main(){
  float f = 1.0 + uFlicker * 0.3 * sin(uTime * (5.0 + aSeed * 6.0) + aSeed * 30.0) * sin(uTime * 2.3 + aSeed * 11.0);
  vHeat = aHeat; vF = f;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = (6.0 + aHeat * 22.0) * uPx * f;
  gl_Position = projectionMatrix * mv;
}`;
const fireFrag = /* glsl */ `
varying float vHeat; varying float vF;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float g = exp(-d * d * 5.0);
  vec3 col = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.85, 0.4), smoothstep(0.4, 0.0, d));
  gl_FragColor = vec4(col * g * (0.7 + 0.5 * vHeat) * vF, g);
}`;

const beamVert = /* glsl */ `
attribute float aT;
uniform float uBob;
varying float vH; varying vec3 vW;
void main(){ vH = aT; vec3 p = position; p.y += aT * uBob; vW = (modelMatrix * vec4(p, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`;
const beamFrag = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
varying float vH; varying vec3 vW;
float gauss(float x){ return exp(-x * x); }
void main(){
  float ph = fract(uTime * 0.35);
  float scan = gauss((vH - (1.0 - ph)) / 0.025);
  float a = (0.05 + 0.16 * pow(vH, 2.0)) * uOpacity + scan * 0.22 * uOpacity;
  gl_FragColor = vec4(uColor, a);
}`;

const rigVert = /* glsl */ `
attribute vec3 color;
varying vec3 vN; varying vec3 vC;
void main(){ vN = normalize(mat3(modelMatrix) * normal); vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const rigFrag = /* glsl */ `
varying vec3 vN; varying vec3 vC;
void main(){
  vec3 L = normalize(vec3(0.4, 1.0, 0.3));
  float d = 0.4 + 0.6 * max(dot(normalize(vN), L), 0.0);
  gl_FragColor = vec4(vC * d, 1.0);
}`;

const barVert = /* glsl */ `
uniform float uH; varying vec3 vN; varying float vY; varying vec2 vUv;
void main(){ vec3 p = position; p.y = (p.y + 0.5) * uH; vY = p.y / max(uH, 1e-3); vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0); }`;
const barFrag = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha;
varying vec3 vN; varying float vY; varying vec2 vUv;
void main(){
  vec3 N = normalize(vN);
  float d = 0.5 + 0.5 * max(dot(N, normalize(vec3(0.5, 1.0, 0.25))), 0.0);
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = 1.0 - smoothstep(0.0, 0.08, min(e.x, e.y));
  vec3 col = uColor * d * mix(0.55, 1.15, vY) + uColor * edge * 0.6 + step(0.9, N.y) * uColor * 0.4;
  gl_FragColor = vec4(col, uAlpha);
}`;

// ───────────────────────── helpers ─────────────────────────
function makeLabel(text: string, sub: string, color: string, small = false): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d')!;
  g.font = '600 64px Inter, system-ui, -apple-system, Segoe UI, sans-serif';
  g.fillStyle = color;
  g.textBaseline = 'top';
  g.fillText(text, 8, 8);
  g.font = '500 44px Inter, system-ui, -apple-system, Segoe UI, sans-serif';
  g.fillStyle = 'rgba(226,232,240,0.85)';
  g.fillText(sub, 8, 88);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const s = new THREE.Sprite(m);
  s.center.set(0, 0.5);
  s.scale.set(small ? 1.5 : 2.0, small ? 0.47 : 0.625, 1);
  s.renderOrder = 20;
  return s;
}

function makeRig(accent: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, c: THREE.Color) => {
    const n = g.attributes.position.count; const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (g.index) { const ng = g.toNonIndexed(); g.dispose(); return ng; }
    return g;
  };
  const body = new THREE.BoxGeometry(0.62, 0.42, 0.42);
  parts.push(paint(body, srgb('#CBD5E1')));
  const gold = new THREE.BoxGeometry(0.64, 0.12, 0.44); gold.translate(0, -0.12, 0);
  parts.push(paint(gold, srgb('#D4A24C')));
  for (const s of [-1, 1]) {
    const panel = new THREE.BoxGeometry(1.15, 0.03, 0.46); panel.translate(s * 0.95, 0.04, 0);
    parts.push(paint(panel, srgb('#1E3A8A')));
    const arm = new THREE.BoxGeometry(0.2, 0.04, 0.05); arm.translate(s * 0.38, 0.04, 0);
    parts.push(paint(arm, srgb('#94A3B8')));
  }
  const lens = new THREE.CylinderGeometry(0.11, 0.15, 0.22, 20); lens.translate(0, -0.32, 0);
  parts.push(paint(lens, srgb('#0F172A')));
  const glow = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20); glow.translate(0, -0.44, 0);
  parts.push(paint(glow, accent));
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

// ───────────────────────── mount ─────────────────────────
export interface PixelCompareOptions { reducedMotion: boolean; quality: 'high' | 'low'; badge?: boolean }
export interface PixelCompareStats { modisCells: number; viirsCells: number; modisLit: number; viirsLit: number; harmonizedScale: number; illustrative: true }

export function mountPixelCompare(host: HTMLElement, opts: PixelCompareOptions): (PixelCompareHandle & { stats: PixelCompareStats }) | null {
  const renderer = createRenderer(host, opts.quality);
  if (!renderer) return null;
  const rm = opts.reducedMotion;
  const high = opts.quality === 'high';
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const camTarget = new THREE.Vector3(0.6, 2.2, -0.6);
  const cAqua = srgb(SERIES_COLORS.aqua), cViirs = srgb(SERIES_COLORS.viirs), cTeal = srgb(SERIES_COLORS.est);

  const fires = makeFires();
  const modis = rasterize(fires, MODIS_N, 0.75, 0.55);
  const viirs = rasterize(fires, VIIRS_N, 0.12, 0.55);
  // harmonized: scale MODIS columns so their total matches the VIIRS total (as the model would on aggregate)
  const scale = viirs.total / Math.max(1e-3, modis.total);
  const stats: PixelCompareStats = { modisCells: MODIS_N ** 2, viirsCells: VIIRS_N ** 2, modisLit: modis.litCount, viirsLit: viirs.litCount, harmonizedScale: scale, illustrative: true };

  const root = new THREE.Group();
  scene.add(root);

  // ground
  const groundMat = new THREE.ShaderMaterial({
    vertexShader: groundVert, fragmentShader: groundFrag, transparent: true, depthWrite: false,
    uniforms: { uHalf: { value: FIELD / 2 }, uFine: { value: 0 }, uCoarse: { value: 0 } }
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FIELD * 2.2, FIELD * 2.2), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.renderOrder = 0;
  root.add(ground);

  // grids
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
  const makeGrid = (d: GridData, base: THREE.Color, glow: THREE.Color, gap: number) => {
    const count = d.n * d.n;
    const uniforms = {
      uRise: { value: 0 }, uLight: { value: 0 }, uScale: { value: 1 }, uMorph: { value: 0 }, uGhost: { value: 0 }, uAlpha: { value: 1 },
      uBase: { value: base.clone().multiplyScalar(0.28) }, uGlow: { value: glow }, uTeal: { value: cTeal }
    };
    const geo = boxGeo.clone();
    geo.setAttribute('aLit', new THREE.InstancedBufferAttribute(d.lit, 1));
    geo.setAttribute('aH', new THREE.InstancedBufferAttribute(d.h, 1));
    geo.setAttribute('aDelay', new THREE.InstancedBufferAttribute(d.delay, 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: cellVert, fragmentShader: cellFrag, uniforms, transparent: true });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const sGeo = shadowGeo.clone();
    sGeo.setAttribute('aLit', new THREE.InstancedBufferAttribute(d.lit, 1));
    sGeo.setAttribute('aH', new THREE.InstancedBufferAttribute(d.h, 1));
    sGeo.setAttribute('aDelay', new THREE.InstancedBufferAttribute(d.delay, 1));
    const sMat = new THREE.ShaderMaterial({ vertexShader: shadowVert, fragmentShader: shadowFrag, uniforms, transparent: true, depthWrite: false });
    const shadow = new THREE.InstancedMesh(sGeo, sMat, count);
    const m = new THREE.Matrix4();
    const s = d.size * (1 - gap);
    for (let k = 0; k < count; k++) {
      const i = k % d.n, j = Math.floor(k / d.n);
      m.makeScale(s, 1, s).setPosition(-FIELD / 2 + (i + 0.5) * d.size, 0, -FIELD / 2 + (j + 0.5) * d.size);
      mesh.setMatrixAt(k, m);
      shadow.setMatrixAt(k, m);
    }
    mesh.frustumCulled = false; shadow.frustumCulled = false;
    mesh.renderOrder = 3; shadow.renderOrder = 1;
    root.add(shadow, mesh);
    return { mesh, shadow, uniforms };
  };
  const gM = makeGrid(modis, cAqua, cAqua, 0.08);
  const gV = makeGrid(viirs, cViirs, cViirs, 0.14);
  gV.mesh.renderOrder = 4;

  // fires (illustrative)
  const fPos = new Float32Array(fires.length * 3), fHeat = new Float32Array(fires.length), fSeed = new Float32Array(fires.length);
  fires.forEach((f, i) => { fPos[i * 3] = f.x; fPos[i * 3 + 1] = 0.06; fPos[i * 3 + 2] = f.z; fHeat[i] = f.heat; fSeed[i] = f.seed; });
  const fireGeo = new THREE.BufferGeometry();
  fireGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  fireGeo.setAttribute('aHeat', new THREE.BufferAttribute(fHeat, 1));
  fireGeo.setAttribute('aSeed', new THREE.BufferAttribute(fSeed, 1));
  const fireMat = new THREE.ShaderMaterial({
    vertexShader: fireVert, fragmentShader: fireFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uFlicker: { value: rm ? 0 : 1 } }
  });
  const firePts = new THREE.Points(fireGeo, fireMat);
  firePts.renderOrder = 6;
  root.add(firePts);

  const spriteList: { s: THREE.Sprite; w: number; h: number }[] = [];
  const allSprites = () => spriteList;
  // satellites + beams (beam = 4 triangles from the lens to the field corners; apex bobs in the shader)
  const RIG_Y = 6.4;
  const mkRig = (x: number, z: number, accent: THREE.Color, label: string, sub: string, labelColor: string, labelSide: 1 | -1) => {
    const group = new THREE.Group();
    const geo = makeRig(accent);
    const mat = new THREE.ShaderMaterial({ vertexShader: rigVert, fragmentShader: rigFrag, uniforms: {} });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(0.85);
    mesh.rotation.y = Math.PI / 4;
    group.add(mesh);
    group.position.set(x, RIG_Y, z);
    const lab = makeLabel(label, sub, labelColor);
    spriteList.push({ s: lab, w: lab.scale.x, h: lab.scale.y });
    lab.center.set(labelSide > 0 ? 0 : 1, 0.5);
    lab.position.set(labelSide * 1.0, 0.75, -labelSide * 1.0);
    group.add(lab);
    root.add(group);
    const apexY = RIG_Y - 0.42;
    const h = FIELD / 2;
    const c = [[-h, -h], [h, -h], [h, h], [-h, h]];
    const pos: number[] = [], tt: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      pos.push(x, apexY, z, a[0], 0.01, a[1], b[0], 0.01, b[1]);
      tt.push(1, 0, 0);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    bg.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(tt), 1));
    const beamMat = new THREE.ShaderMaterial({
      vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: accent }, uOpacity: { value: 0 }, uTime: { value: 0 }, uBob: { value: 0 } }
    });
    const beam = new THREE.Mesh(bg, beamMat);
    beam.renderOrder = 8; beam.frustumCulled = false;
    root.add(beam);
    return { group, beamMat, label: lab };
  };
  // screen-left / screen-right for the 45° isometric camera
  const rigM = mkRig(-2.6, 6.4 * 0 + 2.6, cAqua, 'MODIS', '1 km pixels', SERIES_COLORS.aqua, -1);
  const rigV = mkRig(2.6, -2.6, cViirs, 'VIIRS', '375 m pixels', '#A78BFA', 1);
  const rigs = [rigM, rigV];

  // summary bars (screen-aligned row at the right): MODIS raw, VIIRS raw, harmonized
  const barGeo = new THREE.BoxGeometry(0.55, 1, 0.55);
  const barBase = new THREE.Vector3(FIELD / 2 + 1.5, 0, FIELD / 2 - 1.2);
  const barStep = new THREE.Vector3(0.62, 0, -0.62);
  const barLabels: THREE.Sprite[] = [];
  const bars = [cAqua, cViirs, cTeal].map((c, i) => {
    const mat = new THREE.ShaderMaterial({ vertexShader: barVert, fragmentShader: barFrag, transparent: true, uniforms: { uH: { value: 0.001 }, uColor: { value: c }, uAlpha: { value: 1 } } });
    const mesh = new THREE.Mesh(barGeo, mat);
    mesh.position.copy(barBase).addScaledVector(barStep, i);
    mesh.renderOrder = 5;
    mesh.frustumCulled = false;
    root.add(mesh);
    const lab = makeLabel(['MODIS', 'VIIRS', 'Harmonized'][i], ['raw', 'raw', 'MODIS → VIIRS scale'][i], ['#22D3EE', '#A78BFA', '#2DD4BF'][i], true);
    lab.position.copy(mesh.position).add(new THREE.Vector3(0.3, -0.35, 0.3));
    spriteList.push({ s: lab, w: lab.scale.x, h: lab.scale.y });
    lab.center.set(0, 1);
    lab.material.rotation = 0;
    root.add(lab);
    barLabels.push(lab);
    return mat;
  });
  const bandMat = new THREE.ShaderMaterial({ vertexShader: barVert, fragmentShader: barFrag, transparent: true, depthWrite: false, uniforms: { uH: { value: 0.001 }, uColor: { value: cTeal }, uAlpha: { value: 0 } } });
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.8), bandMat);
  band.position.copy(barBase).addScaledVector(barStep, 2);
  band.renderOrder = 7;
  root.add(band);
  const maxTotal = Math.max(modis.total * scale, viirs.total);
  // per-cell columns on the field are scaled more gently so they don't tower; the summary bar carries the true ratio
  const fieldScale = Math.min(scale, 1.7);
  const barH = (t: number) => (t / maxTotal) * 3.6;

  // badge: these fires are illustrative
  let badge: HTMLDivElement | null = null;
  if (opts.badge !== false) {
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    badge = document.createElement('div');
    badge.textContent = 'Illustrative fires · not real data';
    badge.setAttribute('role', 'note');
    Object.assign(badge.style, {
      position: 'absolute', left: '12px', bottom: '12px', padding: '4px 10px', borderRadius: '3px', font: '500 12px/1.4 Inter, system-ui, sans-serif',
      color: '#CBD5E1', background: 'rgba(11,18,32,0.72)', border: '1px solid rgba(148,163,184,0.25)', pointerEvents: 'none', letterSpacing: '0.01em'
    } as CSSStyleDeclaration);
    host.appendChild(badge);
  }

  // ───── state / frame ─────
  const st = { pTarget: 0, p: 0, w: 1, h: 1 };
  const resize = () => {
    const { w, h } = hostSize(host);
    st.w = w; st.h = h;
    renderer.setPixelRatio(clampDpr(opts.quality));
    renderer.setSize(w, h, false);
    const aspect = w / h;
    // fit: ≈ 18 world units wide on landscape; tighter crop on portrait (rig labels may clip a little)
    const halfH = aspect >= 1 ? Math.max(6.4, 9.0 / aspect) : Math.max(6.4, 6.6 / aspect);
    const portrait = aspect < 1;
    for (const sp of allSprites()) {
      const k = !portrait ? 1 : sp.s === rigM.label || sp.s === rigV.label ? 1.45 : 1.2;
      sp.s.scale.set(sp.w * k, sp.h * k, 1);
    }
    // rig labels: beside the satellites on wide screens, centred above them on portrait
    for (const [lab, side] of [[rigM.label, -1], [rigV.label, 1]] as const) {
      if (portrait) { lab.center.set(0.5, 0); lab.position.set(0, 0.55, 0); }
      else { lab.center.set(side > 0 ? 0 : 1, 0.5); lab.position.set(side * 1.0, 0.75, -side * 1.0); }
    }
    camera.left = -halfH * aspect; camera.right = halfH * aspect; camera.top = halfH; camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    fireMat.uniforms.uPx.value = renderer.getPixelRatio() * Math.min(1.4, h / (2 * halfH) / 40);
    loop.wake();
  };

  const az0 = Math.PI / 4;
  const frame = (dt: number, t: number): boolean => {
    const k = rm ? 1 : damp(6, dt);
    st.p += (st.pTarget - st.p) * k;
    const settling = Math.abs(st.pTarget - st.p) > 1e-4;
    if (!settling) st.p = st.pTarget;
    const p = st.p;

    // phase 1: MODIS
    const mRise = smooth(0.0, 0.14, p), mLight = smooth(0.08, 0.3, p);
    // phase 2: VIIRS
    const vRise = smooth(0.34, 0.48, p), vLight = smooth(0.42, 0.64, p);
    const mGhost = smooth(0.34, 0.44, p) * (1 - smooth(0.66, 0.76, p));
    // phase 3: harmonized
    const morph = smooth(0.68, 0.95, p);
    const vFade = smooth(0.68, 0.85, p);

    gM.uniforms.uRise.value = Math.max(mRise, 0.0001 + 0);
    gM.uniforms.uLight.value = mLight;
    gM.uniforms.uGhost.value = mGhost;
    gM.uniforms.uMorph.value = morph;
    gM.uniforms.uScale.value = fieldScale;
    gM.uniforms.uAlpha.value = 1;
    gV.uniforms.uRise.value = vRise;
    gV.uniforms.uLight.value = vLight;
    gV.uniforms.uGhost.value = 0;
    gV.uniforms.uAlpha.value = 1 - 0.75 * vFade;
    gV.mesh.visible = vRise > 0.001;
    gV.shadow.visible = gV.mesh.visible && vFade < 0.99;
    groundMat.uniforms.uCoarse.value = mRise * (1 - 0.6 * smooth(0.34, 0.5, p));
    groundMat.uniforms.uFine.value = vRise;

    rigM.beamMat.uniforms.uOpacity.value = smooth(0.0, 0.12, p) * (1 - 0.75 * smooth(0.33, 0.45, p));
    rigV.beamMat.uniforms.uOpacity.value = smooth(0.33, 0.45, p) * (1 - 0.75 * smooth(0.66, 0.8, p));
    for (const r of rigs) r.beamMat.uniforms.uTime.value = rm ? 0 : t;

    bars[0].uniforms.uH.value = Math.max(0.001, barH(modis.total) * mLight);
    bars[1].uniforms.uH.value = Math.max(0.001, barH(viirs.total) * vLight);
    const hT = barH(modis.total) * (1 + (scale - 1) * morph);
    bars[2].uniforms.uH.value = Math.max(0.001, hT * smooth(0.66, 0.72, p));
    bandMat.uniforms.uH.value = hT * 1.0 + 0.001;
    bandMat.uniforms.uAlpha.value = 0.18 * smooth(0.85, 1, p);
    band.scale.y = 1;
    band.position.y = 0;
    bars[0].uniforms.uAlpha.value = mRise;
    bars[1].uniforms.uAlpha.value = vRise;
    bars[2].uniforms.uAlpha.value = smooth(0.66, 0.72, p);
    // error band only around the upper part of the harmonized bar (±15%)
    band.position.y = hT * 0.85;
    bandMat.uniforms.uH.value = Math.max(0.001, hT * 0.3);

    // idle motion
    const bob = rm ? 0 : Math.sin(t * 1.1) * 0.08;
    rigM.group.position.y = RIG_Y + bob;
    rigV.group.position.y = RIG_Y - bob;
    rigM.beamMat.uniforms.uBob.value = bob;
    rigV.beamMat.uniforms.uBob.value = -bob;
    barLabels[0].material.opacity = mRise; barLabels[1].material.opacity = vRise; barLabels[2].material.opacity = smooth(0.66, 0.72, p);
    const az = az0 + (rm ? 0 : Math.sin(t * 0.25) * 0.05);
    camera.position.set(camTarget.x + Math.sin(az) * 14, camTarget.y + 11, camTarget.z + Math.cos(az) * 14);
    camera.lookAt(camTarget);
    fireMat.uniforms.uTime.value = t;
    rigV.label.material.opacity = 0.4 + 0.6 * smooth(0.33, 0.45, p);
    rigM.label.material.opacity = 1 - 0.5 * smooth(0.36, 0.45, p);

    renderer.render(scene, camera);
    return settling;
  };
  const loop = createLoop(host, frame, !rm);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(host);
  resize();
  void high;

  let disposed = false;
  return {
    stats,
    setProgress(p: number) { st.pTarget = Math.max(0, Math.min(1, p)); loop.wake(); },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.dispose();
      ro?.disconnect();
      badge?.remove();
      disposeTree(scene);
      boxGeo.dispose(); shadowGeo.dispose(); barGeo.dispose();
      disposeRenderer(renderer);
    }
  };
}
