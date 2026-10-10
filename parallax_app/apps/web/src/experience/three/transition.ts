import * as THREE from 'three';
import { gsap } from 'gsap';
import type { TransitionHandle } from '../contract';
import { hasWebGL, NAVY, srgb } from './util';

const vert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const frag = /* glsl */ `
precision highp float;
uniform vec2 uRes; uniform vec2 uCenter; uniform float uCover; uniform float uReveal; uniform float uTime;
uniform vec3 uNavy; uniform vec3 uEmber;
varying vec2 vUv;
float gauss(float x){ return exp(-x * x); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main(){
  vec2 px = vUv * uRes;
  float maxR = length(max(uCenter, uRes - uCenter)) * 1.12;
  vec2 d = (px - uCenter) / maxR;
  float r = length(d);
  vec2 q = px / max(uRes.x, uRes.y) * 6.0;
  float n = fbm(q + vec2(uTime * 0.25, -uTime * 0.18));
  vec2 dir = d / max(r, 1e-4);
  float n2 = fbm(dir * 2.2 + vec2(r * 3.0 - uTime * 0.6, 7.3));
  // cover: expanding, noise-distorted burn front
  float front = uCover * 1.35 - 0.12;
  float field = r + (n - 0.5) * 0.30 + (n2 - 0.5) * 0.12;
  float inside = smoothstep(front + 0.012, front - 0.012, field);
  float edgeDist = (front - field);
  float burn = gauss(edgeDist / 0.032) * step(0.001, uCover);
  float halo = gauss(edgeDist / 0.09) * step(0.001, uCover) * (1.0 - inside);
  float char_ = gauss((edgeDist - 0.05) / 0.05) * 0.8;
  // reveal: dissolve navy away with noisy holes, ember rims
  float dn = fbm(q * 1.6 + 11.0);
  float th = uReveal * 1.25 - 0.1;
  float keep = smoothstep(th - 0.02, th + 0.02, dn);
  float rim = gauss((dn - th) / 0.035) * step(0.001, uReveal) * (1.0 - step(0.999, uReveal));
  float a = inside * keep;
  vec3 red = vec3(0.86, 0.15, 0.07);
  vec3 hot = mix(red, mix(uEmber, vec3(1.0, 0.9, 0.62), smoothstep(0.75, 1.0, burn)), smoothstep(0.15, 0.8, burn));
  vec3 col = uNavy;
  col = mix(col, vec3(0.25, 0.06, 0.03), char_ * inside);
  col += hot * burn * 0.95 + red * halo * 0.25;
  col += mix(uEmber, vec3(1.0, 0.85, 0.5), 0.4) * rim * 1.2;
  // sparks around the front
  float sp = step(0.992, hash(floor(px / 3.0) + floor(uTime * 24.0))) * gauss((edgeDist + 0.03) / 0.06) * (0.4 + 0.6 * n);
  col += vec3(1.0, 0.8, 0.4) * sp;
  float alpha = clamp(max(a, (burn * 0.9 + halo * 0.25 + sp) * keep + rim), 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}`;

type Mode = 'webgl' | 'css' | 'fade';

export interface TransitionOptions { reducedMotion: boolean; coverMs?: number; revealMs?: number; zIndex?: number }

export function mountTransition(host: HTMLElement, opts: TransitionOptions): TransitionHandle {
  const mode: Mode = opts.reducedMotion ? 'fade' : hasWebGL() ? 'webgl' : 'css';
  const coverMs = opts.coverMs ?? 950;
  const revealMs = opts.revealMs ?? 800;
  const z = String(opts.zIndex ?? 9999);
  let el: HTMLCanvasElement | HTMLDivElement | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let mat: THREE.ShaderMaterial | null = null;
  let quad: THREE.Mesh | null = null;
  let scene: THREE.Scene | null = null;
  const cam = new THREE.Camera();
  let raf = 0;
  let tween: gsap.core.Tween | null = null;
  const st = { cover: 0, reveal: 0, t0: 0 };
  let navy = NAVY;

  const baseStyle = (e: HTMLElement) => {
    Object.assign(e.style, { position: 'fixed', inset: '0', width: '100vw', height: '100dvh', zIndex: z, pointerEvents: 'none' } as CSSStyleDeclaration);
    e.setAttribute('aria-hidden', 'true');
  };

  // REVIEW L8: play()/reveal() promises whose tween is killed (teardown, dispose, a newer play) still resolve.
  let pending: (() => void) | null = null;
  const settle = () => { const r = pending; pending = null; r?.(); };
  const teardown = () => {
    settle();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    tween?.kill(); tween = null;
    if (renderer) {
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* noop */ }
      renderer = null;
    }
    quad?.geometry.dispose(); mat?.dispose(); quad = null; mat = null; scene = null;
    el?.remove(); el = null;
    st.cover = 0; st.reveal = 0;
  };

  const ensureGL = (): boolean => {
    if (renderer && mat && el) return true;
    try {
      const cv = document.createElement('canvas');
      baseStyle(cv);
      renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false, premultipliedAlpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      mat = new THREE.ShaderMaterial({
        vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: {
          uRes: { value: new THREE.Vector2(1, 1) }, uCenter: { value: new THREE.Vector2(0, 0) }, uCover: { value: 0 }, uReveal: { value: 0 }, uTime: { value: 0 },
          uNavy: { value: srgb(navy) }, uEmber: { value: srgb('#F59E0B') }
        }
      });
      quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      quad.frustumCulled = false;
      scene = new THREE.Scene();
      scene.add(quad);
      host.appendChild(cv);
      el = cv;
      return true;
    } catch {
      teardown();
      return false;
    }
  };

  const renderLoop = () => {
    raf = 0;
    if (!renderer || !mat || !scene) return;
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = renderer.getPixelRatio();
    const size = renderer.getSize(tmpSize);
    if (size.x !== w || size.y !== h) renderer.setSize(w, h, false);
    (mat.uniforms.uRes.value as THREE.Vector2).set(w * dpr, h * dpr);
    mat.uniforms.uCover.value = st.cover;
    mat.uniforms.uReveal.value = st.reveal;
    mat.uniforms.uTime.value = (performance.now() - st.t0) / 1000;
    renderer.render(scene, cam);
    raf = requestAnimationFrame(renderLoop);
  };
  const tmpSize = new THREE.Vector2();

  const ensureDiv = (): HTMLDivElement => {
    if (el && el instanceof HTMLDivElement) return el;
    teardown();
    const d = document.createElement('div');
    baseStyle(d);
    d.style.background = `radial-gradient(circle at var(--x,50%) var(--y,50%), ${navy} 0%, ${navy} 70%, #1a1206 100%)`;
    host.appendChild(d);
    el = d;
    return d;
  };

  return {
    play(x: number, y: number, color?: string) {
      if (color) navy = color;
      teardown();
      if (mode === 'webgl' && ensureGL() && mat && renderer) {
        (mat.uniforms.uNavy.value as THREE.Color).copy(srgb(navy));
        const dpr = renderer.getPixelRatio();
        (mat.uniforms.uCenter.value as THREE.Vector2).set(x * dpr, (window.innerHeight - y) * dpr);
        st.t0 = performance.now();
        st.cover = 0; st.reveal = 0;
        if (!raf) raf = requestAnimationFrame(renderLoop);
        return new Promise<void>((resolve) => {
          pending = resolve;
          tween = gsap.to(st, { cover: 1, duration: coverMs / 1000, ease: 'power2.in', onComplete: settle });
        });
      }
      const d = ensureDiv();
      d.style.background = navy;
      if (mode === 'fade') {
        d.style.opacity = '0';
        d.style.transition = 'opacity 140ms linear';
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => { d.style.opacity = '1'; setTimeout(resolve, 150); });
        });
      }
      // CSS clip-path circle wipe
      const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 4;
      d.style.clipPath = `circle(0px at ${x}px ${y}px)`;
      d.style.transition = `clip-path ${coverMs}ms cubic-bezier(.55,0,.75,.4)`;
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => { d.style.clipPath = `circle(${r}px at ${x}px ${y}px)`; }));
        setTimeout(resolve, coverMs + 20);
      });
    },
    reveal() {
      if (!el) return Promise.resolve();
      if (renderer && mat) {
        return new Promise<void>((resolve) => {
          st.cover = 1;
          tween?.kill();
          settle();
          pending = resolve;
          tween = gsap.to(st, { reveal: 1, duration: revealMs / 1000, ease: 'power1.inOut', onComplete: teardown });
        });
      }
      const d = el as HTMLDivElement;
      const ms = mode === 'fade' ? 140 : revealMs * 0.6;
      d.style.transition = `opacity ${ms}ms ease`;
      d.style.opacity = '0';
      return new Promise<void>((resolve) => setTimeout(() => { teardown(); resolve(); }, ms + 20));
    },
    dispose() { teardown(); }
  };
}
