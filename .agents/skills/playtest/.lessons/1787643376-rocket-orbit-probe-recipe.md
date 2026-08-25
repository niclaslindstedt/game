---
title: Probing the rocket's late beats — wait for __flight, key past the cards, then teleport craft.alt near the course top
date: 2026-08-25
scope: pwa/src/game/rocket-screen/
concepts: [rocket, playwright, probes, workbench, staging]
---

`?rocket&debug&launch=0` stamps `window.__flight` only once assets load, so a
probe must `waitForFunction(() => window.__flight)` (60 s on a cold vite)
BEFORE dealing with the intro cards — a fixed sleep screenshots LOADING. The
cards are passed by pressing any key until `__flight.ms` starts advancing
(the title times itself out, the controls card waits). To reach the orbit
sequence / cabin scenes / landing briefing in seconds instead of flying a
whole climb, set `__flight.craft.alt` to just under the course
(`FLIGHT.coursePx` 13500) with `tilt≈0` and a healthy `vy`; the next ticks
reach `toOrbit` honestly. `?rocket&phase=landing` builds a landing LEG
(`FlightParams.leg`), so the drop opens directly. To stage one specific junk
hit, push an `OrbitObject` into `__flight.field` a few px off the nose and
watch `trashCount`.
