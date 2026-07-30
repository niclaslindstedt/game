---
title: A per-rank ladder is a reference hero PER RANK, not the authored slope times the rank
date: 2026-07-30
---

The arsenal's reference-hero rule ("would a player ever see this number") has a
sharper form the moment a catalog authors a CURVE rather than a value. The
talents section publishes what each of a talent's five ranks comes to, and the
tempting arithmetic — `chancePerRank × rank`, straight off
`content/talents.yaml` — is wrong on three shipped talents at once: CRIPPLING
SHOT's slope reaches 80% at rank 5 where the talent's own `chanceCap` holds a
real hero at 75%, a crit slope counts only on the tree's own weapon class, and
every output rides the developer TALENT POWER dial.

So the model asks the accessor that OWNS the rule, once per rank, with the
talent trained: `withTalent(id, rank, read)` in `pwa/scripts/library/catalogs.mjs`
mutates one reference state's `player.talents` and hands it to
`talentCrippling`/`talentFrostNova`/… — the very functions the run calls in a
fight. `tests/content/library_test.ts` pins the published table against a real
`createGame` hero with the rank spent, and asserts the cap really does bite,
which is exactly the case the slope arithmetic gets wrong.

Two traps that only a rank ladder has:

- **An accessor can answer at a rank where nothing happens.** EVASION's
  `talentEvasionBurstMult` returns the carrier's 1.35× whenever the burst window
  is open, but it is `talentEvasionBurstMs` that decides whether a dodge ever
  opens one — 0 below the mastery rank. Reading the multiplier alone prints
  1.35× against four ranks where the effect cannot occur. Ask both, and print an
  em dash rather than a zero: `1×` against a burst that can never fire is a
  smaller number telling a bigger lie.
- **A ceiling is worth stating only when the ladder reaches it.** Six of the
  shipped procs carry a `chanceCap`; four never come near it in five ranks. The
  model computes `reached` from the rank values and the prose prints the note
  only then — the same "ask the data" rule that stopped the powers section
  asserting a pool rule its own table denied.

If a talent's numbers arrive as an EFFECT BLOCK (the magic tree's conjurations
do — `orbitSpellBlock(state, rank)` returns the very shape `powerups.yaml`
authors), table them with the powers' own `EFFECT_BLOCKS` labels rather than a
second vocabulary. A ring's ORB SIZE is the same fact whether the ring was
picked up off a floor or conjured.
