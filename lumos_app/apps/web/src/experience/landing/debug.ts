// QA debug hook (window.__lumosDebug). Read-only, no per-frame cost: everything is computed on demand.
// Used by tests/e2e/landing.spec.ts to prove scroll progress drives the scenes and that nothing leaks across routes.
import { ScrollTrigger } from './motion';

export interface LumosDebug {
  /** Landing mount / unmount counters (StrictMode dev double-mount shows as 2/1). */
  mounts: number;
  unmounts: number;
  /** scrollY the landing restored after Back (REVIEW M1), or undefined. */
  restoredScroll?: number;
  /** 'webgl' | 'fallback' | 'pending' for the hero globe. */
  globe: string;
  /** Live ScrollTrigger instances. */
  scrollTriggers(): number;
  /** Live ScrollTriggers excluding one-shot (`once`) reveals, which are consumed once scrolled past. */
  persistentTriggers(): number;
  /** Live ScrollTriggers that scrub (should be 0 under prefers-reduced-motion). */
  scrubbed(): number;
  /** Progress (0..1) of each section's scrubbed trigger, keyed by the trigger element id or first class. */
  progress(): Record<string, number>;
}

type W = Window & { __lumosDebug?: LumosDebug };

export function debugHook(): LumosDebug {
  const w = window as W;
  if (!w.__lumosDebug) {
    w.__lumosDebug = {
      mounts: 0,
      unmounts: 0,
      globe: 'pending',
      scrollTriggers: () => ScrollTrigger.getAll().length,
      persistentTriggers: () => ScrollTrigger.getAll().filter((t) => !t.vars.once).length,
      scrubbed: () => ScrollTrigger.getAll().filter((t) => !!t.vars.scrub).length,
      progress: () => {
        const out: Record<string, number> = {};
        for (const t of ScrollTrigger.getAll()) {
          const el = t.trigger as HTMLElement | undefined;
          if (!el) continue;
          const k = el.id || String(el.className || 'anon').split(' ')[0];
          if (!(k in out) || (t.vars.scrub && t.progress > out[k])) out[k] = Math.round(t.progress * 1000) / 1000;
        }
        return out;
      }
    };
  }
  return w.__lumosDebug;
}
