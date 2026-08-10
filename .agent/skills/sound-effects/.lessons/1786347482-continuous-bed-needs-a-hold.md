---
title: A continuous bed is a HOLD plus a cadence half of it — "a grain longer than the gap" is not enough and sounds like a putter
date: 2026-08-01
scope: pwa/src/game/sfx/, content/sounds/
concepts: [loops, grains, machinery, sustain, engine, drive]
---

The synth has no looping voice, so a running engine (or any machine hum) is a
GRAIN fired on a cadence. The old rule here — "make the grain a touch longer
than the cadence and they overlap into a seamless loop" — is WRONG, and shipped
two putt-putting cars before anybody said so out loud. A tone's level falls
EXPONENTIALLY across its whole `durationMs`: a tenth of the peak a quarter of
the way in, a hundredth by halfway. A 240 ms grain every 210 ms is audibly over
before its successor arrives.

Three things make a bed, and all three are needed:

- **`holdMs`** (added to `ToneOptions` for exactly this) keeps the peak up past
  the next grain's arrival. Without it no cadence short of a buzz will fuse two
  grains.
- **Cadence ≈ half the hold**, so three grains sound at once. The measured
  numbers for the drive: cadence 105, attack 60, hold 200, life 320 → ~1.2 dB
  of wobble. At a cadence you cannot change (the run's `carEngine` is a
  210 ms SIM event), attack 60 / hold 200 / life 320 is the best available and
  gives ~2.3 dB, which reads as an idling engine rather than a fault.
- **A CONSTANT cadence.** A cadence that quickened with the revs made the rate
  of the putter the thing the ear followed; the rate the engine is turning at is
  the PITCH and always was. Rate-of-fire belongs in a separate CLATTER layer,
  never in the bed's scheduler.

Two more that bite: NOISE grains sum in POWER rather than in level, so a
broadband bed needs a deeper stack than a pitched one (5–8 grains vs 3) — and
their linear baked-in fade means they take no hold. And the volumes are the
SUM's, not the grain's: with three overlapping, divide the level you want by
about 2.2 or the bed arrives at three times the intended loudness.

The idle putter recipe still stands as a timbre: triangle 55→48 Hz (detune 12)
under lowpass-220 noise; intensity adds ~+70 Hz and opens the filter to ~740 Hz
at full throttle. A key-turn start is a static event sound (bandpass-1100 crank
whirr + three square 110→90 coughs 130 ms apart, then a sawtooth 36→62 swell
with `attackMs: 60` as the catch).
