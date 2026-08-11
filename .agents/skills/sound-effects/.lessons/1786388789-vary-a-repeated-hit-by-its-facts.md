---
title: A hit that fires hundreds of times a run is varied by its FACTS, not by more takes — one bank per fact, layered
date: 2026-08-10
scope: content/sounds/, pwa/src/game/drive-screen/
concepts: [repetition, layering, variants, impacts, weight, speed, drive]
---

"It always sounds the same" is almost never solved by adding takes to the bank
that is repeating. Six takes played four hundred times a leg is one event with
dither on it, and the twelfth take costs another file to buy nothing.

What fixes it is asking what the event's own DATA already distinguishes, giving
each of those facts its own short layer, and playing the stack. On the road a
body hit had one fact (absorbed joules → shelf, hash → take) and now has four —
WHO (their weight picks the bank; what they were carrying adds a layer), HOW
HARD (the joules shelf, unchanged), HOW FAST (a whip-crack layer above a speed
fraction, a shove bank below another), and WHAT THE CAR DID ABOUT IT. That is
~30 short files giving hundreds of distinct combinations, where 30 flat takes
would have given 30.

Three rules the pass paid for:

- **Layer along the SPECTRUM, not the level.** Each layer must own a band the
  others leave free — the body in the mids, the crack above 2 kHz, the mass
  below 100 Hz, the car in the low mids — or the stack is mud rather than a
  bigger sound. Verify it: render each sound offline and print peak, length and
  the share of energy under 200 Hz. A ladder that climbs in level but not in
  low-end share is louder, not heavier.
- **A fact the ENERGY already folds in still needs its own layer.** Absorbed
  energy goes as mass × speed², so a heavy body at a crawl and a light one at
  speed land on the same rung of the joules ladder. If the two must not sound
  alike, speed cannot be read off the joules — it has to arrive separately (the
  app reads the car's own speed at drain time; weight rides on the event).
- **The layer with the longest tail needs a funnel.** The car's own chassis boom
  is the longest thing in the stack, and a blockade books six collisions on one
  tick; one gate in the pick function (min gap + a preempt step for a plainly
  bigger blow) is the same shape `sfx/cues.ts` and `drive-haptics.ts` already
  use, and a limit each call site reimplements is one somebody forgets.
