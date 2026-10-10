// Lazy-import entry: `const three = await import('./three')` keeps three.js out of the initial chunk.
export { mountGlobe } from './globe';
export type { GlobeOptions } from './globe';
export { mountPixelCompare } from './pixelCompare';
export type { PixelCompareOptions, PixelCompareStats } from './pixelCompare';
export { mountTransition } from './transition';
export type { TransitionOptions } from './transition';
export { detectQuality } from './quality';
export { loadHotPoints, loadCountries, defaultBasemapUrl } from './data';
export { hasWebGL } from './util';

// compile-time conformance with the frozen contract
import type { DetectQuality, MountGlobe, MountPixelCompare, MountTransition } from '../contract';
import { mountGlobe as _g } from './globe';
import { mountPixelCompare as _p } from './pixelCompare';
import { mountTransition as _t } from './transition';
import { detectQuality as _q } from './quality';
const _conf: [MountGlobe, MountPixelCompare, MountTransition, DetectQuality] = [_g, _p, _t, _q];
void _conf;
