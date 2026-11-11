// Scroll-driven ember particle field (GPU points, see three/embers.ts). Skipped under reduced motion or without WebGL.
// One continuous driver: every frame the live rects of the [data-ember-anchor] visuals decide which chapter shape is
// "primary", how far the hand-off to the next one has progressed, and how visible the shaped field is.
import { useEffect, useRef } from 'react';
import type { Ctx } from './Landing';
import { ScrollTrigger } from './motion';

interface Anchor { id: string; el: HTMLElement; r: DOMRect; f: number }
/** Scene index range [start, end] each anchor draws (cameras goes coarse grid -> fine grid inside its section). */
// The globe and the region gallery carry no shape (real data / sliding cards); the jump chart and the fair schematic only get
// a thin border trace so no label or legend is ever covered. The cameras scene draws the grid inside its illustrative frame.
const RANGE: Record<string, [number, number]> = { cameras: [2, 3], jump: [4, 4], fair: [5, 5] };
/** Shapes sit inside their anchor (cameras 12% margin per side, fair 6%) and never exceed this alpha, so labels stay readable. */
const INSET: Record<string, number> = { cameras: 0.76, jump: 1, fair: 1 };
const ALPHA_CAP = 0.45;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ss = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/** Anchor counts as "arrived" once its centre is this far down the viewport (desktop pins sit at ~0.53, mobile ~0.6). */
const ARRIVE = 0.66;

export function Embers({ ctx }: { ctx: Ctx }) {
  const { three, gl, flags, quality } = ctx;
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (flags.reduced || !gl || !three?.mountEmbers || !host.current) return;
    const el = host.current;
    let h: ReturnType<NonNullable<typeof three.mountEmbers>> = null;
    try { h = three.mountEmbers(el, { quality }); } catch { h = null; }
    if (!h) return;
    const handle = h;

    // anchor elements are cached; re-queried on resize / ScrollTrigger refresh / when one is detached
    let els: { id: string; el: HTMLElement }[] = [];
    const refreshEls = () => {
      els = [];
      document.querySelectorAll<HTMLElement>('[data-ember-anchor]').forEach((a) => {
        const id = a.getAttribute('data-ember-anchor') ?? '';
        if (id in RANGE) els.push({ id, el: a });
      });
    };
    // dense reading sections (document-space ranges, cached): dust stays in the gutters there
    let dense: [number, number][] = [];
    const refreshDense = () => {
      dense = [];
      ['read', 'honest', 'regions', 'index'].forEach((id) => {
        const r = document.getElementById(id)?.getBoundingClientRect();
        if (r) dense.push([r.top + window.scrollY, r.bottom + window.scrollY]);
      });
    };
    refreshEls(); refreshDense();
    const measure = () => {
      const vh = el.clientHeight || window.innerHeight;
      if (!els.length || els.some((x) => !x.el.isConnected)) refreshEls();
      const anchors: Anchor[] = [];
      els.forEach(({ id, el: a }) => {
        const r = a.getBoundingClientRect();
        const vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
        anchors.push({ id, el: a, r, f: r.height > 0 ? vis / r.height : 0 });
      });
      return { anchors, vh };
    };
    const state = () => {
      const { anchors, vh } = measure();
      const W = el.clientWidth || window.innerWidth;
      if (!anchors.length) return null;
      const cy = (a: Anchor) => a.r.top + a.r.height / 2;
      // hand-off progress of each anchor: starts as it enters at the bottom, completes as it reaches the arrival line
      const hp = anchors.map((a) => clamp01((vh + a.r.height / 2 - cy(a)) / (vh + a.r.height / 2 - ARRIVE * vh)));
      let k = 0;
      anchors.forEach((_, i) => { if (hp[i] >= 1) k = i; });
      const A = anchors[k], B = anchors[k + 1] ?? A;
      const h2 = B === A ? 0 : hp[k + 1];
      const wv = (a: Anchor) => ss(0.2, 0.6, a.f);
      const primary = h2 < 0.5 ? A : B;
      const alpha = Math.min(Math.max(wv(A) * (1 - ss(0, 1, h2)), wv(B) * ss(0, 1, h2)), wv(primary)) * ALPHA_CAP;
      let sc: number;
      if (A.id === 'cameras' && h2 === 0) {
        const sec = document.getElementById('how');
        const r = sec?.getBoundingClientRect();
        sc = 2 + (r ? clamp01(-r.top / Math.max(1, r.height - vh)) : 0);
      } else sc = RANGE[A.id][1] + h2 * (RANGE[B.id][0] - RANGE[A.id][1]);
      // rect per scene index (NDC), inset into the middle of the anchor. When the outgoing anchor is off screen the
      // hand-off morphs in place: both ends use the incoming anchor's rect instead of dragging from off screen.
      const ndc = (a: Anchor) => { const r = a.r, k = INSET[a.id] ?? 1; return [((r.left + r.width / 2) / W) * 2 - 1, 1 - ((r.top + r.height / 2) / vh) * 2, (r.width / W) * k, (r.height / vh) * k]; };
      const rects: number[][] = [[0, 0, 0.5, 0.5]];
      for (let i = 1; i <= 6; i++) {
        const a = anchors.find((x) => RANGE[x.id][0] <= i && i <= RANGE[x.id][1]) ?? [...anchors].reverse().find((x) => RANGE[x.id][1] < i) ?? anchors[0];
        rects.push(ndc(B !== A && A.f < 0.2 && a === A && i === RANGE[A.id][1] ? B : a));
      }
      const pIdx = primary === A ? RANGE[A.id][1] : RANGE[B.id][0];
      const gOf = (a: Anchor) => ss(0, 0.7, a.f);
      const gather = Math.max(gOf(A), gOf(B));   // scroll-driven: how far the anchor has entered / not yet left
      const y0 = window.scrollY;
      let cover = 0;
      for (const [t, b] of dense) cover = Math.max(cover, (Math.min(b, y0 + vh) - Math.max(t, y0)) / vh);
      return { geo: { sc, alpha, rects, scrollY: y0, gather, quiet: ss(0.05, 0.4, cover) }, anchors, primary, pIdx };
    };
    handle.setSource(() => state()?.geo ?? null);

    const touch = () => handle.touch(1800);
    const relayout = () => { refreshEls(); refreshDense(); touch(); };
    window.addEventListener('scroll', touch, { passive: true });
    window.addEventListener('resize', relayout);
    ScrollTrigger.addEventListener('refresh', relayout);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(relayout) : null;
    ro?.observe(document.body);
    touch();

    if (import.meta.env.DEV) {
      (window as unknown as { __embers?: unknown }).__embers = {
        debug() {
          const s = state();
          const applied = handle.applyNow();
          const frameOf = (u: number[]) => { const W = el.clientWidth, vh = el.clientHeight, w = u[2] * W, h = u[3] * vh; return { x: ((u[0] + 1) / 2) * W - w / 2, y: ((1 - u[1]) / 2) * vh - h / 2, w, h }; };
          const rc = (r: DOMRect) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
          return {
            scene: applied.scene,
            alpha: applied.alpha,
            primary: s && applied.alpha > 0 ? s.primary.id : null,
            frame: s ? frameOf(handle.uploaded(s.pIdx)) : null,
            tick: applied.tick,
            clock: applied.clock,
            anchors: (s?.anchors ?? []).map((a) => ({ id: a.id, rect: rc(a.r), visible: a.f >= 0.2 }))
          };
        }
      };
    }
    return () => {
      window.removeEventListener('scroll', touch);
      window.removeEventListener('resize', relayout);
      ScrollTrigger.removeEventListener('refresh', relayout);
      ro?.disconnect();
      handle.setSource(null);
      if (import.meta.env.DEV) delete (window as unknown as { __embers?: unknown }).__embers;
      handle.dispose();
    };
  }, [three, gl, flags.reduced, quality]);
  return <div ref={host} className="lx-embers" aria-hidden="true" />;
}
