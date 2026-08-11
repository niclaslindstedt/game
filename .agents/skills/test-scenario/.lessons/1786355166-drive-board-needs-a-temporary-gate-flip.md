---
title: The drive's RANKING board cannot be photographed with `&bot=1` — flip the `auto` gate in `DriveScreen.arrive` temporarily
date: 2026-08-10
scope: pwa/src/game/drive-screen/
concepts: [drive, screenshots, playwright, staging, bot]
---

`?drive&bot=1` never raises the end-of-leg board: `DriveScreen`'s `arrive`
short-circuits to `onArrived` for an `auto` leg on purpose, so the attract loop
cannot park on a screen waiting for a keypress. Driving the leg by HAND from
Playwright does not work either — `keyboard.down("KeyD")` and a held pointer drag
both leave the wagon stalled at 0 mph in the first crowd, and the leg never
arrives (ESCAPE proves the keyboard IS reaching the page, so this is the road
being hard, not the harness being broken).

What works is a one-line LOCAL patch, reverted before committing: gate the
`if (auto)` early return on a `?shotboard` query flag, then drive with
`?drive&shotboard&bot=1&city=0&course=4000`. `city=0` starts the clock at once and
`course=4000` makes the whole leg about fifteen seconds. Seed
`localStorage["adas-trail:drive-scores"]` from `page.addInitScript` to stage the
table: five rows for a normal board, ~770 rows all faster than the bot's leg to
stage a `768` place, or `EMPTY` for a virgin machine.
