---
title: A far-away test failure is not automatically yours — stash the ONE file you changed and re-run before treating it as a bug
date: 2026-08-09
scope: tests/, engine/game/drive, engine/game/defs
concepts: [quality-gates, false-red, determinism, seeded-content, pre-existing-drift]
---

Lengthening the drive's opening (`DRIVE.opening.cityPx` 1500 → 2400, with
`coursePx` moving with it) turned `tests/engine/drive_ai_test.ts` red on a claim
about how much the traffic's speeds vary — a test with nothing to do with how
long the approach is. It looks like a regression and it was not one: the town's
block layout is seeded on `direction:coursePx:cityPx:block` (`town-plan.ts`), so
a change to either length re-seeds the whole town and every downstream draw. The
test was asking a p10/p90 ratio of about thirty samples — three vehicles at each
end — and it read 2.4 on the three seeds it was written against and 1.95 on the
three it got. The underlying spread had not moved at all (2.6 against 2.5, over
twelve seeds).

Two things worth carrying:

**Attribute before you fix.** `git stash push -- <the one file>` → re-run that
suite → `git stash pop` is about fifteen seconds and answers "is this mine"
outright. It is also how the same session found that BOTH `make drive-bench`
tables in `config.ts` were already stale on `main` — a straight line at full
throttle is documented as arriving 30/30 and measures 0/30 — which would
otherwise have been silently adopted as damage from the branch.

**A statistical test on seeded content is a latent false red.** Any suite that
takes a percentile, a mean or a ratio over whatever the generator happened to
lay down will eventually be re-seeded by an unrelated tuning change, and the
honest repair is a bigger sample rather than a lower bar — check the claim over
4× the seeds first, and only weaken the assertion if the claim genuinely moved.
