---
title: You cannot hear a sound in a headless session — render the bank offline and read the ladder as numbers
date: 2026-08-10
scope: content/sounds/
concepts: [verification, mixing, headless, ladder]
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

It does NOT replace listening (nothing here judges whether a sound is GOOD), so
say so in the PR: the ladder was verified numerically, the character was not.
