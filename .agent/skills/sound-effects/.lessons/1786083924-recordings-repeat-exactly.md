---
title: A recording repeats exactly; the sound it replaced did not
date: 2026-08-07
scope: mod/
concepts: [recordings, repetition, mods]
---

`synth.noise()` regenerates its white-noise buffer on EVERY call, so a shipped
impact is subtly different each time it fires. A mod's `.wav` is byte-identical
forever — so a sound pack replacing `enemy_hit` is measurably more fatiguing
than the oscillators it replaced, which is the opposite of what its author
intended. This is the classic "machine gun" artifact and it is invisible in
every test and every screenshot.

Two cures, and a pack wants at least the first:

- `pitchJitter: 0.05` (± that fraction of playback rate, redrawn per play).
  0.04–0.08 is a semitone of life; past ~0.15 it reads as a broken tape.
- Variant TAKES — `enemy_hit.1.wav`, `.2.wav`, `.3.wav` — picked `cycle` by
  default. Round-robin rather than random deliberately: random repeats a take
  back-to-back about a third of the time with three takes, and a repeat is
  exactly what the ear catches.

Never pick a take with `state.rng()`. `pick: hash` derives from where the sound
happened and `cycle` from a bank-local counter; a draw from the run's stream
would shift every loot roll after it. The road's banks (`drive-sounds.ts`)
already worked this way — variants just made it data.
