// Scroll-driven ember particle field (GPU points, see three/embers.ts). Skipped under reduced motion or without WebGL.
import { useEffect, useRef } from 'react';
import type { Ctx } from './Landing';
import { sceneBus } from './motion';

export function Embers({ ctx }: { ctx: Ctx }) {
  const { three, gl, flags, quality } = ctx;
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (flags.reduced || !gl || !three?.mountEmbers || !host.current) return;
    let h: ReturnType<NonNullable<typeof three.mountEmbers>> = null;
    try { h = three.mountEmbers(host.current, { quality }); } catch { h = null; }
    if (!h) return;
    const apply = (s: { scene: number; quiet: boolean }) => { h?.setScene(s.scene); h?.setQuiet(s.quiet); };
    apply(sceneBus.get());
    const un = sceneBus.subscribe(apply);
    return () => { un(); h?.dispose(); h = null; };
  }, [three, gl, flags.reduced, quality]);
  return <div ref={host} className="lx-embers" aria-hidden="true" />;
}
