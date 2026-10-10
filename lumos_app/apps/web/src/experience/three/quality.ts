import type { DetectQuality } from '../contract';

/** 'low' on coarse pointer + small screen, low deviceMemory (<4 GB), or Save-Data. */
export const detectQuality: DetectQuality = () => {
  try {
    if (typeof window === 'undefined') return 'low';
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return 'low';
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 4) return 'low';
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const small = Math.min(window.innerWidth, window.innerHeight) < 820 || window.innerWidth < 900;
    if (coarse && small) return 'low';
    return 'high';
  } catch {
    return 'low';
  }
};
