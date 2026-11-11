import { type ReactElement, type ReactNode } from 'react';
import * as RT from '@radix-ui/react-tooltip';

/** Mount once near the app root. Hover, keyboard focus and touch (long-press / tap) all open tips. */
export function TipProvider({ children }: { children: ReactNode }) {
  return <RT.Provider delayDuration={250} skipDelayDuration={300} disableHoverableContent={false}>{children}</RT.Provider>;
}

/**
 * Plain-language tooltip around ONE focusable/inline child (asChild: the child keeps its own aria-label).
 * `text` is also exposed through aria-describedby by Radix while open. Do not use on disabled buttons
 * (they do not fire pointer events): wrap those in a span.
 */
export function Tip({ text, children, side = 'top', align = 'center' }: { text: ReactNode; children: ReactElement; side?: 'top' | 'bottom' | 'left' | 'right'; align?: 'start' | 'center' | 'end' }) {
  if (!text) return children;
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content className="rtip" side={side} align={align} sideOffset={6} collisionPadding={8}>
          {text}
          <RT.Arrow className="rtip__arrow" width={10} height={5} />
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}

/** Wording shared by every status tag / glyph (kept next to data/explain.ts wording: observed vs estimated vs missing). */
export const STATE_TIP: Record<string, string> = {
  observed: 'Observed: the VIIRS satellite counted these hotspots directly. Nothing was guessed.',
  estimated: 'Estimated: VIIRS was not flying, so we learned the VIIRS scale from the Aqua MODIS satellite. It is an estimate with an 80% range, never a measurement.',
  partial: 'Partial month: the satellite record for this month is incomplete, so the count may be too low. Do not compare it with full months.',
  missing: 'Missing: no data exists for this month. Missing is not zero; a hatched square means we simply do not know.',
  unsupported: 'Unsupported: the data is there but we cannot make a trustworthy estimate for this month, so we show none.',
  unavailable: 'Unavailable: this year is listed in the snapshot but could not be loaded (offline or a network error). It is not missing data. Try again when online.',
  loading: 'Loading this month.'
};
export const SPLIT_TIP: Record<string, string> = {
  backcast: 'Backcast: older years (before VIIRS) where the model translates MODIS into VIIRS scale. There is no VIIRS to check against.',
  train: 'Train: years the model learned from, using months where both satellites flew.',
  val: 'Validation: years held back to choose between models. Never used for learning.',
  test: 'Test: years kept sealed until the end, used once to check the model honestly.'
};
