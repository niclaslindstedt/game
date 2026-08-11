---
title: Voice an engine off the CRANK, and extrapolate the crank too — a prediction run through the gearbox walks into the next gear early
date: 2026-08-10
scope: pwa/src/game/drive-screen/engine-note.ts
concepts: [drive, engine, pitch, gearbox, grains]
---

The drive's engine pitch is `rpm / RPM_PER_HZ` — the firing frequency of the
revs the physics says the crank is turning at (`engineRpm`/`gearFor`,
`engine/game/drive/drivetrain.ts`), never road speed. Two things fall out of
that once the note is a BED of overlapping grains rather than separate blips:

- Every grain covers ~3 cadences, so they must all glide along the SAME pitch
  line or the engine chorusses against itself under acceleration. Each grain
  glides to the pitch extrapolated one full grain-life ahead; with the
  extrapolation right, a grain ends exactly where the grain fired at its end
  begins.
- EXTRAPOLATE THE RPM, NOT THE ROAD SPEED. Predicting a speed and running it
  back through `engineNote` walks into the NEXT GEAR and returns a pitch a third
  lower, so the note starts falling a third of a second before the upshift — the
  one moment on that road the ear is actually listening to. Revs cannot do that:
  clamp the prediction to `[DRIVETRAIN.idleRpm, DRIVETRAIN.shiftUpRpm]` and it
  stays inside the gear by construction. Across an actual shift there is no rate
  to read at all (the crank did not slow down, it was handed a different gear),
  so hold the pitch flat for that one grain and let `playDriveShift` be the
  event.

A layer that runs at its own rate inside the bed — the CLATTER, one tick per
revolution — must have its phase CARRIED ACROSS GRAINS by the caller
(`EngineNoteState.tickMs`). Restarting the phase every grain makes the ticks
lope at the grain rate, which is a rhythm nothing in the car is making.
