// Ember particle field: one full-viewport canvas of THREE.Points driven by a custom ShaderMaterial. Every particle has a
// fixed seed; its position is computed on the GPU as a blend between "scene" target layouts, each drawn into the live
// rect of its page visual (setSource), so the shapes travel with the page and move thousands of embers from a loose drifting field -> globe hotspots -> coarse (MODIS) grid -> fine
// (VIIRS) grid -> a step line (the 2012 jump) -> an estimate band -> three place clusters.
// Purely decorative and illustrative: positions encode no data. Callers skip it under reduced motion / no WebGL.
import * as THREE from 'three';
import { createLoop, createRenderer, damp, disposeRenderer, seeded } from './util';

export interface EmbersOptions { quality: 'high' | 'low' }
/** Per-frame page geometry: scene 0 field, 1 globe, 2 coarse grid, 3 fine grid, 4 step line, 5 estimate band, 6 place clusters
 *  (fractions blend); alpha = visibility of the SHAPED field; rects[i] = [cx, cy, halfW, halfH] in NDC of the visual scene i is drawn on. */
export interface EmbersGeo { sc: number; alpha: number; rects: number[][]; scrollY: number; /** 0..1 how far the primary shape has gathered the dust (scroll driven) */ gather: number; /** 0..1 over dense reading sections: dust only in the gutters */ quiet: number }
export interface EmbersApplied { scene: number; alpha: number; tick: number; clock: number }
export interface EmbersHandle {
  /** Provide the page geometry; it is pulled once per animation frame while the loop is awake. */
  setSource(fn: (() => EmbersGeo | null) | null): void;
  /** Keep the loop awake for ms (scroll / resize / layout change). */
  touch(ms?: number): void;
  /** Pull the source now, push it to the shader and return what the shader uses. */
  applyNow(): EmbersApplied;
  /** The rect [cx, cy, halfW, halfH] (NDC) last uploaded to the shader for scene index i. */
  uploaded(i: number): number[];
  resize(): void;
  dispose(): void;
}

const VERT = /* glsl */ `
uniform float uTime, uScene, uAspect, uPx, uAlpha, uVel, uGather, uDust, uQuiet;
uniform vec2 uOut;     // 8 px in NDC (x,y)
uniform vec4 uR[7];    // per scene index: centre x,y and half-width,half-height (NDC) of the page visual it is drawn on
attribute vec3 aSeed;
attribute float aRnd;
varying vec3 vCol;
varying float vA;

float h(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
vec2 tField(vec3 s, float t) {
  float y = fract(s.y + t * 0.011 * (0.4 + s.z)) * 2.0 - 1.0;
  vec2 p = vec2(s.x * 2.0 - 1.0, y);
  p += 0.03 * vec2(sin(t * 0.25 + s.y * 9.0 + s.z * 6.0), cos(t * 0.21 + s.x * 8.0 + s.z * 5.0));
  return p;
}
vec2 tGrid(vec3 s, float n, float thr, vec4 F) {
  vec2 cell = floor(s.xy * n);
  for (int i = 0; i < 5; i++) {
    if (h(cell.x * 7.13 + cell.y * 1.71 + n) > thr) break;
    cell = mod(cell + vec2(1.0, 2.0), n);
  }
  vec2 u = (cell + 0.5 + (s.zx - 0.5) * 0.35) / n * 2.0 - 1.0;
  return F.xy + u * F.zw;
}
// Thin trace just outside the border of a real-data chart box: never lines inside the plot.
vec2 tTrace(vec3 s, float t, vec4 F, float k) {
  vec2 h = F.zw + uOut * k;
  float lx = 2.0 * h.x * uAspect, ly = 2.0 * h.y;
  float d = fract(s.x + t * 0.02) * 2.0 * (lx + ly);
  vec2 q;
  if (d < lx) q = vec2(d / lx * 2.0 - 1.0, 1.0);
  else if (d < lx + ly) q = vec2(1.0, 1.0 - (d - lx) / ly * 2.0);
  else if (d < 2.0 * lx + ly) q = vec2(1.0 - (d - lx - ly) / lx * 2.0, -1.0);
  else q = vec2(-1.0, -1.0 + (d - 2.0 * lx - ly) / ly * 2.0);
  return F.xy + q * h + vec2(s.y - 0.5, s.z - 0.5) * 0.008;
}
vec2 target(int i, vec3 s, float t) {
  if (i == 0) return tField(s, t);
  if (i <= 2) return tGrid(s, 7.0, 0.55, uR[2]);
  if (i == 3) return tGrid(s, 19.0, 0.62, uR[3]);
  if (i == 4) return tTrace(s, t, uR[4], 1.0);
  return tTrace(s, t, uR[5], 1.5);
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
  vec2 shp = mix(pa, pb, lt) + vec2(-(pb - pa).y, (pb - pa).x) * sin(lt * 3.14159) * 0.22 * (0.4 + aRnd);   // arc: they flow, not slide
  vec3 shapeCol = mix(tint(int(i0), s), tint(int(i1), s), lt);
  // dust -> shape: every particle drifts as dust everywhere; scroll-driven gather (uGather) pulls it into the shape, staggered, along an arc
  vec2 dust = tField(s, uTime);
  float gp = smoothstep(0.0, 1.0, clamp(uGather * 1.7 - s.z * 0.7, 0.0, 1.0));
  vec2 dd = shp - dust;
  vec2 p = mix(dust, shp, gp) + vec2(-dd.y, dd.x) * sin(gp * 3.14159) * 0.1 * (0.4 + aRnd);
  vCol = mix(tint(0, s), shapeCol, gp);
  p.y -= uVel * 0.04 * (0.3 + aRnd);                  // trail behind the scroll direction
  float tw = 0.55 + 0.45 * sin(uTime * 1.6 + aRnd * 40.0);
  float dustA = aRnd < 0.45 ? uDust : 0.0;             // sparse: under half the particles show as dust
  dustA *= mix(1.0, smoothstep(0.8, 0.95, abs(p.x)), uQuiet);   // dense reading sections: gutters only
  float edge = 1.0 - smoothstep(0.92, 1.0, abs(p.y));
  vA = tw * edge * mix(dustA, max(uAlpha, dustA), gp);
  gl_Position = vec4(p, 0.0, 1.0);
  gl_PointSize = uPx * (1.1 + 2.1 * aRnd) * mix(0.6, 1.0, gp) * (1.0 + min(abs(uVel), 2.0) * 0.5);
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
      uTime: { value: 0 }, uScene: { value: 0 }, uAspect: { value: 1 }, uPx: { value: 2 }, uAlpha: { value: 0 }, uVel: { value: 0 }, uGather: { value: 0 }, uDust: { value: 0 }, uQuiet: { value: 0 }, uOut: { value: new THREE.Vector2(0.01, 0.01) },
      uR: { value: Array.from({ length: 7 }, () => new THREE.Vector4(0, 0, 0.5, 0.5)) }
    }
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(points);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  let dustBase = 0.25;
  let W = 1, H = 1;
  const setDust = () => { dustBase = (isDark() ? 0.25 : 0.1) * (W < 700 ? 0.7 : 1); };
  const applyBlend = () => { mat.blending = isDark() ? THREE.AdditiveBlending : THREE.NormalBlending; setDust(); mat.needsUpdate = true; };
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => { applyBlend(); loop.wake(); }) : null;
  mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  let disposed = false;
  let source: (() => EmbersGeo | null) | null = null;
  let awakeUntil = performance.now() + 4000, lastY: number | null = null, vel = 0, clock = 0, tick = 0, lastAlpha = 0;
  const layout = () => {
    const rect = host.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width)); H = Math.max(1, Math.round(rect.height));
    renderer.setSize(W, H, false);
    mat.uniforms.uAspect.value = W / H;
    setDust();
    (mat.uniforms.uOut.value as THREE.Vector2).set(16 / W, 16 / H);
    mat.uniforms.uPx.value = Math.min(window.devicePixelRatio || 1, opts.quality === 'high' ? 2 : 1.25) * (opts.quality === 'high' ? 1.25 : 1) * Math.max(0.8, Math.min(1.4, H / 900)) * (W < 700 ? 0.7 : 1);
  };
  layout();
  applyBlend();

  const smooth01 = (v: number) => { const c = Math.max(0, Math.min(1, v)); return c * c * (3 - 2 * c); };
  /** Pull the page geometry and push it to the shader. The intro (first ~2.5 s) streams the field into the first shape. */
  const apply = (dt: number): EmbersApplied => {
    const g = source ? source() : null;
    const intro = smooth01((clock - 0.2) / 1.6);   // load intro only fades the shape in
    mat.uniforms.uDust.value = dustBase * intro;
    if (!g) { mat.uniforms.uAlpha.value = 0; mat.uniforms.uGather.value = 0; mat.uniforms.uQuiet.value = 0; lastAlpha = 0; return { scene: 0, alpha: 0, tick, clock }; }
    for (let i = 1; i <= 6; i++) { const r = g.rects[i]; if (r) (mat.uniforms.uR.value as THREE.Vector4[])[i].set(r[0], r[1], r[2], r[3]); }
    if (dt > 0 && lastY !== null) vel += ((g.scrollY - lastY) / dt / H - vel) * damp(8, dt);
    lastY = g.scrollY;
    mat.uniforms.uVel.value = Math.max(-2, Math.min(2, vel));
    const sceneV = g.sc, alpha = g.alpha * intro;
    lastAlpha = alpha;
    mat.uniforms.uGather.value = g.gather; mat.uniforms.uQuiet.value = g.quiet;
    mat.uniforms.uScene.value = sceneV; mat.uniforms.uAlpha.value = alpha;
    return { scene: sceneV, alpha, tick, clock };
  };

  const loop = createLoop(host, (dt) => {
    clock += dt;                                    // private clock: the loop's own time restarts after a sleep
    mat.uniforms.uTime.value = clock;
    apply(dt);
    renderer.render(scene, cam);
    tick++;
    // never idle/sleep while a shape is visible (a frozen pose would jump on the next scroll)
    return performance.now() < awakeUntil || clock < 3;
  }, true, () => true);   // never sleep: idle frames are throttled to IDLE_FPS, and the loop stops on a hidden tab

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (!disposed) { layout(); loop.wake(); } }) : null;
  ro?.observe(host);

  return {
    setSource(fn) { source = fn; loop.wake(); },
    touch(ms = 1600) { awakeUntil = Math.max(awakeUntil, performance.now() + ms); loop.wake(); },
    applyNow() { const a = apply(0); loop.wake(); return a; },
    uploaded(i) { const v = (mat.uniforms.uR.value as THREE.Vector4[])[i]; return [v.x, v.y, v.z, v.w]; },
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
