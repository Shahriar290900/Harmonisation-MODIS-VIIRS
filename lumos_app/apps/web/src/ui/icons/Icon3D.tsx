// Lucide icons with a depth treatment, shared by the workspace and the landing.
//  - Icon3D: gradient stroke (light top -> saturated bottom), a darker offset copy underneath (extruded /
//    embossed edge) and a soft SVG drop shadow. For buttons, labels, tabs and headings.
//  - GradIcon: one flat lucide <svg> with a gradient stroke and nothing else. For dense places
//    (calendar cells, legends) where crispness matters more than depth. With tone 'current' the gradient
//    is built from currentColor, so it still follows the cell's text colour.
// Ids come from useId (colons stripped, so url(#…) references always resolve).
import { useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type IconTone = 'amber' | 'cyan' | 'violet' | 'teal' | 'red' | 'neutral' | 'current';

/** [light top, saturated bottom, extrusion edge] */
const TONES: Record<Exclude<IconTone, 'current'>, [string, string, string]> = {
  amber: ['#FEF3C7', '#F59E0B', '#7C2D12'],
  cyan: ['#CFFAFE', '#22D3EE', '#155E75'],
  violet: ['#EDE9FE', '#A78BFA', '#4C1D95'],
  teal: ['#CCFBF1', '#2DD4BF', '#134E4A'],
  red: ['#FFE4E6', '#FB7185', '#881337'],
  neutral: ['#FFFFFF', '#AEBBD3', '#1E2A44']
};

const cleanId = (id: string) => 'i' + id.replace(/[^a-zA-Z0-9_-]/g, '');

interface A11y {
  /** Accessible name. Omit for decorative icons (rendered aria-hidden). */
  title?: string;
  className?: string;
}

function Stops({ tone }: { tone: IconTone }) {
  if (tone === 'current') return <><stop offset="0" stopColor="currentColor" /><stop offset="1" stopColor="currentColor" stopOpacity="0.72" /></>;
  const [a, b] = TONES[tone];
  return <><stop offset="0" stopColor={a} /><stop offset="0.55" stopColor={b} /><stop offset="1" stopColor={b} /></>;
}

export interface Icon3DProps extends A11y {
  icon: LucideIcon;
  tone?: IconTone;
  size?: number;
  strokeWidth?: number;
  /** Fill the shape too (Play, solid discs). */
  filled?: boolean;
}

export function Icon3D({ icon: Icon, tone = 'neutral', size = 18, strokeWidth = 2, filled, title, className }: Icon3DProps) {
  const id = cleanId(useId());
  const g = id + 'g', f = id + 'f';
  const edge = tone === 'current' ? 'rgba(0,0,0,0.38)' : TONES[tone][2];
  // ~0.75 screen px of extrusion whatever the size (24-unit viewBox).
  const off = Math.max(0.6, Math.min(1.5, (24 / size) * 0.75));
  const paint = `url(#${g})`;
  return (
    <svg className={'i3d i3d--' + tone + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 24 24" overflow="visible"
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={g} x1="0" y1="2" x2="0" y2="22" gradientUnits="userSpaceOnUse"><Stops tone={tone} /></linearGradient>
        <filter id={f} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy={off * 1.1} stdDeviation={off * 0.9} floodColor="#020617" floodOpacity="0.55" />
        </filter>
      </defs>
      <Icon x={off * 0.6} y={off} size={24} color={edge} strokeWidth={strokeWidth} fill={filled ? edge : 'none'} overflow="visible" aria-hidden="true" />
      <g filter={`url(#${f})`}>
        <Icon size={24} color={paint} strokeWidth={strokeWidth} fill={filled ? paint : 'none'} overflow="visible" aria-hidden="true" />
      </g>
    </svg>
  );
}

export interface GradIconProps extends A11y {
  icon: LucideIcon;
  tone?: IconTone;
  size?: number;
  strokeWidth?: number;
  filled?: boolean;
  children?: ReactNode;
}

/** Flat, single-<svg> gradient-stroked lucide icon (no extrusion/shadow) for dense UI. */
export function GradIcon({ icon: Icon, tone = 'current', size = 12, strokeWidth = 2.5, filled, title, className, children }: GradIconProps) {
  const g = cleanId(useId()) + 'g';
  const paint = `url(#${g})`;
  return (
    <Icon size={size} strokeWidth={strokeWidth} color={paint} fill={filled ? paint : 'none'} className={className}
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <defs><linearGradient id={g} x1="0" y1="2" x2="0" y2="22" gradientUnits="userSpaceOnUse"><Stops tone={tone} /></linearGradient></defs>
      {title && <title>{title}</title>}
      {children}
    </Icon>
  );
}
