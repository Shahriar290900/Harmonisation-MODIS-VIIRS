import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useOnline } from './hooks';
import { Icon3D } from './icons/Icon3D';

type Reg = { needRefresh: boolean; offlineReady: boolean; update: () => void; dismiss: () => void };

// Service worker registration is a module-level singleton so BOTH routes register it (main.tsx calls
// registerPwa() at startup; QA fix: a landing-only visit used to leave the shell uncached). usePwa() subscribes.
type PwaSnap = { needRefresh: boolean; offlineReady: boolean };
let pwaSnap: PwaSnap = { needRefresh: false, offlineReady: false };
const pwaListeners = new Set<() => void>();
let pwaUpdater: ((reload?: boolean) => Promise<void>) | null = null;
let pwaStarted = false;
const setPwa = (p: Partial<PwaSnap>) => { pwaSnap = { ...pwaSnap, ...p }; pwaListeners.forEach((l) => l()); };

/** Register the service worker once (prompt mode). Deferred to window load so it never competes with first paint. */
export function registerPwa(): void {
  if (pwaStarted || import.meta.env.DEV || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  pwaStarted = true;
  if (navigator.serviceWorker.controller) setPwa({ offlineReady: true });
  const go = () => {
    import('virtual:pwa-register').then(({ registerSW }) => {
      pwaUpdater = registerSW({ immediate: true, onNeedRefresh: () => setPwa({ needRefresh: true }), onOfflineReady: () => setPwa({ offlineReady: true }) });
    }).catch(() => {});
  };
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

/** Service worker state + update toast + offline indicator (registration itself: registerPwa()). */
export function usePwa(): Reg {
  const [snap, setSnap] = useState<PwaSnap>(pwaSnap);
  useEffect(() => {
    registerPwa(); // idempotent; keeps the workspace self-sufficient if mounted without main.tsx
    const l = () => setSnap(pwaSnap);
    pwaListeners.add(l);
    l();
    return () => { pwaListeners.delete(l); };
  }, []);
  return { ...snap, update: () => { void pwaUpdater?.(true); }, dismiss: () => setPwa({ needRefresh: false }) };
}

export function PwaToast({ pwa }: { pwa: Reg }) {
  if (!pwa.needRefresh) return null;
  return (
    <div className="toast" role="status">
      <span>A new version of Lumos is ready.</span>
      <button className="btn btn--primary btn--sm" onClick={pwa.update}>Reload</button>
      <button className="btn btn--ghost btn--sm" onClick={pwa.dismiss}>Dismiss</button>
    </div>
  );
}

export function snapshotAge(createdUtc: string, now = Date.now()): string {
  const t = Date.parse(createdUtc);
  if (!Number.isFinite(t)) return 'age unknown';
  const h = Math.max(0, (now - t) / 3.6e6);
  if (h < 1) return 'under an hour old';
  if (h < 48) return `${Math.round(h)} h old`;
  return `${Math.round(h / 24)} days old`;
}

export function StatusLine({ createdUtc, snapshotId, offlineReady }: { createdUtc: string; snapshotId: string; offlineReady?: boolean }) {
  const online = useOnline();
  return (
    <div className="statusline">
      <span className={'net ' + (online ? 'net--on' : 'net--off')} role="status"><Icon3D icon={online ? Wifi : WifiOff} tone={online ? 'teal' : 'amber'} size={14} />{online ? (offlineReady ? 'Online · opened areas work offline' : 'Online') : 'Offline — showing areas you\'ve opened before'}</span>
      <span title={snapshotId}>Snapshot {snapshotAge(createdUtc)}</span>
    </div>
  );
}
