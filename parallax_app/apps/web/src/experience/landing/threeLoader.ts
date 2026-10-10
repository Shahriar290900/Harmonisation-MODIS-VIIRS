// Lazy, failure-tolerant loader for the THREE agent's module (src/experience/three/index.ts).
// import.meta.glob keeps three.js in its own chunk and resolves to {} if the module does not exist,
// so the landing still builds and degrades to static fallbacks.
import type { DetectQuality, HotPoint, MountGlobe, MountPixelCompare, MountTransition } from '../contract';

export interface ThreeModule {
  mountGlobe: MountGlobe;
  mountPixelCompare: MountPixelCompare;
  mountTransition: MountTransition;
  detectQuality: DetectQuality;
  loadHotPoints(baseUrl: string, snapshotId: string, aoiIds: string[], year: number, month?: number): Promise<HotPoint[]>;
}

const mods = import.meta.glob<ThreeModule>('../three/index.ts');
let pending: Promise<ThreeModule | null> | null = null;

export function loadThree(): Promise<ThreeModule | null> {
  if (!pending) {
    const f = mods['../three/index.ts'];
    pending = f
      ? f().then((m) => (typeof m?.mountGlobe === 'function' ? m : null)).catch(() => null)
      : Promise.resolve(null);
  }
  return pending;
}

/**
 * WebGL2 available and not disabled with ?nowebgl (same flag as the workspace map). Cached per page: every probe
 * creates (and loses) a throwaway context, so repeated landing mounts must not keep probing.
 */
let glCache: boolean | null = null;
export function webglOk(): boolean {
  if (/[?&]nowebgl\b/.test(location.search)) return false;
  if (glCache !== null) return glCache;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return (glCache = false);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return (glCache = true);
  } catch {
    return (glCache = false);
  }
}

/** Same rule as the contract's DetectQuality, used until/unless the three module loads. */
export function fallbackQuality(): 'high' | 'low' {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return 'low';
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 4) return 'low';
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (coarse && innerWidth < 900) return 'low';
    return 'high';
  } catch {
    return 'low';
  }
}
