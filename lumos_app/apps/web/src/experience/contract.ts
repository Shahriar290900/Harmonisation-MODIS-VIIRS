// FROZEN interface between the experience agents (coordinator). Change only via coordinator.
// Routing: '#/' (or empty hash without app keys) = Landing experience; '#/app?...' or any hash containing aoi= = Workspace (existing App).
// The Workspace must keep working exactly as before (all e2e tests).

/** A hotspot point for 3D scenes, derived from the snapshot's cells files (lon/lat in degrees, value = detections). */
export interface HotPoint { lon: number; lat: number; value: number; series: 'aqua' | 'viirs' | 'est'; aoiId: string; year: number; month: number }

/** Owned by the THREE agent (src/experience/three/**). Pure imperative mount APIs so React/GSAP can drive them. */
export interface GlobeHandle {
  setPoints(points: HotPoint[]): void;
  /** 0..1 scroll-driven progress for camera choreography: 0 = whole earth, 1 = zoomed to focus */
  setProgress(p: number): void;
  focus(lon: number, lat: number, durationMs?: number): Promise<void>;
  /** highlight one series; others dim */
  setSeries(s: 'aqua' | 'viirs' | 'est' | 'all'): void;
  resize(): void;
  dispose(): void;
}
export type MountGlobe = (canvasHost: HTMLElement, opts: { reducedMotion: boolean; quality: 'high' | 'low' }) => GlobeHandle | null; // null = WebGL unavailable

export interface PixelCompareHandle { setProgress(p: number): void; resize(): void; dispose(): void }
/** "Two cameras" 3D explainer: MODIS 1 km pixel grid vs VIIRS 375 m grid over the same fire field; progress 0→1 morphs coarse→fine→harmonized */
export type MountPixelCompare = (host: HTMLElement, opts: { reducedMotion: boolean; quality: 'high' | 'low' }) => PixelCompareHandle | null;

export interface TransitionHandle {
  /** full-screen shader wipe from a click point (clientX/Y) into the workspace; resolves at the cover moment, then reveals */
  play(x: number, y: number, color?: string): Promise<void>;
  reveal(): Promise<void>;
  dispose(): void;
}
export type MountTransition = (host: HTMLElement, opts: { reducedMotion: boolean }) => TransitionHandle; // must fall back to a CSS circle wipe without WebGL

/** Quality detection (shared, owned by THREE agent): 'low' on coarse pointer + small screens, low deviceMemory, or saveData. */
export type DetectQuality = () => 'high' | 'low';
