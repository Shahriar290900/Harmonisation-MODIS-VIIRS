import { Ban, Circle, CircleDot, ChartPie, CloudOff, type LucideIcon } from 'lucide-react';
import type { CellState } from './glyphs';
import { GradIcon } from './icons/Icon3D';

/**
 * Data-state glyphs: tiny lucide shapes (gradient-stroked from currentColor so they follow the cell's text colour)
 * chosen to stay distinct in greyscale at 8–12 px: solid disc · ring with centre dot · pie with a missing slice ·
 * hatched square · ring with a bar · cloud with a strike. Always exactly one <svg class="glyph">.
 */
const ICON: Record<Exclude<CellState, 'loading' | 'missing'>, LucideIcon> = {
  observed: Circle,
  estimated: CircleDot,
  partial: ChartPie,
  unsupported: Ban,
  unavailable: CloudOff
};

/** Thicker strokes at small sizes keep the shapes legible in dense calendar cells. */
const strokeFor = (size: number) => (size <= 9 ? 3.2 : size <= 12 ? 2.7 : 2.3);

export function Glyph({ state, size = 10, className }: { state: CellState; size?: number; className?: string }) {
  if (state === 'loading') return null;
  const cls = 'glyph glyph--' + state + (className ? ' ' + className : '');
  if (state === 'missing') {
    // Missing stays a hatched pattern (no lucide equivalent reads as "absent, not zero").
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" className={cls} focusable="false">
        <rect x="1.2" y="1.2" width="7.6" height="7.6" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M1.2 5.2L5.2 1.2M1.2 8.8L8.8 1.2M4.8 8.8L8.8 4.8" stroke="currentColor" strokeWidth="1" />
      </svg>
    );
  }
  return <GradIcon icon={ICON[state]} size={size} strokeWidth={strokeFor(size)} filled={state === 'observed'} className={cls} />;
}
