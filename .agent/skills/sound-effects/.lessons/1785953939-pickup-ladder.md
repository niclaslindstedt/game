---
title: The pickup ladder — make a family of pickups distinct by REGISTER, MATERIAL and GESTURE at once
date: 2026-08-05
---

Four loose pickups (ammo, medkit, repair, coins) had drifted into near-identical
soft blips — two of them still carrying the equipment flourish's description.
What separated them was varying three axes together, not one:

- **GESTURE** — every classic "pick up" is a RISING interval. A falling glide
  (ammo used to be square 520→390) reads as a discard, not an acquisition. Two
  notes butted end to end is enough; a three-note run is a flourish and too much
  for anything walked over dozens of times a minute.
- **REGISTER** — space the family a fourth apart so they can't be confused:
  ammo G4→C5 (392/523), medkit C5→E5 (523/659), repair G5→C6 (784/1047), coins
  B5→E6 (988/1319). B5→E6 with a sine glint two octaves up (2637) is THE coin
  couplet.
- **MATERIAL** — the noise layer says what the thing is made of, and two short
  grains read as an object where one burst reads as a hiss: bandpass 3100 + 2400
  = loose brass; bandpass 2600 + 3400 (q 1.8, 22 ms) = a metal latch; lowpass
  1200, 60 ms, no transient at all = canvas. The absence of a click is itself a
  signature — the medkit is the only one of the four without one, which is what
  makes it read as cloth.

**A PICKUP MUST STAY QUIETER THAN SPENDING THE THING.** Peak = the max SUM of
overlapping voice volumes, not the loudest single voice: the medkit's swell hit
0.078 against `medkitUsed`'s 0.085 purely because its two notes overlapped by
10 ms. Butting them end to end dropped it to 0.050 and cost nothing. Worth a
30-line script over the YAML (sweep the delayMs/durationMs intervals, sum the
volumes) — it catches what reading the file cannot, and the frequency ladder
falls out of it: coins 0.038 (most frequent) < ammo 0.046 < repair 0.048 <
medkit 0.050.

**The catalog is not the only copy.** `pwa/src/game/sfx/pickups.ts` is the legacy
imperative bank, and `tests/sound_catalog_test.ts` pins it byte-identical to the
YAML — so retuning a sound that still has a code branch means editing BOTH, and
splitting a shared branch (`drink || medkit`) when the two stop agreeing. A
sound with no branch there (ammo, gold — authored after the lift) is
catalog-only; don't add one, the bank is meant to shrink.
