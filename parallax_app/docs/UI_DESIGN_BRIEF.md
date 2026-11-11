# Parallax Fire: UI design brief ("the UI's perspective")

Every agent that touches the interface follows this file. Tokens live in `apps/web/src/styles/app.css` (`:root` = light, `:root[data-theme="dark"]` = dark, default is dark). If this brief and the CSS disagree, fix the CSS. The goal script `scripts/goals/goal_ui.mjs` parses the contrast block below and checks every hex against `app.css`.

## 1. Product character
A scientific instrument for reading satellite fire hotspots, not a marketing site. Think observatory console: deep space-blue surfaces, thin 1px rules, small uppercase labels, monospaced numerals, one warm accent (amber to red) reserved for "burning". Calm by default; information density is a feature. The landing is a three.js scroll story; the workspace is a quiet dashboard (calendar, map, chart, evidence). Honesty is part of the look: estimates are drawn dashed and teal, observations solid, synthetic data wears the DEMO tag, a hotspot is never styled as a confirmed fire.

Design choices taken from the data set: "Dark Mode (OLED)" (midnight-blue base, one vibrant accent set), "Heat Map / Intensity" chart guidance (calendar cells need keyboard access and a non-colour cue), HUD ideas from gods-eye-view (thin framing lines, uppercase micro-labels, status readouts), and the ux-guidelines rules on touch spacing, focus and reduced motion.

## 2. Colour tokens (exact hex)
| Role | Token | Dark | Light |
|---|---|---|---|
| Page background | `--bg` | #0B1220 | #F5F1E8 |
| Secondary background | `--bg-2` | #0E1729 | #EEE8DA |
| Panel | `--panel` | #111A2E | #FFFFFF |
| Raised panel | `--panel-2` | #142038 | #FBF9F4 |
| Hairline | `--border` | #1E2A44 | #E3DBCB |
| Strong hairline | `--border-2` | #2B3B5E | #CDC3AE |
| Text | `--text` | #E6EDF7 | #171A21 |
| Muted text (text only, never data) | `--muted` | #93A4C3 | #5B6274 |
| Focus ring / link | `--focus`, `--link` | #7DD3FC | #0369A1 |
| Observed series, primary info | `--obs` | #38BDF8 | #0369A1 |
| MODIS / Aqua (cyan family) | `--aqua` | #00B4D8 | #0891B2 |
| VIIRS (violet) | `--viirs` | #9A72F7 | #7C3AED |
| Estimate (teal, always dashed) | `--est` | #14B8A6 | #0F766E |
| Validated / OK | `--val` | #22C55E | #14733A |
| Burning ramp start (amber) | `--amber` | #F59E0B | #D97706 |
| Burning ramp mid / end | `--brand-2`, `--brand-3` | #F97316, #EF4444 | #EA580C, #DC2626 |
| Alert (restrained red) | `--static` | #EF4444 | #C81E1E |
| Terra (Terra/MODIS text accent) | `--terra` | #F59E0B | #A04A08 |
| DEMO tag | `--demo` | #FB7185 | #BE123C |

Rules: burning intensity is the amber to orange to red ramp only. Cyan family = MODIS/Aqua, violet = VIIRS, teal dashed = estimate. Red is for alerts and the DEMO tag, never decoration. `--aqua` and `--amber` in light theme are data/fill colours (3:1 graphics), not text colours; text uses `--obs`, `--terra` or the `--t-*` tokens. Add new colours as tokens in both themes, never inline.

<!-- contrast-pairs
[
 {"name":"dark: text on bg","fg":"#E6EDF7","bg":"#0B1220","min":4.5},
 {"name":"dark: text on panel","fg":"#E6EDF7","bg":"#111A2E","min":4.5},
 {"name":"dark: muted on bg","fg":"#93A4C3","bg":"#0B1220","min":4.5},
 {"name":"dark: muted on panel","fg":"#93A4C3","bg":"#111A2E","min":4.5},
 {"name":"dark: link/focus on panel","fg":"#7DD3FC","bg":"#111A2E","min":4.5},
 {"name":"dark: demo tag on panel","fg":"#FB7185","bg":"#111A2E","min":4.5},
 {"name":"dark: viirs on panel","fg":"#9A72F7","bg":"#111A2E","min":4.5},
 {"name":"dark: estimate teal on panel","fg":"#14B8A6","bg":"#111A2E","min":4.5},
 {"name":"dark: alert red on panel","fg":"#EF4444","bg":"#111A2E","min":4.5},
 {"name":"dark: unsupported cell text","fg":"#7C90B8","bg":"#0F1829","min":4.5},
 {"name":"dark: zero-burn cell text","fg":"#F3E8D2","bg":"#4A3412","min":4.5},
 {"name":"dark: warning text","fg":"#FDE68A","bg":"#2A1F06","min":4.5},
 {"name":"light: text on bg","fg":"#171A21","bg":"#F5F1E8","min":4.5},
 {"name":"light: text on panel","fg":"#171A21","bg":"#FFFFFF","min":4.5},
 {"name":"light: muted on bg","fg":"#5B6274","bg":"#F5F1E8","min":4.5},
 {"name":"light: muted on panel","fg":"#5B6274","bg":"#FFFFFF","min":4.5},
 {"name":"light: link/obs on bg","fg":"#0369A1","bg":"#F5F1E8","min":4.5},
 {"name":"light: demo tag on bg","fg":"#BE123C","bg":"#F5F1E8","min":4.5},
 {"name":"light: validated green on bg","fg":"#14733A","bg":"#F5F1E8","min":4.5},
 {"name":"light: viirs on bg","fg":"#7C3AED","bg":"#F5F1E8","min":4.5},
 {"name":"light: estimate teal on bg","fg":"#0F766E","bg":"#F5F1E8","min":4.5},
 {"name":"light: terra text on bg","fg":"#A04A08","bg":"#F5F1E8","min":4.5},
 {"name":"light: alert red on bg","fg":"#C81E1E","bg":"#F5F1E8","min":4.5},
 {"name":"light: unsupported cell text","fg":"#5B6274","bg":"#EAE3D3","min":4.5},
 {"name":"light: zero-burn cell text","fg":"#6B5A33","bg":"#EFE6D2","min":4.5},
 {"name":"light: warning text","fg":"#78350F","bg":"#FEF3C7","min":4.5}
]
-->

## 3. Typography
Pairing: `--font` (Inter, falling back to IBM Plex Sans, then the system UI stack) for UI and prose; `--mono` (IBM Plex Mono, then ui-monospace) for numbers, units, snapshot ids and legends. No web fonts are loaded and none may be added (no network font requests, offline PWA); the stacks degrade to system fonts.
Scale (px / line-height): micro label 11.5/1.3 uppercase +0.02em; small 12.5/1.4; body 14/1.5; control 13/1.2; h3 16/1.25; h2 20/1.2; h1 28/1.1 (landing display sizes belong to landing.css). Weights 400, 600, 700 only. Numerals in tables and legends use `font-variant-numeric: tabular-nums`. Measure for prose: 62ch max.

## 4. Spacing, radius, elevation
Spacing on a 4 px base: 4, 8, 12, 16, 24, 32. Gaps between touch targets at least 8 px. Radius: tags 2 px (`--radius-xs`), controls 4 px (`--radius-sm`), surfaces 8 px (`--radius-md`); no capsules. Elevation is shadow plus hairline: level 0 flat, level 1 `0 1px 0 border`, level 2 popovers `0 8px 24px var(--shadow-c)`, level 3 modal/tour `0 16px 48px var(--shadow-lg)`. Dark theme prefers a lighter surface and a 1px `--border-2` over heavier shadow.

## 5. Motion
Durations: hover/press 120 to 200 ms, tooltips 120 ms, panels and tour 200 to 300 ms, scroll reveals 300 to 400 ms. Easings: `ease-out` / power1-2 out for entering, `ease-in` for leaving; no elastic or bounce in the workspace. Only `opacity`, `transform` and `width` of progress bars animate (no layout properties). Continuous animation only for loaders and the landing's three.js scene. `prefers-reduced-motion: reduce` removes all transitions and keyframes and the landing falls back to a still scene. Hover is never the only way to reach information (tap and keyboard focus must work).

## 6. Icons
Lucide SVG only (`lucide-react`), wrapped by `ui/icons/Icon3D`. Sizes: 14 (inline with 11.5 to 12.5 text), 16 (buttons, tags), 20 (icon-only buttons and tab bar), 24 (empty states). Stroke width 1.75 to 2, `currentColor` or a series token, `aria-hidden` unless the icon is the only label (then the button carries `aria-label`). No emoji, no icon fonts, no raster icons. Icon tone follows meaning: cyan observed, teal estimate/help, violet models, amber guidance and burning, red demo/alert.

## 7. Components
- **Top bar**: one row at 1024 px and up (brand, area and year controls, stage tag, tools); height about 56 px, 1px bottom hairline, gradient `--topbar-1` to `--topbar-2`. The status line hides below 1700 px and the text tour button below 1500 px. At phone width the brand is `flex: none`, shows "Parallax Fire" on one line (the line break is removed), and the controls wrap to a second row.
- **Tags** (stage, series, status): rectangular, 2 px radius, left accent bar, icon 15 plus uppercase 11.5 label; colour plus icon plus text, never colour alone. DEMO tag uses `--demo` and the striped demo background.
- **Buttons**: primary (solid `--text` on `--bg`), ghost (transparent, hairline on hover), icon-only (min 36 px desktop, 44 px touch). Focus ring is `2px solid var(--focus)` with 2 px offset on every interactive element.
- **Tooltips** (Radix `Tip`): inverted surface (`--text` background, `--bg` text), 12.5 px, max 280 px, 120 ms fade; every icon-only control and every term with a dotted underline has one; content also reachable by focus.
- **Guided tour**: card on `--bg-2` with `--border-2`, 360 px max, step counter in micro label, 3 px amber progress bar, title, body 13.5 px, Skip (text) left, Back/Next right; Escape closes; never auto-opens on `notour=1`.
- **Mobile tab bar** (below 700 px): fixed bottom, 56 px tall, 4 to 5 items with 20 px icon and 11.5 px label, active item has a 3 px amber bar on top and `--text` colour, safe-area padding, 44 px minimum width.
- **Legends**: swatch plus label plus unit, observed solid, estimate dashed, missing hatched, never zero; MODIS cyan, VIIRS violet.
- **Calendar cells**: min 40 px on touch; state shown by fill and by a glyph or hatch (zero burn, missing, unsupported, estimate), keyboard focusable with a double ring; zero is drawn as zero, missing as hatched "no data".
- **Panels**: `--panel` surface, 1px `--border`, 8 px radius, 16 px padding (12 px on phones), uppercase micro-label title.

## 8. Responsive rules
- 375: single column, tab bar, controls full width, no horizontal scroll, text at least 14 px body.
- 768: single column with two-up cards where they fit; tab bar until 700 px, top-bar tools wrap but never overlap the brand.
- 1024: calendar and map/chart side by side, status line hidden, tour text button visible only above 1500 px.
- 1440: full layout, status line visible from 1700 px, content max-width about 1600 px.
No page-level horizontal scroll at any width; wide tables scroll inside their own container.

## 9. Accessibility checklist
- Text contrast at least 4.5:1 (large text and UI graphics 3:1) in both themes; the pairs block above is the executable check.
- Visible focus on every control; skip link present; logical tab order.
- Colour is never the only signal (shape, dash, hatch, label, icon accompany it).
- Touch targets at least 44 x 44 px on phones, 8 px apart.
- Reduced motion honoured; no flashing content.
- Dialogs trap focus, close on Escape, return focus; tooltips are keyboard reachable.
- Charts and the calendar have text equivalents (aria-labels, a data table or summary).

## 10. Never
Never hard-code UI colours outside tokens. Never use emoji as icons. Never use gradient text, glassmorphism blur on dense data, neon glows on text, or purple-pink gradients. Never colour data with `--muted`. Never show missing as zero or an estimate as a measurement. Never call a hotspot a confirmed fire. Never add a font, CDN asset or network call for styling. Never animate layout properties. Never remove a focus outline. Never ship a tooltip as the only place a critical fact appears.

## 11. Sources (all MIT)
- nextlevelbuilder/ui-ux-pro-max-skill: style and colour entries (Dark Mode OLED, data-dense dashboard), heat-map chart guidance, motion durations and easings, touch and focus guidelines. Data read offline from the CSVs; installer not run.
- bilawalsidhu/gods-eye-view: HUD vocabulary (thin framing lines, uppercase micro-labels, status readouts) for the instrument feel.
- obra/superpowers, multica-ai/andrej-karpathy-skills, mattpocock/skills, DietrichGebert/ponytail: working method only (see CLAUDE.md), no UI assets.

## Appendix: optional plugins the owner may install later
Plain text commands; none are installed by this project.
- ui-ux-pro-max: `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` then `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`. Caution: large skill that can push generic palettes; keep this brief authoritative.
- superpowers: `/plugin install superpowers@claude-plugins-official`. Caution: has a SessionStart hook and an optional telemetry ping (set SUPERPOWERS_DISABLE_TELEMETRY to opt out).
- mattpocock skills: `claude plugin install mattpocock-skills@claude-plugins-official`. Caution: adds many skills that change how agents plan and write issues.
- ponytail: `/plugin marketplace add DietrichGebert/ponytail` then `/plugin install ponytail@ponytail`. Caution: adds hooks and a status band to the session.
Deliberately not used: graphify and claude-mem add hooks and background workers (claude-mem has default-on analytics). rea is a reverse-engineering tool and was not needed because the reference repos are open source.
