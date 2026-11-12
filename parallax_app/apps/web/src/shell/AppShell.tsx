import { useState, type ReactNode } from 'react';
import { FlaskConical } from 'lucide-react';
import { TopBar, AboutData } from '../ui/TopBar';
import { Tour } from '../ui/Tour';
import { Dialog } from '../ui/Dialog';
import { TipProvider } from '../ui/Tip';
import { Icon3D } from '../ui/icons/Icon3D';
import { PwaToast, StatusLine, InstallPrompt, snapshotAge, usePwa } from '../ui/PwaStatus';
import { useMedia, useReducedMotion } from '../ui/hooks';
import { useSelection } from '../ui/bridge';
import type { Route } from '../state/store';
import { Nav } from './Nav';
import { useWorkspace } from './workspace';
import '../styles/onboarding.css';
import '../styles/shell.css';

/** Top bar, navigation (rail on desktop, bottom bar on phones), footer credit and shared dialogs around every page. */
export function AppShell({ route, liveAvailable, children }: { route: Route; liveAvailable: boolean; children: ReactNode }) {
  const { core, ready } = useWorkspace();
  const sel = useSelection();
  const pwa = usePwa();
  const phone = useMedia('(max-width: 699px)');
  const wide = useMedia('(min-width: 1500px)');
  const reduced = useReducedMotion();
  const [about, setAbout] = useState(false);
  const [tourToken, setTourToken] = useState(0);
  const m = core.manifest;
  return (
    <TipProvider>
      <div className="shell" data-route={route}>
        <a className="skip" href="#main" onClick={(e) => {
          // Focus <main> without rewriting the hash (the hash carries the page and the selection).
          const el = document.getElementById('main'); if (!el) return;
          e.preventDefault(); if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1'); el.focus();
        }}>Skip to content</a>
        <div className="shell__top tour-topbar">
          {m.synthetic && (
            <div className="demo-banner" role="note">
              <b className="warn-label"><Icon3D icon={FlaskConical} tone="red" size={14} />DEMO DATA</b><span>Made-up numbers in the real file format, not real fire observations.</span>
              <button className="linkish" onClick={() => setAbout(true)}>Details</button>
            </div>
          )}
          <TopBar regions={core.regions} aoiId={sel.aoiId} manifest={m} onAbout={() => setAbout(true)} onTour={() => setTourToken((n) => n + 1)} compact={phone}
            status={wide ? <StatusLine createdUtc={m.created_utc} snapshotId={m.snapshot_id} offlineReady={pwa.offlineReady} /> : null} />
        </div>
        <Nav route={route} liveAvailable={liveAvailable} />
        <div className="shell__body">
          {children}
          <footer className="shell__foot">
            <StatusLine createdUtc={m.created_utc} snapshotId={m.snapshot_id} offlineReady={pwa.offlineReady} />
            <span className="shell__credit">Created by M Al Shahriar Hameem · Team Lumos · NASA Space Apps 2026</span>
          </footer>
        </div>
        <Dialog open={about} onClose={() => setAbout(false)} title="About this data">
          <AboutData manifest={m} ageText={snapshotAge(m.created_utc)} aoiId={sel.aoiId} regions={core.regions} />
        </Dialog>
        <PwaToast pwa={pwa} />
        {phone && <InstallPrompt compact />}
        <Tour ready={ready} reduced={reduced} runToken={tourToken} />
      </div>
    </TipProvider>
  );
}
