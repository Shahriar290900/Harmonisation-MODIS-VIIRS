// Landing → Workspace page transition. Lives outside React (host appended to <body>) so it survives the
// Landing unmount: play (cover) → set hash (Router swaps to Workspace) → wait for the workspace to paint → reveal.
import type { TransitionHandle } from '../contract';
import { loadThree, webglOk } from './threeLoader';

let busy = false;
let live: HTMLElement | null = null;

/** Polite live region (body-level, persists across routes). */
export function announce(msg: string) {
  if (!live || !live.isConnected) {
    live = document.createElement('div');
    live.className = 'lx-sr';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('role', 'status');
    document.body.appendChild(live);
  }
  live.textContent = '';
  requestAnimationFrame(() => { if (live) live.textContent = msg; });
}

const prefersReduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Resolve when p settles or after ms, whichever is first (never rejects). */
const bounded = (p: Promise<unknown>, ms: number) => Promise.race([p.then(() => undefined, () => undefined), sleep(ms)]);
/**
 * One animation frame, bounded (WATCHDOG 1): a hidden tab never fires rAF, so an unbounded `await frame()` left the
 * overlay up and `busy` stuck until the tab became visible again.
 */
const frame = (ms = 120) => bounded(new Promise<void>((r) => requestAnimationFrame(() => r())), ms);
/** Hard cap for the whole transition; past it the overlay is removed and the workspace is shown regardless. */
const TRANSITION_CAP_MS = 6000;

const SCROLL_KEY = 'lxScroll';
/** REVIEW M1: remember the landing scroll position on the landing's own history entry before navigating away. */
function saveLandingScroll() {
  try {
    const st = history.state && typeof history.state === 'object' ? history.state : {};
    history.replaceState({ ...st, [SCROLL_KEY]: Math.round(window.scrollY) }, '');
  } catch { /* ignore */ }
}
/** Read (once) the scroll position saved on this history entry, then clear it. */
export function consumeLandingScroll(): number {
  try {
    const st = history.state as Record<string, unknown> | null;
    const y = st && typeof st[SCROLL_KEY] === 'number' ? (st[SCROLL_KEY] as number) : 0;
    if (st && SCROLL_KEY in st) { const { [SCROLL_KEY]: _drop, ...rest } = st; void _drop; history.replaceState(rest, ''); }
    return y;
  } catch { return 0; }
}

/** CSS circle wipe (no WebGL / three module unavailable). */
function cssWipe(host: HTMLElement, reduced: boolean): TransitionHandle {
  const el = document.createElement('div');
  el.className = 'lx-wipe';
  host.appendChild(el);
  return {
    async play(x, y, color = '#F59E0B') {
      el.style.setProperty('--x', `${x}px`);
      el.style.setProperty('--y', `${y}px`);
      el.style.setProperty('--c', color);
      if (reduced) { el.classList.add('is-cover', 'is-instant'); return; }
      await frame();
      el.classList.add('is-cover');
      await sleep(620);
    },
    async reveal() {
      if (reduced) { el.remove(); return; }
      el.classList.add('is-reveal');
      await sleep(520);
    },
    dispose() { el.remove(); }
  };
}

async function waitForWorkspace(timeout = 2600) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeout) {
    if (document.querySelector('.cal__grid .cal__cell.st-observed, .cal__grid .cal__cell.st-estimated, .boot--err')) break;
    await sleep(60);
  }
  await frame();
  await frame();
}

/**
 * Move focus into the workspace (<main> needs tabindex=-1 to be programmatically focusable). On a slow device the
 * workspace may still be booting when the overlay goes, so wait (bounded, 6 s) for <main> — unless the user has
 * focused something else in the meantime.
 */
function focusMain() {
  const t0 = performance.now();
  const tryFocus = () => {
    const a = document.activeElement;
    if (a && a !== document.body && a !== document.documentElement) return; // user (or the app) already moved focus
    const main = document.getElementById('main');
    if (main) {
      if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
      return;
    }
    if (performance.now() - t0 < 6000) setTimeout(tryFocus, 100);
  };
  tryFocus();
}

/**
 * Open the workspace at `hash` with a transition from (x, y). Without a pointer position the centre is used.
 * Respects prefers-reduced-motion (instant). Never throws: on failure it simply navigates.
 */
export async function openWorkspace(hash: string, x?: number, y?: number, label = 'Opening the fire calendar') {
  if (busy) return;
  busy = true;
  let done = false, navigated = false;
  const reduced = prefersReduced();
  const px = x ?? innerWidth / 2, py = y ?? innerHeight / 2;
  announce(`${label}…`);
  const host = document.createElement('div');
  host.className = 'lx-transition';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  let h: TransitionHandle | null = null;
  // Idempotent finish: runs at the end of the sequence, or from the hard cap if any step stalls.
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(cap);
    if (!navigated) { navigated = true; saveLandingScroll(); window.scrollTo(0, 0); location.hash = hash; }
    try { h?.dispose(); } catch { /* ignore */ }
    host.remove();
    busy = false;
    announce(`${label.replace(/^Opening/, 'Opened')}.`);
    focusMain();
  };
  const cap = setTimeout(finish, TRANSITION_CAP_MS);
  try {
    // No WebGL → straight to the CSS wipe; never download the three chunk just to fall back.
    if (!reduced && webglOk()) {
      const three = await Promise.race([loadThree(), sleep(400).then(() => null)]);
      try { h = three ? three.mountTransition(host, { reducedMotion: reduced }) : null; } catch { h = null; }
    }
    if (h) {
      // QA: the three wipe's `color` is the COVER fill (navy by default; ember is its burning edge). Passing amber
      // filled the whole screen amber and hid the ember front, so keep its default navy here.
      await bounded(h.play(px, py), 2200);
    } else {
      h = cssWipe(host, reduced);
      await bounded(h.play(px, py, '#F59E0B'), 1500);
    }
  } catch { /* fall through: navigate anyway */ }
  if (done) return;
  try {
    navigated = true;
    saveLandingScroll();
    window.scrollTo(0, 0);
    location.hash = hash;
    await waitForWorkspace(reduced ? 1200 : 2600);
    // bounded: a tween that never completes (hidden tab, killed context) must not leave the overlay or `busy` stuck
    if (!done) await bounded(h?.reveal() ?? Promise.resolve(), 2000);
  } catch { /* ignore */ }
  finish();
}

/** Anchor click → transition (plain left clicks only; modified clicks keep native behaviour). */
export function onWorkspaceLink(e: React.MouseEvent<HTMLAnchorElement>, hash: string, label?: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  const kb = e.detail === 0; // keyboard "click"
  const r = e.currentTarget.getBoundingClientRect();
  void openWorkspace(hash, kb ? r.left + r.width / 2 : e.clientX, kb ? r.top + r.height / 2 : e.clientY, label);
}
