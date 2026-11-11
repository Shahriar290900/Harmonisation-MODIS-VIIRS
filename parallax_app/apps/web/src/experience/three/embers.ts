// Ember particle field: one full-viewport canvas of THREE.Points driven by a custom ShaderMaterial. Every particle has a
// fixed seed; its position is computed on the GPU as a blend between "scene" target layouts, so scroll progress alone
// (setScene) moves thousands of embers from a loose drifting field -> globe hotspots -> coarse (MODIS) grid -> fine
// (VIIRS) grid -> a step line (the 2012 jump) -> an estimate band -> three place clusters.
// Purely decorative and illustrative: positions encode no data. Callers skip it under reduced motion / no WebGL.
import * as THREE from 'three';
import { createLoop, createRenderer, damp, disposeRenderer, seeded } from './util';

export interface EmbersOptions { quality: 'high' | 'low' }
export interface EmbersHandle {
  /** 0 field, 1 globe, 2 coarse grid, 3 fine grid, 4 step line, 5 estimate band, 6 place clusters (fractions blend). */
  setScene(v: number): void;
  /** Fade the field right down behind dense reading sections. */
  setQuiet(q: boolean): void;
  resize(): void;
  dispose(): void;
}

const VERT = /* glsl */ `
uniform float uTime, uScene, uAspect, uPx, uQuiet;
uniform vec4 uFrame;   // centre x,y and half-width,half-height in NDC
uniform vec3 uGlobe;   // centre x,y in NDC and radius in NDC-y
attribute vec3 aSeed;
attribute float aRnd;
varying vec3 vCol;
varying float vA;

float h(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
vec2 disc(vec2 o, float r) { return uGlobe.xy + vec2(o.x / uAspect, o.y) * r; }

vec2 tField(vec3 s, float t) {
  float y = fract(s.y + t * 0.011 * (0.4 + s.z)) * 2.0 - 1.0;
  vec2 p = vec2(s.x * 2.0 - 1.0, y);
  p += 0.03 * vec2(sin(t * 0.25 + s.y * 9.0 + s.z * 6.0), cos(t * 0.21 + s.x * 8.0 + s.z * 5.0));
  return p;
}
vec2 tGlobe(vec3 s, float t) {
  float rY = uGlobe.z;
  if (s.z > 0.3) {                               // hotspot clusters on the disc
    float k = floor(fract(s.z * 7.31) * 6.0);
    vec2 ctr = (vec2(h(k * 3.1), h(k * 5.7)) - 0.5) * 1.05;
    float a = s.x * 6.2832 + t * 0.2;
    vec2 sc = vec2(cos(a), sin(a)) * s.y * s.y * 0.15;
    return disc(ctr + sc, rY);
  }
  float a2 = s.x * 6.2832 + t * 0.05;            // limb glow
  return disc(vec2(cos(a2), sin(a2)) * (1.0 + 0.025 * sin(t + s.y * 20.0)), rY);
}
vec2 tGrid(vec3 s, float n, float thr) {
  vec2 cell = floor(s.xy * n);
  for (int i = 0; i < 5; i++) {
    if (h(cell.x * 7.13 + cell.y * 1.71 + n) > thr) break;
    cell = mod(cell + vec2(1.0, 2.0), n);
  }
  vec2 u = (cell + 0.5 + (s.zx - 0.5) * 0.35) / n * 2.0 - 1.0;
  return uFrame.xy + u * uFrame.zw;
}
vec2 tStep(vec3 s, float t) {
  float x = s.x;
  float ramp = smoothstep(0.43, 0.47, x);        // vertical riser at the instrument change
  float base = mix(-0.35 + 0.08 * sin(x * 30.0), 0.22 + 0.16 * sin(x * 30.0 + 1.0), ramp);
  float spread = 0.035 * (s.y - 0.5) + 0.02 * sin(t + s.z * 30.0);
  return uFrame.xy + vec2((x * 2.0 - 1.0) * uFrame.z, (base + spread) * uFrame.w);
}
vec2 tBand(vec3 s, float t) {
  float x = s.x;
  float c = 0.2 * sin(x * 5.0) - 0.05;
  float b = 0.14 + 0.08 * sin(x * 3.0 + 1.0);
  float y = s.z < 0.15 ? c : c + (s.y * 2.0 - 1.0) * b;       // dashed centre line + 80% band
  float on = s.z < 0.15 ? step(0.5, fract(x * 16.0)) : 1.0;
  return uFrame.xy + vec2((x * 2.0 - 1.0) * uFrame.z, y * uFrame.w) + vec2(0.0, (1.0 - on) * 5.0);
}
vec2 tPlaces(vec3 s, float t) {
  float k = floor(s.z * 3.0);
  vec2 ctr = vec2((k - 1.0) * 0.55, 0.12 + 0.05 * sin(k * 2.0));
  float a = s.x * 6.2832 + t * 0.15;
  vec2 sc = vec2(cos(a) / uAspect, sin(a)) * s.y * s.y * 0.2;
  return ctr + sc;
}
vec2 target(int i, vec3 s, float t) {
  if (i == 0) return tField(s, t);
  if (i == 1) return tGlobe(s, t);
  if (i == 2) return tGrid(s, 7.0, 0.55);
  if (i == 3) return tGrid(s, 19.0, 0.62);
  if (i == 4) return tStep(s, t);
  if (i == 5) return tBand(s, t);
  return tPlaces(s, t);
}
vec3 tint(int i, vec3 s) {
  vec3 amber = vec3(1.0, 0.78, 0.2), orange = vec3(0.98, 0.45, 0.1), red = vec3(0.86, 0.15, 0.1);
  vec3 heat = mix(amber, mix(orange, red, s.y), s.x * 0.8 + 0.1);
  if (i == 2) return vec3(0.0, 0.62, 0.78);      // MODIS / Aqua: cyan family
  if (i == 3) return vec3(0.55, 0.36, 0.96);     // VIIRS: violet
  if (i == 4) return s.x < 0.45 ? vec3(0.0, 0.62, 0.78) : vec3(0.55, 0.36, 0.96);
  if (i == 5) return vec3(0.08, 0.72, 0.64);     // estimate: teal
  return heat;
}

void main() {
  vec3 s = aSeed;
  float sc = clamp(uScene, 0.0, 6.0);
  float i0 = floor(sc);
  float i1 = min(i0 + 1.0, 6.0);
  float f = sc - i0;
  float lt = smoothstep(0.0, 1.0, clamp(f * 1.7 - s.z * 0.7, 0.0, 1.0));   // per-particle stagger
  vec2 pa = target(int(i0), s, uTime), pb = target(int(i1), s, uTime);
  vec2 d = pb - pa;
  vec2 p = mix(pa, pb, lt) + vec2(-d.y, d.x) * sin(lt * 3.14159) * 0.22 * (0.4 + aRnd);   // arc: they flow, not slide
  vCol = mix(tint(int(i0), s), tint(int(i1), s), lt);
  float edge = 1.0 - smoothstep(0.92, 1.0, abs(p.y));
  vA = (0.55 + 0.45 * sin(uTime * 1.6 + aRnd * 40.0)) * edge * mix(1.0, 0.14, uQuiet);
  gl_Position = vec4(p, 0.0, 1.0);
  gl_PointSize = uPx * (1.1 + 2.1 * aRnd);
}`;

const FRAG = /* glsl */ `
precision mediump float;
varying vec3 vCol;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}`;

export function mountEmbers(host: HTMLElement, opts: EmbersOptions): EmbersHandle | null {
  const renderer = createRenderer(host, opts.quality, true);
  if (!renderer) return null;
  const count = opts.quality === 'high' ? 6000 : 1800;
  const rnd = seeded(20120101);
  const seeds = new Float32Array(count * 3), rs = new Float32Array(count), pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { seeds[i * 3] = rnd(); seeds[i * 3 + 1] = rnd(); seeds[i * 3 + 2] = rnd(); rs[i] = rnd(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rs, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false,
    uniforms: {
      uTime: { value: 0 }, uScene: { value: 0 }, uAspect: { value: 1 }, uPx: { value: 2 }, uQuiet: { value: 0 },
      uFrame: { value: new THREE.Vector4(0.36, 0, 0.5, 0.5) }, uGlobe: { value: new THREE.Vector3(0, 0, 0.5) }
    }
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(points);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const applyBlend = () => { mat.blending = isDark() ? THREE.AdditiveBlending : THREE.NormalBlending; mat.needsUpdate = true; };
  applyBlend();
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => { applyBlend(); loop.wake(); }) : null;
  mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  let W = 1, H = 1, disposed = false;
  let target = 0, cur = 0, quietT = 0, quietC = 0;
  const layout = () => {
    const rect = host.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width)); H = Math.max(1, Math.round(rect.height));
    renderer.setSize(W, H, false);
    const wide = W >= 900;
    const side = wide ? Math.min(H * 0.62, W * 0.42) : Math.min(W * 0.8, H * 0.4);
    const f = mat.uniforms.uFrame.value as THREE.Vector4;
    if (wide) f.set(0.36, 0, side / W, side / H); else f.set(0, -0.3, side / W, side / H);
    const gr = Math.min(W, H) * (wide ? 0.3 : 0.26);
    (mat.uniforms.uGlobe.value as THREE.Vector3).set(0, wide ? 0 : -0.12, (gr * 2) / H);
    mat.uniforms.uAspect.value = W / H;
    mat.uniforms.uPx.value = Math.min(window.devicePixelRatio || 1, opts.quality === 'high' ? 2 : 1.25) * (opts.quality === 'high' ? 1.25 : 1) * Math.max(0.8, Math.min(1.4, H / 900));
  };
  layout();

  const loop = createLoop(host, (dt, t) => {
    mat.uniforms.uTime.value = t;
    const k = damp(5, dt);
    cur += (target - cur) * k; quietC += (quietT - quietC) * damp(3, dt);
    mat.uniforms.uScene.value = cur; mat.uniforms.uQuiet.value = quietC;
    renderer.render(scene, cam);
    return Math.abs(target - cur) > 0.001 || Math.abs(quietT - quietC) > 0.005;
  }, true);

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (!disposed) { layout(); loop.wake(); } }) : null;
  ro?.observe(host);

  return {
    setScene(v) { target = Math.max(0, Math.min(6, v)); loop.wake(); },
    setQuiet(q) { quietT = q ? 1 : 0; loop.wake(); },
    resize() { layout(); loop.wake(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.dispose();
      ro?.disconnect();
      mo?.disconnect();
      scene.remove(points);
      geo.dispose();
      mat.dispose();
      disposeRenderer(renderer);
    }
  };
}
