---
title: When a line will not fit its beat, the beat is usually the thing to move — and a test, not a comment, is what keeps the two in step
date: 2026-08-09
scope: content/thoughts.yaml, pwa/src/game/drive-screen/
concepts: [barks, length-budget, drive, testing]
---

A bark that overruns the beat it plays over has two fixes and the obvious one is
usually wrong. Cutting the LINE spends the writing to protect a number; moving
the BEAT spends a number to protect the writing. On the drive's opening the
second was right twice running — the approach went five → eight → ten seconds
while `drive_out_welfare` did not lose a word — because the empty road exists to
carry those two pages and nothing else, so its length is an OUTPUT of the speech
rather than an input to it. Say that inversion out loud where the number lives
(`DRIVE.opening.cityPx`) or the next pass shortens the road to "tighten the
pacing" and puts the line back over the crowd.

TWO MECHANICAL TRAPS came with it. A page's hold must be priced off the
typewriter's OWN table (`pauseAfter`, `@ui/lib/typewriter.ts`) rather than off a
character count: a full stop is 260 ms and an ellipsis tail 440, so two lines of
equal length differ by most of a second and the line written with beats in it is
exactly the one that gets cut off. And the two halves of the constraint live in
different trees — the road in `engine/`, the page clock in the app — so only a
test can hold them together: `tests/drive_bark_test.ts` sums the pages against
`DRIVE.opening` and fails on a longer line OR a shorter road, which is a thing
no stage note can do.
