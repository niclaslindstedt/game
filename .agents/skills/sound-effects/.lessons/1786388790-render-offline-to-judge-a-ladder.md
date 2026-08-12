---
title: You cannot hear a sound in a headless session — render the bank offline and read the ladder as numbers
date: 2026-08-10
scope: content/sounds/, pwa/src/game/sfx/
concepts: [verification, mixing, headless, ladder, grains]
---

The skill's iteration cycle ends at "audition in a real browser", which a
headless or remote session cannot do — and "it compiles and the ids resolve" is
not a check on whether a bank actually got heavier.

A crude offline render is enough to judge a LADDER, and takes ten minutes to
write: walk each compiled def's voices, synthesize tone (exponential glide,
exponential decay) and noise into a Float32Array at 22 kHz, approximate the
biquad with a one-pole, then print peak, RMS, total length and the share of
energy under 200 Hz. That catches every mistake that matters at this
granularity — a shelf that is louder instead of heavier, a "layer" that is
actually the loudest thing in the stack, a new take that is an outlier against
its own siblings, a volume typo.

**MEASURING A BED needs two adjustments, and without them the numbers lie.**
Take the CLATTER out first — a 13 ms tick inside a 20 ms window swamps every
reading, and an "engine wobble" of 4.5 dB turned out to be entirely the ticks
(0.11 dB with them removed). And window on the GRAIN PERIOD, stepped a quarter
of it at a time, because that is the rate a gap would appear at. Do not chase
the absolute RMS of a summed bed: grains restart their oscillator phase, so
consecutive grains interfere coherently or not depending on whether the cadence
happens to be a whole number of periods, and the total swings several dB with
pitch for reasons the ear does not hear as level. Read the LAYER TABLE instead
— frequency and volume per voice per input — which is unambiguous and is what
actually has to be monotonic.

It does NOT replace listening (nothing here judges whether a sound is GOOD), so
say so in the PR: the ladder was verified numerically, the character was not.
