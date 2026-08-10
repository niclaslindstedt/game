---
title: A score's faults are STRUCTURAL and invisible in YAML — engrave it (`make sheet`) before judging it, and read the analyser row for the mix
date: 2026-08-10
scope: content/music/, scripts/asset-tools/notation.mjs, scripts/asset-tools/spectrum.mjs
concepts: [music, tracker, review, spectrum, arrangement, notation]
---

Reading a track's YAML tells you what is CORRECT — the bars are the right
length, the chord matches the comment, the loop is the right duration. It tells
you almost nothing about whether the music is any good, because every question
worth asking is about a relationship: between bar 3 and bar 40, or between two
voices sounding at once. `make sheet ARGS="<id> --pattern=b"` answers those in a
glance and the YAML answers none of them.

Three faults found on the SHIPPED catalogue the first time the sheet existed,
none of which had ever been noticed by reading the files or by listening:

- `hq_lockdown`'s A section never breathes — 48 onsets over 8 bars, largest gap
  one beat. On the page it is a solid hedge; in the YAML it is eight ordinary
  lines. A phrase with nowhere to end cannot be a hook.
- `hq_lockdown`'s `riff` (G4–C#5) lies entirely INSIDE its `lead`'s range
  (D4–F5). Two staves at the same height is instant; two lists of tokens is not.
- `overdue`'s `pulse` and `bass` overlap by ten semitones in every section.

And one fact about the INSTRUMENT that the analyser row made obvious and that
changes how to write for it: **nothing in this sequencer sustains.** `tone()`
decays exponentially to a ten-thousandth of its peak across the note's whole
gated length, so a whole note is a decay, not a pad — `overdue`'s breakdown
"pedal" is dead two-thirds of the way through every bar, which the loudness
curve draws as a sawtooth. If a bed is wanted, re-strike it; `ChiptuneInstrument`
has no `holdMs` (the SFX voice grew one, the music voice did not).

Reading the image is not free of traps either: a whole track engraves thousands
of pixels tall and is illegible once downscaled to be read, so always work
`--pattern` at a time, and reach for `--bars=2 --scale=3` when checking
something small like whether a beam group is right.
