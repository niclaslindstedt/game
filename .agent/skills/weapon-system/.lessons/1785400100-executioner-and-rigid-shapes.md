---
title: A weapon whose damage is irrelevant still owes the budget a number
date: 2026-07-30
---

Authoring the AFUERA CHAINSAW (an EXECUTIONER: the blow is priced in the
VICTIM's own healthbars, so its `damage` is only ever seen by a boss) turned up
four things worth keeping.

**The budget still holds it, and that is the feature.** The temptation is to
exempt a weapon whose damage almost never applies. Don't: the boss case is
real, and a checker that can be opted out of stops being a checker. Forge the
number on the budget line like any other weapon and let `weapon-budget --strict`
own it — the def then cannot lie about what it does to the one thing it cannot
execute.

**`item-forge` does not know about `twoHanded`, and the budget does.** The forge
prints the ONE-handed figure; `weapon-budget.mjs` applies `TWO_HANDED_PREMIUM`
(1.4) on top. Don't multiply by hand and don't trust the forge's number for a
two-hander — author something, run `--strict`, and take the range it prints as
the answer. The same goes for a weapon that is in no level pool: the budget
classifies it as a SPECIAL (×1.15), which the forge only applies with
`--special`. Two rounds of "author, ask the checker, correct" is faster than
reasoning about which multipliers stack.

**A weapon whose SHAPE does not scale must be PRICED unscaled.**
`meleeBudgetTargets` estimates the crowd a weapon reaches at the realistic STR/
INT a hero has by its `levelReq` — right for a swung blade, wrong for a tool
whose reach and arc are fixed (`WeaponDef.rigid`). Left alone it charges a rigid
weapon for a cleave it can never have and hands back a smaller per-hit blow to
pay for it. `rigid` therefore has to be honoured in THREE places, not one:
`weaponRangeFor`, `weaponSweepHalfAngle`, and `meleeBudgetTargets`. Miss the
third and every check still passes while the weapon is quietly underpowered.

**Durability spent per BODY needs the cone capped by what is left.** Making an
executioner's durability a body count is two edits (`wearEquippedWeapon(state,
n)` and counting kills in `meleeSweep`), but a swing with one tooth left will
happily cleave three bodies and the weapon outlives its own promise by however
wide the last swing landed. Cap the sweep's `maxTargets` by the remaining
durability in `stepWeapon` — otherwise "it takes exactly twenty" is only true on
average, which is nothing to build a gimmick weapon on.

**Verify the count in the RUNNING game, not just in a unit test.** A playtest
scenario (`--scenario '{"weapon":"…","spawns":[…]}'`) polled for
`equipment.weapon.durability` alongside `stats.kills` shows the 1:1 relationship
frame by frame — the cheapest possible proof that the rule survives the real
step pipeline, the talents, and the accuracy rolls. For a LOOK rather than a
count, clip the screenshot to a small box around the screen CENTRE: the hero is
always at the middle of the frame, so that is a zoom on him without any
coordinate maths, and set `window.__timeScale(0.12)` only AFTER he has reached
the crowd (slowing the approach as well just times the wait out).

**REACH and CONTACT are two different questions, and a weapon can want both.**
An execution that applies to everything inside the weapon's cone is a lawnmower;
one that applies only to a body actually TOUCHING the hero is a horror to use,
which is the point. Keep the cone (who is STRUCK, for ordinary damage) and the
touch test (who is TAKEN) as separate rules — then a wide arc can be authored
freely, because widening it no longer widens what the weapon deletes.

**An OVERSIZED weapon is authored LONG, never scaled.** Drawing a 12×12 icon at
2× puts one sprite on a coarser pixel grid than everything around it, which
reads as an art bug rather than as a big object; author the sprite bigger
instead (the chainsaw is 16×12). Two things then have to give: `.inv-item-icon`
needs `object-fit: contain` or the square CSS box stretches it, and the PORTRAIT
canvas has to widen — but measure it PER DOLL (`dollSizeFor`) rather than
growing the shared `DOLL_WIDTH`, which would shrink the hero inside every
portrait box in the game to make room for a weapon almost nobody carries. Grow
it sideways only: the held icon is anchored by its grip and drawn upward, so a
TALLER one would need the body pushed down the canvas and the hero would move.
