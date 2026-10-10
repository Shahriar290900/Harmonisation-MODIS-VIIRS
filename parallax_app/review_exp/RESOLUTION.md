# Resolution: experience-layer review (REVIEW.md + WATCHDOG.md + landing e2e)

Final gates, run on 2026-10-10 from a clean `dist/`:

- `npx tsc -p apps/web/tsconfig.json --noEmit`: clean.
- `npm test`: 8 files, 367/367 passed. Five new unit tests cover routing, H1 and season.
- `npm run build`: OK.
- `npm run e2e` (all specs, all 10 projects, default flags, chromium from /opt/pw-browsers): **82 passed, 0 failed, 30 skipped**. The skips are the specs' own `test.skip` project filters, in 19.5 min.
- Servers: every preview server and browser I started was killed (checked with `ps` afterwards).
- Screenshots in `artifacts/redesign/final/`: desktop/mobile landing hero, `#how`, gallery, workspace. I looked at them. The de-pill design and Icon3D are unchanged, and the only visible differences are the fixed copy (see M4).

Baseline before these changes: 14 landing e2e failures (L01×2, L03×2, L04×3, L05×2, L06×3, L08×3).

## High / Medium

| ID | Status | Fix | Evidence |
|---|---|---|---|
| H1 Back during Replay | **fixed** | `store.holdSync(on, {flush})`. App releases the hold with `{flush:false}` in an unmount-only effect. `syncOut` never writes over a non-workspace hash; only `attach()` may, via `syncOut(true)`. | New e2e **L09** (desktop and mobile): Replay → Back gives route/hash `landing|` for 1.6 s. Unit test: release without flush leaves `''`. |
| M1 Landing scroll on Back | **fixed** | `openWorkspace` saves `scrollY` into `history.state.lxScroll` on the landing entry. Landing reads it once on mount, waits (bounded 4 s) until the page is tall enough, then runs `ScrollTrigger.refresh()` and restores the position. | L09: scroll-before 14533 → after 14533 (desktop); 9844 → 9844 (mobile). |
| M2/W3 ScrollTrigger rAF keep-alive | **fixed** | `scrollTriggerOn()` runs during the Landing's first render (before children create triggers); `scrollTriggerOff()` runs on unmount, deferred one macrotask so a StrictMode remount is safe. | L05 now asserts fewer than 15 rAF/s in the idle workspace. Probe: workspace **0 rAF/s** after visiting the landing (was 60–85). |
| M3 "Illustrative" label | **fixed** | `<p class="lx-cam__note">` is now React markup on the WebGL, 2-D fallback and reduced-motion static paths. The three badge is turned off with `badge:false`. | `desktop-landing-how.png` |
| M4 Peak month per year | **fixed** | `summarize()` adds `peakByYear` (each year's own argmax), `openMonth` (best year's own peak), `peakSpan` and `season`. Deep links, hero labels and the index year links/tooltips use the per-year peak. Cards say "Usual peak" (the all-year mean) and "Opens at" (that year's peak). | Hero now reads "New South Wales, **November** 2024" (it said December before). |
| M5 MapPanel WebGL probe | **fixed** | Probes once per page and calls `WEBGL_lose_context`. | L05: live contexts stay at 2 on the landing and 1 in the workspace over 5 trips (was 2→6). |
| W1 Transition hang (hidden tab) | **fixed** | `frame()` is bounded to 120 ms. A hard cap of 6 s runs an idempotent `finish()`: navigate, remove the overlay, reset `busy`. Focus waits up to 6 s for `<main>`. | New e2e **L10** (rAF frozen): overlay gone in 3976 ms (WebGL) and 2828 ms (no WebGL). Before, it never went away. |
| W2 Idle render throttle | **fixed** | `createLoop`: when idle (no motion), ambient loops render at ≤30 fps using setTimeout+rAF, and sleep fully after 15 s with no `wake()`. `fallbacks.ts` stops its rAF loop while offscreen or hidden and restarts it from IntersectionObserver / visibilitychange. | Probe: hero GL draws/s 36 at 3 s, **0 at 20 s idle**. Normal transition is now 6.5–7.6 s (was 8–11.6 s). |

## Low

| ID | Status | Note |
|---|---|---|
| L1 Globe loses hotspots on remount | fixed | `lastPoints` ref is re-applied after the remount. |
| L2 Land-dot long task | fixed | `buildLandDots` is async and time-sliced (≤10 ms per slice, requestIdleCallback); it can be aborted when the globe is disposed. |
| L5 Hard-coded copy | fixed | Derived from data: averaging span, usual season (contiguous months ≥ half the peak mean), "Ten areas", "Bangladesh, its 7 divisions…" and "Twenty-three years". The rendered text is unchanged for this snapshot. |
| L6 Unknown hashes / skip link | fixed | Shared `isWorkspaceHash` treats `#/app…` and selection keys as workspace; everything else is landing. An in-page anchor of the current page keeps the current route. The landing skip link points to `#lx-main` (focus, no history entry). The workspace skip link focuses `#main` without rewriting the hash. |
| L7 Card aria drops DEMO and status | fixed | The label now includes usual peak + span, opening month, est./obs. years and "DEMO data". |
| L8 Promises that never resolve | fixed | Globe `focus()` and the three transition `play()`/`reveal()` now resolve on dispose, teardown, drag or a superseding call. |
| (new) Desktop heap leak | fixed | L05 found +15.75 MB over 4 trips: gsap `quickTo` tweens (magnetic CTA, cursor) kept the detached landing DOM alive. Cleanup now calls `gsap.killTweensOf(el)`. Final heap 20.6 MB (was 33 MB). A CDP probe showed detached nodes flat across trips. |
| L3 Landing loads the workspace chunk | open | Not in this pass. `lazy(App)` needs an offline/precache check. |
| L4 Breakpoints read once | open | Needs `gsap.matchMedia`; this is a design-behaviour change. |
| L9 PRD glyph shapes | open | A docs change outside my edit scope. |
| L10 node_modules/dist in git | open | `.gitignore` is outside my edit scope, so this goes to the coordinator. |

## Landing e2e failures: app bug or test bug?

| Test | Verdict | Change |
|---|---|---|
| L01 reduced: 4 canvases | **Both** | App: the static two-camera frames now mount only when within 600 px of their section. Test: assert one canvas in the hero and no stray canvases. Under reduced motion the hero is one screen tall, so `#how` is legitimately within 600 px on desktop. |
| L03 reduced "instant wipe" `""` | **Test** | The overlay watcher only recorded later mutations. It now records the children present when the overlay appears. Focus check uses a poll. |
| L04 mobile: no visible card | **Test** | The native horizontal scroller needs the card scrolled into view. `waitForTimeout` is replaced by `expect.poll`. The trigger count excludes `once` reveals, which are now consumed because M1 restores a deep scroll position. |
| L05 contexts grow per trip | **App** | Fixed by M5. Also added the workspace rAF check (M2). The fixed sleep is now a condition wait. |
| L06 tab order | **Test** | 9 stops reach the first card, not 8. Skip-link expectations updated for the in-page anchor (L6). Timeout raised to 120 s because SwiftShader makes each keyboard round-trip slow. |
| L08 offline text | **Test** | The app's honest wording is "unavailable — not cached for offline use … not missing data". The test now accepts that and also asserts "not missing data". |

Remaining `waitForTimeout` calls: the poll interval inside `stableTriggers` and the gap between two CDP GC calls. Both are deliberate.

Open risk: the reduced-motion L03 overlay lifetime is about 1.35 s against a 1.5 s limit. It passes, but the margin is thin on a loaded machine.
