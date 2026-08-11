---
title: Elite/resident dialogue must stay shorter than every boss scene, or story_test fails
date: 2026-07-12
scope: content/enemies/
concepts: [dialogue, length-budget, testing]
---

`tests/content/story_test.ts` asserts "bosses get longer scenes than any elite":
the SHORTEST boss `dialogue.length` must exceed the LONGEST elite's. Bunker
residents and rift APPARITIONS both count as elites, and `{ hero: [...] }` reply
pages count as pages.

The shipped budget is deliberately uniform: **elites and apparitions get 3 pages
(mob, ME, mob-with-the-reveal), bosses get 5** — except the three TRUST ME BRO
controllers at 4, which is what sets the floor the elites have to stay under. So
an elite may not grow past 3 without lifting every boss with it, and a new page
on an elite is almost always a sign the reveal wants folding into the page it
already has.
