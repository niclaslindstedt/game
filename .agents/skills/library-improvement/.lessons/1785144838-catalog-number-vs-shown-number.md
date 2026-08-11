---
title: A catalog number is not always the number the game shows
date: 2026-07-27
scope: pwa/scripts/library/
concepts: [numbers, accuracy, catalogs]
---

"Grounded in truth" is easy to satisfy and still get wrong. Reading a value off
a compiled catalog feels like the honest move, and for an enemy's `hp` it is —
but a weapon's authored `damage` is NOT what a dropped copy swings for. At the
time the engine halved every LOOTED weapon and moved it again by the instance's
item level, its make quality and the wielder's stats. Publishing the catalog
figure would have been correct against the YAML and wrong against the game,
which is the exact failure the rule exists to prevent.

The test to apply to any number before it reaches a page is not "did I read this
from a catalog" but **"would a player ever see this number"**. When the answer is
no, find the surface that shows the real one and call ITS functions.

For the arsenal that meant a REFERENCE HERO: `createGame(1, <first level>)`, whose
stats are all 0 on a fresh run, so `weaponDamageRange` / `weaponDps` /
`armorValueOf` return the piece itself with nothing of the wielder in it — the
item card's own figures, comparable across the whole catalog. The one exception
has to be modelled too: the built-in sidearm is minted UNBREAKABLE, and being
unbreakable is exactly what exempts it from the damage cut, so describing it as
an ordinary drop quoted a blaster nobody is ever handed.

Watch for the same trap wherever a config knob sits between an authored value
and the player: a global multiplier, an ilvl growth term, a difficulty scalar.

**UPDATE (2026-07-28):** the halving and the ilvl growth term are both gone —
weapon damage and cadence are now the catalog's verbatim, and the game's
pushback is tuned on mob health instead (`MENACE.mobHpBase`). The LESSON is
unchanged and still load-bearing: make quality and the wielder's stats still sit
between the catalog and the card, so keep calling the card's own functions
against the reference hero. That discipline is exactly why this rule change cost
the library nothing — no page had hardcoded the old halving.
