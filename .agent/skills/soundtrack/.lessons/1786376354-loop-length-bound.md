---
title: The 100–145 s loop bound is settled by the ORDER, not the tempo — `song-import` prints the duration, so read that line before engraving
date: 2026-08-10
scope: content/songs/
concepts: [tracker, authoring, tests, arrangement]
---

`tests/chiptune_test.ts` refuses a loop outside 100–145 s, and the section
lengths that feel right (4-bar intro, 8-bar everything else) put a fast score
UNDER the floor and a slow one OVER the ceiling. NO NORTH first compiled at
88 bpm × 56 bars = 153 s; AN HOUR BEHIND at 176 bpm × 60 bars = 82 s.

`node scripts/song-import.mjs <file>` prints `N bars ≈ Ns` on every compile.
Read it before doing anything else — it is the cheapest possible check and it
is right there.

Fix it by ADDING OR REMOVING AN ENTRY FROM `order`, not by moving the tempo. The
tempo is a decision about the piece; the order is arithmetic. One repeat of an
8-bar section is ±8 bars, which at any tempo in use is 10–20 s — enough to land
inside the bound in one edit, and the loop is still longer than the pattern list
so the shape guard stays satisfied.
