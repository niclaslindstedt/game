---
title: A HUD widget for the drive or the flight must be answered BEFORE `renderWidget`'s field guard
date: 2026-08-25
scope: pwa/src/game/hud/widgets/
concepts: [hud, widgets, minigame, surfaces, drift]
---

`renderWidget` (`pwa/src/game/hud/widgets/index.tsx`) opens with
`if (ctx.surface !== "field") return null;` — every widget written so far reads
the RUN, and the tag makes reaching for one from the road a type error instead
of a crash. A widget for the `drive` or `rocket` surface therefore has to be
answered in a `case` ABOVE that line, or it compiles, validates, places itself
correctly and draws nothing.

The name also lives in TWO lists that a test pins together
(`tests/content/hud_catalog_test.ts`): `HUD_WIDGETS` in
`scripts/asset-tools/hud-schema.mjs` (what a YAML file may say) and
`HUD_WIDGET_NAMES` in `widgets/names.ts` (what this build draws). Miss the
second and an element compiles into an empty box.

What justifies a widget rather than authored boxes is worth stating plainly,
because the schema will not decide it for you: a widget is for a thing whose
value is a HISTORY rather than a reading — a needle that lags, a phase that
scrolls, a tremble reseeded per frame. Content still owns where it sits, what
it is gated on and what colour it draws in (`view.color` resolves the Lua
ladder for a widget node exactly as for a text node).
