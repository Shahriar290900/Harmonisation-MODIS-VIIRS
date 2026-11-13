# 05 — Creative direction

## Core idea / metaphor: "Parallax" and "Two cameras"
Show the **same ground** seen by a coarse camera (1 km squares) and a sharp camera (375 m squares). One bright fire becomes one big pixel for MODIS and several small pixels for VIIRS. That *is* the problem, and it is instantly visual. Everything else (calendar, chart, estimate band) is "putting the two views on one fair scale".

Visual motifs: two overlapping translucent lenses/viewfinders; a seesaw that is finally level; a grid of 5 km cells; a calendar grid lighting up; a thin teal dashed line (the estimate) bridging two differently coloured lines (cyan = MODIS, violet = VIIRS); a gap in a line drawn as a clear "hole", never a zero.

## Mood and tone
Calm, precise, trustworthy — like a good scientific instrument, not an action movie. Curious and human at the start, rigorous in the middle, hopeful at the end. **No fireballs, explosions, sirens or panic.** Fire is shown as small glowing points and warm amber light on a dark map, not as disaster footage.

## Palette (matches the app and the PRD; colour is never the only signal — pair with line style/labels)
- Background: deep navy `#0B1220` (app theme colour) / near-black blue.
- Observed burning: warm amber → red scale (log colour scale from yellow to red).
- MODIS (Aqua): cyan. VIIRS (S-NPP): violet. Estimate: teal, dashed, with a soft band.
- Alerts/DEMO tag: restrained red outline. Text: off-white. Accent for buttons: amber.

## Typography
Bold geometric sans for headlines (the app's hero uses very large, tight headlines with one amber word); monospace for small technical tags ("DEMO DATA · SYNTHETIC FIXTURE"); generous letter-spacing on small caps labels.

## Motion
Slow globe rotation; hotspots fade in with a soft pulse; transitions that "zoom into Bangladesh"; split-screen wipes between the coarse and sharp cameras; chart lines drawing left to right; the 2012 step highlighted with a thin vertical marker; the estimate band easing in only after the viewer understands the gap. Respect reduced-motion in anything interactive (the app does).

## Sound
Soft ambient pad, a gentle low pulse for the hotspot appearing, a subtle "click" for UI interactions, no dramatic risers. Voice: warm, steady, unhurried, one speaker (or two alternating: "problem" voice and "solution" voice). Keep music below voice by ~15–20 dB. Provide subtitles (English; Bangla subtitles are a nice touch — have a Bangla speaker review them).

## Shot ideas (creative, all clearly illustrative where not real data)
1. **Pixel hook:** one amber dot → splits into a 3×3 grid of smaller dots → label "same fire, two cameras (illustrative)".
2. **Satellite pass:** use the supplied Aqua/Terra render (`assets/aqua_terra_satellite_render.png`) sweeping across the globe with a thin swath; then a second, different satellite (a simple generic render labelled VIIRS/S-NPP — do not use a fake NASA logo) crossing at a different angle.
3. **Time-lapse calendar:** years scroll down, months light up in warm colours; seasons appear as a bright band each year.
4. **Seesaw/level metaphor:** two stacks of counters (MODIS small, VIIRS tall) that, after harmonization, are shown on one scale with an honest uncertainty band.
5. **Region triptych:** Bangladesh, California, NSW — three cards slide in; each has its own season fingerprint (use the app's gallery sparklines; label as demo until real).
6. **Honesty beat:** a hatched calendar cell magnifies: "missing ≠ zero". A subtle badge: "observed" vs "estimated".
7. **Close:** pull back to the globe, three regions glowing; end card.

## Thumbnail / cover idea
Dark globe, Bangladesh glowing, split coarse/sharp pixel squares, title **PARALLAX FIRE**, subtitle "Same fires. Two cameras." (no fake data, no accuracy numbers).

## Accessibility & inclusion
Captions on, high-contrast text, avoid red/green-only distinctions, no flashing faster than 3 Hz, describe visuals in the voice-over where a blind viewer would need them. The team includes women members (a team-photo moment can be shown only with each person's consent).

## Do NOT (creative guardrails)
- Don't show real-looking disaster footage as if it were our data.
- Don't invent charts, counts or percentages. If a chart is illustrative, label it "illustrative".
- Don't use NASA logos/branding as if NASA endorses the project (NASA Space Apps branding is allowed only as the event reference; cite "Data: NASA FIRMS" instead).
- Don't use copyrighted music or stock footage without licence; prefer royalty-free sources and keep the licence list.
- Don't claim "AI-powered", "quantum" or "validated" — the product is a calibrated comparison tool; quantum/LLM experiments are separate research.
