---
title: A/B a developer VISUAL knob with playtest.mjs's own seeded flags — and `--level garage --strategy idle` is the frame that shows a wall run
date: 2026-08-12
scope: pwa/scripts/playtest.mjs, pwa/src/game/render/
concepts: [screenshots, staging, ab-testing, developer-settings, probes, arrival]
---

DEVELOPER → VISUALS knobs are persisted settings, not URL params, so
`playtest.mjs` seeds them into `localStorage` from an `addInitScript` before
the app boots (`--pitch`, `--yaw`, `--antialias`, `--standing-walls`). To shoot
the other side of one, pass its flag — do NOT hand-roll a `page.evaluate` or a
second script, and note the seeder only runs when at least one such flag is
given. Adding a knob to that set is four lines: an `opt(...)`, the `if (...)`
guard, a destructured init-script param, and a spread into the stored object.

Picking the FRAME matters as much as the flag. For anything about walls or
`plane:` art, `--level garage --strategy idle` lands the hero on the GOODCO
staff lot with a wall run across the top of frame and a second down the right —
the shot that actually shows the difference. `--level goodco_hq --strategy idle`
does NOT: its landing area is open ground with no wall in frame at all, so a
before/after there looks identical and proves nothing.
