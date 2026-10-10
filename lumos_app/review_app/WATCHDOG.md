# WATCHDOG: Lumos Fire Calendar web app (2026-10-09, 19:27 UTC)

## 1. Processes and ports
- `ps` shows only sandbox infrastructure (process_api, environment-manager, claude, rclone, telemetry). There are no vite, playwright/chromium, vitest or node processes, and no orphans. **Nothing was killed.**
- Nothing is listening on 4173 or 5173. The only listeners are 2024/2025 (infra) and two loopback ephemeral ports.
- Leftovers on disk: 4 empty `/tmp/lumos-import-*` dirs (see F4) and about 37 `/tmp/lumos-{src,out,zip}-*` dirs from unit tests that never clean up. They are harmless; delete with `rm -rf /tmp/lumos-*-??????`.

## 2. Runtime loop/hang audit (apps/web/src)
**Checked and clean:**
- **Hash ping-pong:** `store.ts:114` uses `history.replaceState`, which never fires `hashchange`. `set()` returns early when nothing changed (`:127-128`). No loop is possible.
- **Replay:** `App.tsx:74-84` clears its interval, stops at the range end and reads state through a ref. Clean.
- **MapLibre:** handlers (`MapPanel.tsx:101-110`) never set React state except `load`→`setReady` (fires once). `setData` effects depend on memoised `pts`/`max` and nothing feeds back.
- **Effects:** all are keyed (`useActivity` by `years.join`; `useCells`/`useGeo` by the `region` object, which is stable inside `core`) and guarded by an `alive` flag.
- **Retries:** `api.ts:90,112` evict failed promises and never retry. There are no `while` loops on data (`explain.ts:36` is a bounded regex exec) and no rAF.
- **Service worker:** `registerType:'prompt'`. `onNeedRefresh` only shows a toast, and a reload happens only on click. No reload loop.
- **Payload size:** at most 207 KB per JSON file, 15 MB of data in total. Parsing cost and two passes over cells rows per month change are negligible.

| # | file:line | sev | Why | Fix |
|---|---|---|---|---|
| F1 | `data/api.ts:79` | medium | `fetch` has no timeout or AbortController. A stalled request (flaky mobile network, or SW `CacheFirst` waiting on network the first time) leaves "Loading snapshot…" spinning forever with no error. | Wrap `doFetch` in `AbortSignal.timeout(20000)` and surface the error in `useCore`. |
| F2 | `ui/useAppData.ts:36` | medium | `loadActivityRange` has no `.catch`. A schema error in one year means `useActivity` stays `null` forever (calendar empty, no message) and logs an unhandled rejection. | Add `.catch` and set an error state, or map the failing year to `null`. |
| F3 | `ui/useAppData.ts:13-26` | low | `useCore` has no `alive` guard. Under StrictMode the effect runs twice. Requests are deduplicated by cache, so the only cost is a setState after unmount. | Add an `alive` flag like the other hooks. |
| F4 | `scripts/import_bundle.mjs:30-33,107` | medium | `extractZip` creates `tmp` before `safeRel` can throw, but `tmp` is assigned only on return, so the `finally` never removes it. This is the source of the 4 leaked dirs. AdmZip also loads the whole zip into memory and `getData()` inflates each entry synchronously, with no size cap: a huge or zip-bomb bundle means OOM or a long hang. | Clean up inside `extractZip` with try/catch. Reject when the sum of `e.header.size` is over about 500 MB or there are more than 20k entries. Hash with streams. |
| F5 | `scripts/import_bundle.mjs:120-124` | low | If `copyDir` or the second `verifyBundle` throws, `public/data/.import-<id>-*` is left behind. It would ship in `dist/`. | Wrap in try and `rmSync(staging)` on error. |
| F6 | `ui/__shots__/shots.mjs:5-end` | low | There is no try/finally around `chromium.launch`. Any failed locator (30 s default) leaves headless Chrome orphaned. `waitUntil:'networkidle'` with SW and map tiles can also stall up to 30 s. | Wrap in `try{…}finally{await b.close()}` and use `waitUntil:'load'`. |
| F7 | `state/store.ts:110-114` | low | Replay writes localStorage and calls `replaceState` every 380 ms. Safari throttles at about 100 replaceState calls per 30 s (≈79 here). The error is caught, but this is close to the limit. | Skip `syncOut` while playing, or debounce it to 1 s. |

## 3. Test/script config
- `npm test` = `vitest run`, so it does not start watch mode. There are no testTimeout overrides (the 5 s default is fine).
- **F8 (medium):** `npm run e2e` points to `tests/playwright.config.ts`, **which does not exist** (there is also no `*.spec.ts`), so e2e fails immediately. When it is added, use `webServer:{command:'npm run preview', port:4173, reuseExistingServer:!process.env.CI, timeout:60000}`, `globalTimeout` ≤ 10 min, and `workers:1` in the sandbox. Otherwise an orphaned preview on 4173 plus `--strictPort` makes the next run fail with "port in use".
- `preview` has `--strictPort`: good (it fails rather than drifting to 4174).
