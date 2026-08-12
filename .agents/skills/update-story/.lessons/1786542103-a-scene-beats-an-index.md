---
title: A road line keyed on a NAMED case beats one keyed on an index — the compiler checks the first and nothing checks the second
date: 2026-08-12
scope: pwa/src/game/drive-screen/, engine/game/drive/
concepts: [drive, placards, barks, seams, testing]
---

The drive's two older voices (`GLUED_BARKS`, `CROWD_THOUGHTS`) are held together
by a COUNT in `engine/` and a LIST in `pwa/`: the sim hands out an index it got
from the count, and a list that drifts shorter silently stops using its tail with
every check green. `tests/content/drive_words_test.ts` exists almost entirely to
paper over that.

When the road gained a third voice — the BYSTANDERS who shout about a collision —
the seam was drawn the other way and it is strictly better: the engine names a
CASE (`WitnessScene`, a string union: `woman`, `wheelchair`, `heavy`, `torn`,
`fleeing`…) and hands a hashed 0→1 `roll`; the app answers with
`Record<WitnessScene, readonly string[]>` and picks with the roll. The compiler
refuses a case nobody wrote lines for, the app owns every length, and there is no
count to keep in step at all. Reach for this shape for any new road words.

Two things that still bite and are not about the seam:

- A LINE PICKED AT THE FAR EDGE OF THE READING WINDOW HAS UNDER 0.3 s. Reactions
  are two-to-six words for that reason, where thoughts get five-to-eight — a
  thought floats over a body the car closes on for most of a second, a reaction
  is raised at the moment of the blow on somebody 250 px up the road. The word
  budget is a function of WHEN the line is raised, not of which list it is in.
- THE FLOOR ON WORD COUNT MUST NOT BE TWO. The best reaction in the set is a
  single drawn-out noise, and a word-count floor copied from the thoughts test
  cuts exactly that one. Assert non-empty instead.

And the register ceiling the shipped campaign actually holds is JESUS / GOD /
HELL (`docs/manuscript.md` is full of them) and no s-word or f-word anywhere.
A request for a "SHIIIIETTT"-style shout is served by stretching a word already
in the register rather than by raising it — that is a decision for the user, not
for the pass.
