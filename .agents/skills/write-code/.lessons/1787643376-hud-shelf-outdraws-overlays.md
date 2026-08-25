---
title: The flight's HUD shelf out-draws a later full-screen overlay — unmount it while a scene parks the sky
date: 2026-08-25
scope: pwa/src/game/rocket-screen/
concepts: [overlays, minigame, z-index, hud]
---

`.drive-hud-shelf` (mission control's dials, timeline, attitude) is
positioned with its own stacking, so a full-screen scene mounted AFTER it in
`RocketScreen`'s JSX still gets the dials painted over it. The house pattern
is to conditionally UNMOUNT the shelf while a parking overlay is up
(`{!voyage && !landingIntro && <HudRoot …/>}`) rather than to out-z it —
mission control has nothing to say about a parked sky, and a z-index war
with authored HUD chrome is unwinnable from a component.
