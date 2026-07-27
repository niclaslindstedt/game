---
title: A catalog number is not always the number the game shows
date: 2026-07-27
---

"Grounded in truth" is easy to satisfy and still get wrong. Reading a value off
a compiled catalog feels like the honest move, and for an enemy's `hp` it is —
but a weapon's authored `damage` is NOT what a dropped copy swings for. The
engine halves every LOOTED weapon (`WEAPON.damageMult`), then moves it again by
the instance's item level, its make quality and the wielder's stats. Publishing
the catalog figure would have been correct against the YAML and wrong against
the game, which is the exact failure the rule exists to prevent.

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
