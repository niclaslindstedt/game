---
title: Elite/resident dialogue must stay shorter than every boss scene, or story_test fails
date: 2026-07-12
---

`tests/content/story_test.ts` asserts "bosses get longer scenes than any elite":
the SHORTEST boss `dialogue.length` must exceed the LONGEST elite's. Bunker
residents count as elites. When you add pages to an elite/boss arrival scene
(a reveal beat, an Ada-trail slip), check the page budget: today the shortest
boss scene is 7 pages, so every elite must stay at 6 or fewer. Fold new lines
into an existing page rather than adding a page when you're near the cap —
e.g. give DEPARDIEU his accidental-honesty line inside the avalanche page, not
as a new one. Count `{ hero: [...] }` reply pages too; they're pages.
