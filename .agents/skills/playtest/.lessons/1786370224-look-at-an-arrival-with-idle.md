---
title: To eyeball what a level LOOKS like on arrival, use `--strategy idle` and read `gameplay.png`
date: 2026-08-10
scope: pwa/scripts/playtest.mjs
concepts: [screenshots, arrival, staging]
---

`gameplay.png` is taken early in the run, so it is the shot of the LANDING — the
frame a player actually sees when the monologue lifts. Pairing it with
`--strategy idle` (no input after start) freezes the composition: the hero stays
where the carve put him, so "is the car at arm's length", "is the boardable
arrow up", "does the HUD sit right over this ground" are all answerable from one
run without staging a scenario. Run length is `--timeout <seconds>`; a shorter
one still produces all four screenshots.

**EXCEPT AT THE HUB, WHERE THE BOT GETS IN THE CAR.** `?bot=` runs the
autopilot's hub rung whatever strategy is named, and that rung boards the wagon
(`engine/game/bot/hub.ts`) — so `--strategy idle --level garage` shows a running
car with NO hero doll anywhere, because a hero at the wheel is drawn as the
machine. To look at the garage's own landing, drive it with no bot at all and
turn the prelude off instead: seed `localStorage["adas-trail:settings"]` with
`{cutscenes:"off", dialogue:"off"}` from `page.addInitScript`, since without a
bot there is nobody to tap a cutscene through.
