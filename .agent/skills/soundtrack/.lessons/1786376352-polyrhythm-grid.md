---
title: A drum on a cycle that does not divide the bar is written as a 64-step (4-bar) grid, not as an N-step loop
date: 2026-08-10
scope: content/songs/
concepts: [drums, tracker, authoring, polyrhythm]
---

"A clack every 3 sixteenths" and "a boom every 6" are two of the cheapest
character decisions available — the pattern lands somewhere new in every bar and
the ear cannot settle. But a voice's step count must DIVIDE its pattern length,
and 3, 6 and 48 divide none of the 8-bar (128-step) patterns in this catalogue.

Write the whole cycle out as FOUR BARS — 64 steps — and let it restart there.
64 divides every pattern length in use (4-bar intros, 8-bar sections), the
cycle audibly walks across bars 1–3, and bar 4 lands back on the downbeat, which
reads as intent rather than as a wrap. `hq_lockdown`'s copier (every 3) and
`red_dust`'s tithe (every 6) are both authored exactly this way.

Do NOT try to compute the true cycle length and use that — 48 and 96 both fail
the divisibility check, and the build error is at compile time so it is cheap to
discover but tedious to unpick.
