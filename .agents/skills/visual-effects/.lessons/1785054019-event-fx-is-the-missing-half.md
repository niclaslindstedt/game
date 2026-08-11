---
title: A new burst needs BOTH an event-fx translation and a draw branch — one without the other draws nothing, silently
date: 2026-07-26
scope: pwa/src/game/game-screen/event-fx.ts
concepts: [event-fx, wiring, silent-failure]
---

Adding a one-shot effect touches three places, and skipping the middle one
fails without any error: the engine pushes the `GameEvent`, `applyEventFx`
(`pwa/src/game/game-screen/event-fx.ts`) turns that event into an `Effect`,
and only then does the `drawEffects` branch ever run. A session that wires the
event and writes a beautiful draw function but forgets the `effects.push({
kind: … })` in `event-fx.ts` gets a perfectly working game with an invisible
effect — no crash, no warning, and the engine-side damage still lands, so a
playtest looks "fine" while nothing is drawn.

The tell in a screenshot is exactly this: the fight is clearly happening
(damage numbers everywhere) and the effect is nowhere. When a new burst does
not show up, check `event-fx.ts` BEFORE re-reading the draw code — and check
it for the screen-space half too (the CSS wash is fired from GameScreen's own
event pass, a separate wiring point again).
