// GSAP registration + small motion helpers shared by the landing sections.
import { useEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useMedia } from '../../ui/hooks';

gsap.registerPlugin(ScrollTrigger);
export { gsap, ScrollTrigger };

// REVIEW M2 / WATCHDOG 3: registerPlugin starts ScrollTrigger's rAF keep-alive loop, which kept running in the
// workspace after the landing unmounted. The landing enables ScrollTrigger while mounted and disables it on unmount.
// Disabling is deferred one macrotask so a StrictMode/dev remount (cleanup → immediate re-mount) never creates
// triggers while disabled (they would be inert no-ops).
let stOn = true;
let stOff: ReturnType<typeof setTimeout> | null = null;
export function scrollTriggerOn(): void {
  if (stOff) { clearTimeout(stOff); stOff = null; }
  if (!stOn) { stOn = true; ScrollTrigger.enable(); }
}
export function scrollTriggerOff(): void {
  if (stOff) clearTimeout(stOff);
  stOff = setTimeout(() => {
    stOff = null;
    if (stOn) { stOn = false; ScrollTrigger.disable(false); }
  }, 0);
}

export interface Flags { reduced: boolean; mobile: boolean; fine: boolean }
export function useFlags(): Flags {
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const mobile = useMedia('(max-width: 699px)');
  const fine = useMedia('(hover: hover) and (pointer: fine)');
  return { reduced, mobile, fine };
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Map p from [a,b] to [0,1] with smoothstep. */
export const band = (p: number, a: number, b: number) => { const t = clamp01((p - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Split text into word/char spans for kinetic type (aria-hidden; the parent carries the accessible name). */
export function SplitText({ text, className }: { text: string; className?: string }) {
  const words = text.split(' ');
  return (
    <span className={className} aria-hidden="true">
      {words.map((w, i) => (
        <span className="lx-w" key={i}>
          {[...w].map((ch, j) => <span className="lx-c" key={j}>{ch}</span>)}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}

/** Magnetic hover: element drifts toward the pointer (fine pointers + motion only). */
export function useMagnetic<T extends HTMLElement>(enabled: boolean, strength = 0.32) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * strength);
      yTo((e.clientY - (r.top + r.height / 2)) * strength);
    };
    const leave = () => { xTo(0); yTo(0); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    // kill the quickTo tweens too: they live on gsap's global timeline and would retain the detached landing DOM
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); gsap.killTweensOf(el); gsap.set(el, { x: 0, y: 0 }); };
  }, [enabled, strength]);
  return ref;
}

/** Trailing ring cursor (native cursor stays visible). Grows over links/buttons. */
export function Cursor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3.out' });
    let shown = false;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (!shown) { gsap.set(el, { x: e.clientX, y: e.clientY }); el.classList.add('is-on'); shown = true; }
      xTo(e.clientX); yTo(e.clientY);
      const t = e.target as Element | null;
      el.classList.toggle('is-hot', !!t?.closest?.('a, button, [role="button"]'));
    };
    const leave = () => { el.classList.remove('is-on'); shown = false; };
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => { window.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave); gsap.killTweensOf(el); };
  }, []);
  return <div ref={ref} className="lx-cursor" aria-hidden="true" />;
}

/** Fade/slide children in once when they enter (not scrubbed). */
export function Reveal({ children, className, reduced, as: Tag = 'div' }: { children: ReactNode; className?: string; reduced: boolean; as?: 'div' | 'section' | 'ul' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced || !ref.current) return;
    const ctx = gsap.context(() => {
      gsap.from(ref.current!.children, { opacity: 0, y: 28, duration: 0.8, ease: 'power3.out', stagger: 0.08, scrollTrigger: { trigger: ref.current!, start: 'top 82%', once: true } });
    }, ref);
    return () => ctx.revert();
  }, [reduced]);
  const T = Tag as 'div';
  return <T ref={ref} className={className}>{children}</T>;
}

/** Smooth-scroll to an element (instant under reduced motion). */
export function scrollToId(id: string, reduced: boolean) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  const focusEl = el.querySelector<HTMLElement>('h2, h1');
  if (focusEl) { focusEl.setAttribute('tabindex', '-1'); focusEl.focus({ preventScroll: true }); }
}
