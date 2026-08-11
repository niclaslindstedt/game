---
title: When unique-check disagrees with the content, the TESTS are the tie-breaker — and a "home" is a PLACE, not a (place × rung) cell
date: 2026-08-09
scope: scripts/unique-check.mjs, content/enemies/, content/items/
concepts: [uniques, drop-tables, checkers, set-farm, ci]
---

`scripts/unique-check.mjs` had been failing with 30 ERRORS ("wired to N boss/stall
homes") against shipped content for some time, because nothing in CI ran it. The
CONTENT was right and the CHECKER was stale — and the way to settle that quickly is
worth reusing.

**Arbitrate with the test suite, not with the checker's own comments.** A checker
comment is one author's belief; `tests/content/*_test.ts` is a green gate the whole
repo has been living under. Here `tests/content/uniques_test.ts` says in as many
words that "a unique's HOME is its PLACE — a boss, a world level, or a stall — not a
single rung", and `tests/content/sets_test.ts` requires each boss to drop its WHOLE
set — which is only expressible by listing several relics per rung and the same relic
across rungs. Both were passing. That settles it in two file reads, without reasoning
about which design is nicer.

**The design the checker had outgrown:** each boss now OWNS a set. Campaign rungs pay
a low-ilvl taste of it, endgame rungs open the whole kit — so a relic appears on
several of its boss's rungs BY DESIGN, and `maybeDropBossUnique` already discriminates
by rung on its own (`UNIQUE.dropChance × mlvl/ilvl`, so an early rung is a long shot).
Counting (boss × rung) cells read that farm as five duplicate homes. Fix: count
distinct PLACES (`boss:<id>` / `stall:<level>`), which still errors on the real bug —
two different bosses owning one relic.

Two neighbouring rules had rotted the same way and needed correcting rather than
deleting:

- **The Latin square is gone.** It picked ONE set slot per (boss, rung) cell with
  `??=`, which is arbitrary once a cell holds four. What survived is the half that
  still means something: across the five bosses, every rung must pay out every set
  slot. (It was reporting nightmare/jesus as "missing feet" purely because `??=` took
  the boss's weapon and never looked at its feet piece.)
- **The armor ladder must skip pieces the ilvl model prices INCOMPARABLY.** It already
  exempted `keeper`s for exactly this reason; SET pieces need the same exemption,
  because `weapon-ilvl.mjs` reads a unique's own `bonuses` and knows nothing about
  `content/sets.yaml`, so a green's computed ilvl omits the set bonuses that are its
  whole point (and a DEX/INT set is lighter than a melee set at equal ilvl by design).
  Also skip EQUAL-ilvl neighbours: the model calls them equal power, so an armor gap
  there is a bonus/armor MIX, not a step down. All four remaining WARNs were one of
  those two false positives.

**Wiring it in.** It now runs as a step of the `lint` job in
`.github/workflows/ci.yml`, right after `make lint` — deliberately NOT its own job,
because the checker reads the COMPILED catalogs and `make lint` has just built them
(a separate job would recompile the whole content tree to run a one-second script;
`AGENTS.md` forbids chaining a second rebuilding entry point). `make unique-check`
is the named target. Do NOT wire `item-forge.mjs check` instead: it exits 1 today on
27 pre-existing `weapon-stats --coverage --strict` warnings.

**Verify a checker's teeth before calling it done.** Green after an edit proves
nothing about whether the rule still catches anything. Prove each rule still fires:
inject a violation (wire one boss's relic onto another boss → the two-PLACES error),
and for a coverage rule, add a slot nothing pays out to the constant it iterates
(`SET_SLOTS`) and watch every rung warn. Both take a minute and both caught that the
new code paths were live.
