import { useEffect, useRef, useState } from 'react';

export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query); const on = () => setM(mq.matches);
    on(); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}
export type LayoutMode = 'desktop' | 'tablet' | 'mobile';
export function useLayoutMode(): LayoutMode {
  const desk = useMedia('(min-width: 1100px)');
  const tab = useMedia('(min-width: 700px)');
  return desk ? 'desktop' : tab ? 'tablet' : 'mobile';
}
export function useReducedMotion(): boolean { return useMedia('(prefers-reduced-motion: reduce)'); }

export function useSize<T extends HTMLElement>(): [React.RefObject<T>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [s, setS] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setS({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, s];
}

export function useOnline(): boolean {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => {
    const u = () => setOn(navigator.onLine);
    addEventListener('online', u); addEventListener('offline', u);
    return () => { removeEventListener('online', u); removeEventListener('offline', u); };
  }, []);
  return on;
}
