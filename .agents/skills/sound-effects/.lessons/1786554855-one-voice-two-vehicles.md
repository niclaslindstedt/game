---
title: Two vehicles that are one vehicle in the fiction get ONE voice with the crank as its only parameter
date: 2026-08-12
scope: pwa/src/game/sfx/, pwa/src/game/drive-screen/
concepts: [engine, grains, machinery, drive, reuse]
---

The driving minigame's wagon and the car the hero drives around a level are the
same car in the story and were two unrelated noises in the mix: a four-layer bed
voiced off a real drivetrain, and a triangle plus a hiss with frequencies picked
by ear. Nobody notices the difference as a bug — they just never recognise the
car.

The fix is to make the LAYERS shared (`sfx/engine-bed.ts`) and the CRANK the only
thing either caller supplies. Three things that fell out of doing it and are
worth knowing before starting:

- **The grain shape is ratios, not numbers** — see the
  `continuous-bed-needs-a-hold` lesson. Two callers on different cue rates is the
  case that forces this.
- **"How hard it is working" and "how fast the air is going past" are two
  inputs, not one.** On a motorway they are the same fraction, so the road got
  away with one; a car at full throttle at walking pace does not, and handing the
  wind layer a throttle gives a garage the roar of 170 mph.
- **A layer with a THRESHOLD is how a voice narrows itself.** The bed only puts
  the exhaust's sawtooth on past a third of the way up a gear, so the slow
  reading simply never reaches it. That is better than a flag saying "no exhaust
  here" — one rule, two outcomes.

Put the shared voice in `sfx/` and keep it import-free of `@game/core` (no module
in the sound bank has that edge — `sfx/listener.ts` has the reason). Numbers that
are really the ENGINE's get copied in and pinned by a drift test
(`tests/content/car_engine_test.ts`), the same arrangement `server/wire/frames.ts`
uses. And prove the untouched caller is BYTE-IDENTICAL after the extraction:
record both implementations through a stub synth over the whole input range and
`expect(a).toEqual(b)`. It is ten minutes and it is the only thing that makes
"this refactor changed nothing for the road" a fact.
