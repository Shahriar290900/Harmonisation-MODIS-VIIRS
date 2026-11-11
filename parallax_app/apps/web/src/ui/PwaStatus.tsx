import { useEffect, useState } from 'react';
import { Download, Share, Wifi, WifiOff, X } from 'lucide-react';
import { Tip } from './Tip';
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
      <span>A new version of Parallax is ready.</span>
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
      <Tip text={online ? 'You are online. Areas you have opened are saved so they still work without a connection.' : 'You are offline. Only areas you opened before are available; they are not missing, just not saved yet.'} side="bottom"><span tabIndex={0} className={'net ' + (online ? 'net--on' : 'net--off')} role="status"><Icon3D icon={online ? Wifi : WifiOff} tone={online ? 'teal' : 'amber'} size={14} />{online ? (offlineReady ? 'Online · opened areas work offline' : 'Online') : 'Offline — showing areas you\'ve opened before'}</span></Tip>
      <Tip text={`Data snapshot ${snapshotId}. A snapshot is a frozen copy of the data, so numbers do not change under you.`} side="bottom"><span tabIndex={0}>Snapshot {snapshotAge(createdUtc)}</span></Tip>
    </div>
  );
}

// ---- Install prompt (beforeinstallprompt where available; iOS gets a Share -> Add to Home Screen hint) ----
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const DISMISS_KEY = 'parallax.install.dismissed';
const isStandalone = () => typeof matchMedia !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !('MSStream' in window);

export function InstallPrompt({ compact }: { compact?: boolean }) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [gone, setGone] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } });
  const [installed, setInstalled] = useState(isStandalone);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    const done = () => { setInstalled(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', on); window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done); };
  }, []);
  const dismiss = () => { setGone(true); try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } };
  if (installed || gone || !compact) return null;
  const ios = isIos();
  if (!evt && !ios) return null;
  return (
    <div className="install" role="region" aria-label="Install app">
      {evt ? (
        <><Download size={18} aria-hidden /><span>Install Parallax Fire as an app. It opens full screen and works offline.</span>
          <button className="btn btn--primary btn--sm" onClick={() => { void evt.prompt(); void evt.userChoice.finally(() => setEvt(null)); }}>Install app</button></>
      ) : (
        <><Share size={18} aria-hidden /><span>Install: tap <b>Share</b>, then <b>Add to Home Screen</b>.</span></>
      )}
      <button className="icon-btn install__x" onClick={dismiss} aria-label="Dismiss install prompt"><X size={16} aria-hidden /></button>
    </div>
  );
}
