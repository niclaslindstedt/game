---
title: The throughfare is a tiny pool on a vault-heavy blueprint, and changing which cells a set piece uses re-rolls the WHOLE map
date: 2026-09-20
scope: engine/game/mapgen/generate.ts
concepts: [set-pieces, elites, rng-stream, throughfare, verification]
---

Two things bite any change to where a set piece stands.

**The pool is smaller than it looks.** `throughfare` is the chambers minus the
landing, the objective, the boss's home, every cache cul-de-sac and every vault.
On GOODCO — three keyed rooms, a lot, a boss room and a trader's pitch out of
roughly nine cells — that came to TWO cells for a cast of five, and four elites
ended up shoulder to shoulder in one office. Print `throughfare.length` before
believing a spread is spreading. A cache cell is fine for an elite (what is
worth searching for is worth standing over); a VAULT never is, because the
keycard would be inside the room its own card opens.

**A set-piece change shifts the main rng stream.** An elite that takes an
authored stand costs no draw; one that falls through to the spread costs a
`pointIn`. So changing which elites get stands changes how many draws are spent
and every placement after it moves — on every venue, not just the one you edited.
`tests/content/generated_maps_test.ts` then goes red somewhere unrelated, and the
failure is usually a LATENT bug the re-roll walked into rather than a new one:
here, `buildPlacedItems` picked a random point in a cell with no regard for the
furniture and dropped Boot Hill's story item in the 13 px gutter behind a hotel.
Fix the latent bug; do not re-roll until the seeds happen to pass.
