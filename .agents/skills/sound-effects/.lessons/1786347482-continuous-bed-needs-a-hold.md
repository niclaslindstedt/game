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
  of wobble. A CADENCE YOU CANNOT CHANGE IS NOT A CONSTRAINT ON THE BED — this
  lesson used to say it was, and settled for ~2.3 dB on the run's `carEngine`
  (a 210 ms SIM event) by keeping the drive's grain shape. The shape is a set of
  RATIOS to the cadence, not four fixed numbers: scale all of them by
  `cadence / 105` and a bed fired half as often is the SAME bed at the same
  summed level (measured: 0.11–0.18 dB at 210 ms). `sfx/engine-bed.ts`'s
  `grainShape` is that scaling, and it is what let one engine voice serve both
  cars.
- **A CONSTANT cadence.** A cadence that quickened with the revs made the rate
  of the putter the thing the ear followed; the rate the engine is turning at is
  the PITCH and always was. Rate-of-fire belongs in a separate CLATTER layer,
  never in the bed's scheduler.

Two more that bite: NOISE grains sum in POWER rather than in level, so a
broadband bed needs a deeper stack than a pitched one (5–8 grains vs 3) — and
their linear baked-in fade means they take no hold. And the volumes are the
SUM's, not the grain's: with three overlapping, divide the level you want by
about 2.2 or the bed arrives at three times the intended loudness.

The two-layer "idle putter" recipe this used to recommend (triangle 55→48 Hz
under lowpass-220 noise) is RETIRED: it was a perfectly good engine that had no
parts in it and no mass under it, and the run's car now plays the drive's own
four-layer bed an octave down (`sfx/car-engine.ts`). A key-turn start is still a
static event sound (bandpass-1100 crank whirr + three square 110→90 coughs
130 ms apart, then a sawtooth 36→62 swell with `attackMs: 60` as the catch) —
and it owes the bed a HANDOVER: the swell must settle onto the running note's
idle, or the start ends a fifth above the sound that follows it.
