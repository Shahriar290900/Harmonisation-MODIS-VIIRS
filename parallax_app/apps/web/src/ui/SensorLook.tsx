import { useEffect, useRef, useState } from 'react';
import { Binoculars, Eye, Flame, Palette, Tv } from 'lucide-react';
import { Tip } from './Tip';

/* Sensor looks inspired by gods-eye-view (MIT): display-only CSS/SVG filters on the map canvas; the data is never changed. */
export type Look = 'normal' | 'thermal' | 'nvg' | 'crt';

const LOOKS: { k: Look; key: string; label: string; icon: typeof Eye; tip: string }[] = [
  { k: 'normal', key: '1', label: 'Normal', icon: Eye, tip: 'Normal view (key 1)' },
  { k: 'thermal', key: '2', label: 'Heat view', icon: Flame, tip: 'Heat-view look: colours like a heat camera, display only (key 2)' },
  { k: 'nvg', key: '3', label: 'Night vision', icon: Binoculars, tip: 'Night-vision look: green phosphor with grain, display only (key 3)' },
  { k: 'crt', key: '4', label: 'Old TV', icon: Tv, tip: 'Old-TV look: scan lines and colour fringe, display only (key 4)' }
];

export const lookForKey = (key: string): Look | null => LOOKS.find((l) => l.key === key)?.k ?? null;

/** Filter definitions, mounted once inside the map stage; referenced from live.css via url(#sensor-*). */
export function SensorFilters() {
  return (
    <svg className="look__defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id="sensor-ironbow" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.4 0.5 0.1 0 0  0.4 0.5 0.1 0 0  0.4 0.5 0.1 0 0  0 0 0 1 0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0 0.1 0.35 0.65 0.9 1 1" />
            <feFuncG type="table" tableValues="0 0 0.02 0.2 0.55 0.9 1" />
            <feFuncB type="table" tableValues="0.05 0.35 0.5 0.35 0.1 0.2 0.9" />
          </feComponentTransfer>
        </filter>
        <filter id="sensor-nvg" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.3 0.6 0.1 0 0  0.3 0.6 0.1 0 0  0.3 0.6 0.1 0 0  0 0 0 1 0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0 0.05 0.15" />
            <feFuncG type="table" tableValues="0.03 0.6 1" />
            <feFuncB type="table" tableValues="0 0.08 0.2" />
          </feComponentTransfer>
        </filter>
        <filter id="sensor-fringe" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
          <feOffset in="r" dx="1.5" dy="0" result="ro" />
          <feOffset in="b" dx="-1.5" dy="0" result="bo" />
          <feBlend in="ro" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="bo" mode="screen" />
        </filter>
      </defs>
    </svg>
  );
}

export function SensorControl({ look, onLook }: { look: Look; onLook: (l: Look) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const cur = LOOKS.find((l) => l.k === look)!;
  return (
    <div className="look__menu" ref={root} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); (root.current?.querySelector('[data-looks-menu]') as HTMLElement | null)?.focus(); } }}>
      <button type="button" className="btn btn--sm" data-looks-menu aria-haspopup="true" aria-expanded={open} aria-controls="looks-pop" onClick={() => setOpen(!open)}>
        <Palette size={14} aria-hidden="true" />Display style{look !== 'normal' && <span className="muted"> · {cur.label}</span>}
      </button>
      <div id="looks-pop" className="seg seg--sm look__seg look__pop" role="group" aria-label="Display style" hidden={!open}>
        {LOOKS.map((l) => (
          <Tip key={l.k} text={l.tip}>
            <button type="button" data-look={l.k} className={look === l.k ? 'is-on' : ''} aria-label={`${l.label} look`} title={l.label} aria-pressed={look === l.k} aria-keyshortcuts={l.key} onClick={() => onLook(l.k)}>
              <l.icon size={13} aria-hidden="true" /><span className="look__lab">{l.label}</span>
            </button>
          </Tip>
        ))}
      </div>
    </div>
  );
}

export function SensorCaption({ look }: { look: Look }) {
  if (look === 'normal') return null;
  return <div className="look__caption" role="note">Display style only - the data is unchanged</div>;
}
