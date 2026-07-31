---
title: Check the beat you rewrote actually REACHES a library page — coverage maps lie by omission
date: 2026-07-31
---

`assertFieldsCovered` fails the build on an authored FIELD no page renders, but
the coverage map's value is free prose and nothing checks that the page honours
it. `LEVEL_FIELDS.openingStrike` claimed "the roster's vanguard, and the opening
line" while `thoughtsOn()` only ever gathered `firstSightThoughts` /
`firstKillThoughts` — so the campaign's whole opening scene was published
nowhere, and the build was green about it.

After changing any line, grep the built library for it:

    cd pwa && npm run library && grep -rl "SOME DISTINCTIVE PHRASE" dist/library/

No hit means the tier-3 edit landed and the reader-facing tier didn't.
