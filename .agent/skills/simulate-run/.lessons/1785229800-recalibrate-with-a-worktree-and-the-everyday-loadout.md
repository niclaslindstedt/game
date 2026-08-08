---
title: Recalibrating after a damage-rule change — pin the BEFORE side in a worktree, and read the everyday loadout
date: 2026-07-28
scope: scripts/simulate-run.mjs
concepts: [ab-testing, worktree, loadout]
---

Removing the looted-weapon damper / ilvl damage growth and rebuilding the
balance on mob health taught four things worth keeping.

## 1. Capture the BEFORE reading before you touch a file, and pin it in a worktree

The obvious trap is measuring only the after. The subtler one is measuring the
before by stashing: any re-measure then costs another stash cycle, and a
container restart mid-session loses the numbers entirely (it happened twice
here). Do this instead, once, at the very start:

```sh
git worktree add /tmp/<scratch>/before HEAD
cp -r src/generated /tmp/<scratch>/before/src/        # content is unchanged, so this is valid
ln -s "$PWD/node_modules" /tmp/<scratch>/before/node_modules
```

The `src/generated` copy is the trick that makes it cheap — an engine-only
change leaves the compiled catalogs byte-identical, so the worktree needs no
generator run. Now `cd before && node scripts/simulate-run.mjs …` gives a true
before reading at any moment, as many times as you want, with the same flags.
**Run the identical command on both sides** — a verdict is only comparable
against a verdict from the same difficulty set, `--max-minutes`, and seed.

## 2. `--verdict` is a DIFF, not a grade

The campaign verdict read `FAIL` after the change, which looks damning until
you run the before side and find it read `FAIL` too, on the same two checks.
The repo's baseline is not `PASS`. What matters is the direction of each
number:

```
                              before   after
blows-to-kill (mean)            13.7    12.5
bosses engaged but survived        5       4
DPS-on-curve rungs off          8/10    7/10
```

Never report a verdict's letter without its counterpart. A standing `FAIL` on
nightmare under-levelling will otherwise get re-diagnosed as a regression by
every future session.

## 3. Calibrate on `mob-hp-curve --no-unique --no-legendary --no-sets --no-artifact`

This is the instrument for "did hits-to-kill hold", and the `--no-*` flags are
not optional: with named tiers included the analytic sim equips a wildly
different weapon at each checkpoint and the per-level numbers swing 2–3× on
gear selection alone, which drowns the signal. On everyday magic/rare loot the
curve is stable enough to tune against, and it is also the loadout the horde is
actually calibrated for.

Read **campaign means per rung**, not per-level rows. Individual rows still
jump when auto-equip changes its mind (a `GRAVITY MAUL` era vs a `SEARCH BAR`
era); the mean over a rung is what tracks. Landing within ~±15% of baseline is
as tight as this instrument gets — chasing exact per-row parity is chasing
noise.

## 4. A global mob-hp change silently retunes the OPENING, because starters carry no roll

The one non-obvious coupling. `MENACE.mobHpBase` scales every monster, but the
things that scale the HERO — enhanced damage, affixes, make quality — only
exist on magic-or-better drops. A level-1 hero holds a white starter weapon, so
he eats the whole mob-hp increase with nothing to offset it.

The starter weapons and the built-in sidearm are **deliberately off the
damage-budget line** (`EXEMPT_BASES` in `weapon-budget.mjs`, and the exemption
list in `weapon-scatter.mjs`) precisely because the difficulty ladder is
calibrated on them. That makes them a hand-retuned knob, not a derived one:
when `mobHpBase` moves by ×N, move their authored `damage` by ×N too, or the
first minutes of every difficulty get N× harder while nothing else does.

```
blaster (src/game/defs/equipment.ts — engine machinery, not content)
content/items/regular/{fire_extinguisher,medieval_sword,combat_knife,brass_knuckles,stick}.yaml
```

The check that catches it: the `Lvl 1` row of each rung in `mob-hp-curve`.
Those rows should be unchanged by a pure rebalance. If they moved and the rest
did not, the starters were forgotten.

## Ordering that worked

1. Baseline: `mob-hp-curve` (with `--no-*`) + `simulate-run --verdict`, in the worktree.
2. Make the rule change; measure the same two.
3. Solve for the mob-side factor from the ratio of campaign means.
4. Apply it, retune the starters by the same factor, re-measure.
5. Only then run the test suite — a balance change breaks tests that assert
   absolute damage numbers, and fixing those before the numbers settle means
   fixing them twice.
