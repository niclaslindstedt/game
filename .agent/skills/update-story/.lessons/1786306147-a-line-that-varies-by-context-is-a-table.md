---
title: A line that varies by CONTEXT gets a table keyed on the context, never a branch in the event drain
date: 2026-08-09
scope: pwa/src/game/drive-screen/, content/thoughts.yaml
concepts: [thoughts, barks, drive, seams]
---

The drive raises three beats — `monologue`, `sight`, `atTheDoor` — and the app
names the thought each one speaks. When the road gained a second direction, the
tempting edit was `if (direction === -1)` at the three `say(...)` calls in
`drive-screen/loop.ts`. The right one was `drive-screen/voice.ts`: a
`Record<levelId, {monologue, sight, door}>` and one lookup, so the drain never
learns there is more than one leg and a third destination is one more row.

The same shape works for any beat whose WORDS depend on where it happened while
its TRIGGER does not. Keep the engine raising beats and the table naming lines;
the engine must never carry a thought id.

And when the second context is a MIRROR of the first, the strongest writing move
is often an ABSENCE rather than a new line: the trip home deliberately drops the
outbound leg's opinion of the crowd, and the missing page is the joke. Say so in
the YAML comment, or a later pass will "fix" the asymmetry.
