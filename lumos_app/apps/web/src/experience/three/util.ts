import * as THREE from 'three';

/** True when a WebGL2 context can be created (three r170 requires WebGL2). */
export function hasWebGL(): boolean {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function clampDpr(quality: 'high' | 'low'): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(dpr, quality === 'high' ? 2 : 1.25);
}

/** Create a renderer inside host; returns null when WebGL fails. Canvas fills host. */
export function createRenderer(host: HTMLElement, quality: 'high' | 'low', alpha = true): THREE.WebGLRenderer | null {
  if (!hasWebGL()) return null;
  try {
    const renderer = new THREE.WebGLRenderer({
      antialias: quality === 'high',
      alpha,
      powerPreference: quality === 'high' ? 'high-performance' : 'low-power',
      preserveDrawingBuffer: false
    });
    renderer.setPixelRatio(clampDpr(quality));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const cv = renderer.domElement;
    cv.style.display = 'block';
    cv.style.width = '100%';
    cv.style.height = '100%';
    cv.style.touchAction = 'pan-y';
    cv.setAttribute('aria-hidden', 'true');
    host.appendChild(cv);
    return renderer;
  } catch {
    return null;
  }
}

export function hostSize(host: HTMLElement): { w: number; h: number } {
  const r = host.getBoundingClientRect();
  return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
}

/**
 * rAF loop that pauses when the host is off-screen (IntersectionObserver) or the tab is hidden.
 * frame(dt, t) returns true while it still needs frames (camera motion, tweens, drag); when it returns false:
 *   - `continuous` loops (ambient animation) drop to ≤ IDLE_FPS, and after IDLE_SLEEP_MS without a wake()
 *     they sleep entirely until wake() (WATCHDOG 2: an idle hero must not render every vsync);
 *   - non-continuous loops sleep immediately until wake() (reduced motion / on-demand render).
 */
export interface Loop { wake(): void; dispose(): void; readonly running: boolean }
export const IDLE_FPS = 30;
export const IDLE_SLEEP_MS = 15000;
export function createLoop(host: HTMLElement, frame: (dt: number, t: number) => boolean, continuous: boolean): Loop {
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let visible = true;
  let pageVisible = typeof document === 'undefined' ? true : !document.hidden;
  let last = 0;
  let disposed = false;
  let sleeping = false;
  let lastWake = performance.now();
  const t0 = performance.now();
  const idleGap = 1000 / IDLE_FPS;

  const tick = (now: number) => {
    raf = 0;
    if (disposed || !visible || !pageVisible) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    const more = frame(dt, (now - t0) / 1000);
    if (more) {
      raf = requestAnimationFrame(tick);
    } else if (continuous && now - lastWake < IDLE_SLEEP_MS) {
      // ambient only: throttle; the setTimeout keeps the rAF rate (and GL draws) at ≤ IDLE_FPS
      const wait = Math.max(0, idleGap - (performance.now() - now) - 2);
      timer = setTimeout(() => { timer = null; if (!disposed && !raf) raf = requestAnimationFrame(tick); }, wait);
    } else {
      sleeping = true;
      last = 0;
    }
  };
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (timer) { clearTimeout(timer); timer = null; }
  };
  const start = () => {
    if (disposed || !visible || !pageVisible) return;
    lastWake = performance.now();
    if (timer) { clearTimeout(timer); timer = null; }
    if (raf) return;
    sleeping = false;
    last = 0;
    raf = requestAnimationFrame(tick);
  };

  let io: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) visible = e.isIntersecting;
      if (visible) start(); else stop();
    }, { rootMargin: '64px' });
    io.observe(host);
  }
  const onVis = () => {
    pageVisible = !document.hidden;
    if (pageVisible) start(); else stop();
  };
  document.addEventListener('visibilitychange', onVis);
  start();

  return {
    wake() { start(); },
    dispose() {
      disposed = true;
      stop();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    },
    get running() { return (!!raf || !!timer) && !sleeping; }
  };
}

/** Dispose every geometry/material/texture under an object. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) {
      const arr = Array.isArray(mat) ? mat : [mat];
      for (const mm of arr) {
        for (const k of Object.keys(mm)) {
          const v = (mm as unknown as Record<string, unknown>)[k];
          if (v instanceof THREE.Texture) v.dispose();
        }
        const u = (mm as THREE.ShaderMaterial).uniforms;
        if (u) for (const k of Object.keys(u)) if (u[k].value instanceof THREE.Texture) (u[k].value as THREE.Texture).dispose();
        mm.dispose();
      }
    }
  });
}

export function disposeRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.dispose();
  try { renderer.forceContextLoss(); } catch { /* ignore */ }
  renderer.domElement.remove();
}

/** Deterministic PRNG (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** frame-rate independent damping factor */
export const damp = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt);

export const SERIES_COLORS = { aqua: '#00B4D8', viirs: '#8B5CF6', est: '#14B8A6' } as const;
export const NAVY = '#0B1220';

/**
 * Colour for raw ShaderMaterials: these write gl_FragColor straight to the sRGB canvas (no output
 * conversion), so keep the hex's sRGB components instead of three's linearised values.
 */
export const srgb = (hex: string): THREE.Color => new THREE.Color(hex).convertLinearToSRGB();
