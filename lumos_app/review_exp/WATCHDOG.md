# WATCHDOG — loops, hangs, orphans (2026-10-10)

## 1. Processes
- Start: **no orphans** (no vite/vitest/chromium/node older than 15 min, ports 4173/5173 closed). Nothing killed.
- My own preview (4173, built to scratchpad, not `dist/`) was killed after the probe. Ports 4173 and 5173 are closed.
- Left running: another agent's `vite preview --port 4179` plus `probe2.mjs` and headless_shell, all about 2 min old with a live parent. They are active work, not orphans.

## 2. Runtime probe (Chromium + SwiftShader, 1440x900; rAF wrapped, WebGL draw* counted)
| phase | rAF/s | GL draws/s |
|---|---|---|
| hero idle 10 s | 7.5 | 19.8 (globe renders every frame, SwiftShader-bound) |
| scrolled to bottom (hero offscreen) | 61.6 | **0** |
| back at top | 3.2 | 7.2 |
| `document.hidden=true` (rAF still live) | 27.8 | **0** |
| workspace idle | **85** | 0 |
| transition with tab hidden + rAF frozen | hash set at 3.96 s; **overlay never removed** (15 s) until visible again | |
| normal click→overlay gone | 12–19 s (click actionability 6.6 s) | |

The globe and pixel views pause correctly when offscreen or hidden (`createLoop` uses IO plus visibilitychange). No errors.

## 3. Findings
1. **MED: transition hangs while hidden.** `landing/transition.ts:58-59`: `waitForWorkspace` ends in two unbounded `await frame()` calls. In a hidden tab rAF never fires, so the overlay stays up, `busy` stays true and focus never moves. Confirmed at runtime; it recovers only when the tab becomes visible. Fix: `await bounded(frame(), 100)` twice, or `document.hidden ? sleep(0) : frame()`. Play and reveal are already bounded (2200/2000 ms) and worked.
2. **MED: idle hero renders at full rate.** `three/globe.ts:519` (`createLoop(host, frame, !rm)`) and `three/pixelCompare.ts:524` use `continuous=true`, so the scene renders every vsync (60/120 Hz) with nothing changing. Under SwiftShader this starves the main thread: the hash was set about 7 s after the click even though the code caps it at about 2.6 s, and clicks waited 6.6 s for stability. Fix: cap the idle frame rate at about 30 fps in `createLoop` (skip when `now-last<33`), or go to sleep when `frame()` returns false and only wake on progress, drag or spin.
3. **LOW-MED: ScrollTrigger rAF keepalive never stops.** `landing/motion.tsx:7`: `registerPlugin(ScrollTrigger)` starts gsap's `_rafBugFix` loop (`_enabled && rAF`). It keeps going after Landing unmounts, which is the 85 rAF/s seen on the workspace. Fix: `ScrollTrigger.disable(false)` on Landing unmount and `enable()` on mount.
4. **LOW: 2-D fallback rAF keeps ticking.** `landing/fallbacks.ts:118-127`: the rAF loop keeps running offscreen or hidden and only skips `draw()`. Fix: stop or restart the loop from the IO and visibilitychange callbacks, the same way `createLoop` does.
5. **LOW: several refreshes at startup.** `Landing.tsx:46,50-52` and `Gallery.tsx:39` together can call `ScrollTrigger.refresh()` about 4 times during startup. None of these run in a resize or scroll handler, so this is not a refresh storm. Fix (optional): debounce them into one refresh.
6. **LOW: e2e timing flakiness.** `tests/e2e/landing.spec.ts:47,54,79,241,313,325,334` rely on `waitForTimeout`. Global timeouts are set (60 s test, 10 s expect). The magnetic CTA (`useMagnetic`) moves under the pointer, so Playwright's stability check retries (6.6 s seen). Fix: `expect.poll` on `__lumosDebug` state, and `click({ force: true })` or hover first on magnetic buttons.

## 4. Checked clean
- Hash ping-pong: the store writes with `replaceState`, which fires no hashchange, and the Router normalizes the hash before the store reads it. No loop.
- ResizeObservers: the JumpChart box is `width:100%` with `min-width:0` and debounced (`Story.tsx:141`). Globe and pixel views observe their own host, and the fallback RO is only used when there is no WebGL. No feedback loop.
- No `repeat:-1` tweens. Three transition `teardown()` kills its tween and cancels rAF. A lost context only makes `render` a no-op, so the bounded promises still settle.
