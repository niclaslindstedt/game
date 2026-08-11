---
title: A sound layered UNDER an existing one has to SUBTRACT — every band it shares with the sound above it makes the pair louder, not bigger
date: 2026-08-11
scope: content/sounds/
concepts: [layering, mixing, sub, drive, impacts]
---

The drive's big-blast shockwave is played on the same tick as `drive_explosion`
rather than instead of it, and the first cut of it was written the way a
standalone big sound is written: sub, air wall, a delayed rush, and a thin
highpass tail. It came out as a LOUDER bang instead of a BIGGER one, because the
crack, the debris sizzle and the mid-band rush were all already in the sound
above it — every shared band just added level.

The rewrite kept only what the sound above does NOT have: a sine front held at
its peak (`holdMs: 420`) falling 46 → 14 Hz over 1.75 s, a detuned triangle an
octave up so the gesture survives a speaker that cannot reach the fundamental at
all (which is most phones), a very dark lowpass body (165 Hz) on a heavy echo
send, and one distant lowpass slap for the street answering back. No noise above
400 Hz anywhere.

The rules that generalize:

- **A layered sound is defined by what it leaves out.** List the bands the sound
  it sits under already occupies and stay out of them.
- **`holdMs` is what makes a tone read as PRESSURE rather than as another kick.**
  Every tone here falls to a tenth of its peak a quarter of the way through
  `durationMs`, so a long sub with no hold is a thump with a tail, not a wall.
- **Double a sub an octave up, detuned.** A 40 Hz sine is everything on
  headphones and nothing on a laptop; the octave carries the same gesture where
  the fundamental cannot go.
