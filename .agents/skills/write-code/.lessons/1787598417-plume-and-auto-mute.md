---
title: The flight reuses the cutscene plume (`drawPlume`) and its auto mode mutes the voice — verify FX on a bot lap, thoughts on an attended one
date: 2026-08-24
scope: pwa/src/game/rocket-screen/, pwa/src/game/render/rocket-exhaust.ts
concepts: [minigame, fx, reuse, debugging, screenshots]
---

Two facts that save a session working on the rocket screen. First, the ship's
exhaust is NOT its own effect: `render/rocket-exhaust.ts` exports `drawPlume`
(the launch cutscene's column — bands, lash, shock diamonds, halo) and
`rocket-screen/render.ts` draws it under the hull in the sprite's own top-left
space, with `RocketFxState.burnLevel` (`easeBurn`) smoothing the throttle so
boost BLOOMS. Write a second fire and the takeoff and the climb stop matching.
Second, `RocketScreen`'s `auto` prop (the bot) deliberately no-ops `say()` —
the attract loop's rules — so a `?rocket&bot=1` screenshot will NEVER show a
thought; verifying the voice needs an attended lap (page through the intro
card with a click first, or `window.__flight.ms` stays at 0 forever).
