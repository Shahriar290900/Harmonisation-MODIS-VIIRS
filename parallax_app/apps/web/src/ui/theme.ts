// Theme: 'light' (default "daylight atlas") or 'dark'. Persisted in localStorage (every access guarded), applied as
// data-theme on <html>. index.html runs the same logic inline before first paint so there is no flash.
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'parallax-theme';
const EVT = 'parallax-theme-change';

function systemTheme(): Theme {
  return 'dark'; // dark space theme by default; light is opt-in via the toggle
}

/** The stored choice if any, else the OS preference. */
export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* storage blocked */ }
  return systemTheme();
}

function apply(t: Theme) {
  try {
    document.documentElement.setAttribute('data-theme', t);
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'dark' ? '#0B1220' : '#F5F1E8');
  } catch { /* ignore */ }
}

export function setTheme(t: Theme): void {
  apply(t);
  try { localStorage.setItem(KEY, t); } catch { /* storage blocked */ }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: t })); } catch { /* ignore */ }
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Re-apply the stored/OS theme (idempotent; the inline script in index.html already did this before first paint). */
export function initTheme(): void { apply(getTheme()); }

export function useTheme(): [Theme, (t: Theme) => void] {
  const [t, setT] = useState<Theme>(() => getTheme());
  useEffect(() => {
    const on = () => setT(getTheme());
    window.addEventListener(EVT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener('storage', on); };
  }, []);
  return [t, setTheme];
}
