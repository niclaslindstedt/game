---
title: Continuous machine loops = cadenced sim events + overlapping grains
date: 2026-08-01
---

The synth has no looping voice, but a running engine (or any machine hum)
works as the stampede rumble does: the SIMULATION fires a cadence event every
N ms (`carEngine` every 210 ms, cadence state on the machine itself so it is
deterministic), and the app answers each with a grain a touch LONGER than the
cadence (240 ms) so successive grains overlap into a seamless loop. Carry an
`intensity` on the event and scale pitch AND volume with it — that is how
"driving raises the engine sound" costs nothing new.

The idle putter recipe: triangle 55→48 Hz (detune 12) at 0.028 vol under
lowpass-220 noise at 0.012; intensity adds ~+70 Hz, +0.03 vol, and opens the
filter to ~740 Hz at full throttle. A key-turn start is authored as a static
event sound (bandpass-1100 crank whirr + three square 110→90 coughs 130 ms
apart, then a sawtooth 36→62 swell with `attackMs: 60` as the catch).
