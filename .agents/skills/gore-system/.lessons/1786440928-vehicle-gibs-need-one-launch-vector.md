---
title: Vehicle-launched gibs need one speed-and-angle vector, not independent horizontal and vertical ladders
date: 2026-08-11
scope: engine/game/drive/eject.ts, tests/engine/drive_fleet_test.ts
concepts: [drive, collision, launch, head-on, eject]
---

When a collision must carry remains at the vehicle's pre-impact speed inside a
bounded elevation cone, choose one magnitude and one angle, then derive both
horizontal and vertical velocity from that vector. Independent x/z formulas can
produce nearly vertical pieces even when each component looks reasonable. Test
the pure launch vector before gravity and road bounces alter the observed angle.
