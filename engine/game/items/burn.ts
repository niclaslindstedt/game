// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DOES THIS BLOW LEAVE A BODY AT ALL — the question a weapon made of FIRE asks
// that no other weapon in the game has to.
//
// Its own leaf beside `edge.ts` and `execute.ts` for exactly the same reason: it
// is a rule over the catalogs and nothing else, so the hit path can read it
// without owning it and a test can ask it without building a run.
//
// A weapon with `burn` (see `WeaponDef.burn`) does not kill a thing, it CONSUMES
// it: every body it drops is burned up where it stood and leaves a smoking
// charred skeleton instead of a corpse. That picture already exists — it is what
// the screen-nuke does to everything inside its blast — and pointing an existing
// presentation at a new author is the cheapest way to make a new weapon legible
// the first time it is fired, exactly as ORBITAL DELIVERY inherits the meteors'
// ground shadow rather than drawing its own.
//
// THREE RULES HOLD IT UP:
//
//  0. IT IS PRESENTATION, AND ONLY PRESENTATION. Damage, reach, cadence, armor,
//     crit, xp and the drop roll are all untouched — a burn weapon is authored on
//     the ordinary damage-budget line like every other weapon and pays for its
//     cone in the ordinary way. The flag rides out on the `enemyKilled` event as
//     `incinerated` and the APP decides what to draw with it. That is what keeps
//     a gimmick weapon from needing a balance argument of its own.
//  1. IT IS NOT A NUKE, AND MUST NOT BE MISTAKEN FOR ONE. The blast's own two
//     companions on the hit funnel — `noNukeDrop` (a bomb's kills never chain
//     into more bombs) and `noMenace` (a bomb's output is exempt from the meter)
//     — are the BOMB's rules, not the fire's. A weapon kill is the hero's own
//     work: it pays loot, it heats the meter, and it may cough up a bomb like any
//     other kill. Only the picture is shared.
//  2. MELEE ONLY, because a burn is a thing that happens where the weapon is. A
//     flame is a cone the hero leans into a crowd, not something that travels —
//     and the shot paths carry no weapon identity to read this off anyway, so a
//     ranged def claiming it would author a promise nothing could keep. The item
//     schema refuses it rather than letting an author believe otherwise.
//
// The app's own MATURE CONTENT gate still has the last word: with the switch off
// `killPresentation` never returns the incinerate and the body falls back to the
// ordinary punt-and-topple, exactly as a censored screen-nuke does.

import { isWeaponDef, weaponDef } from "../defs/equipment.ts";

/**
 * Whether `defId`'s blows BURN — true for the flamethrowers and false for every
 * other weapon in the game. Unknown ids (a fixture, a retired base still sitting
 * in an old save) read as false, the plainest of the deaths.
 */
export function weaponBurns(defId: string): boolean {
  if (!isWeaponDef(defId)) return false;
  const def = weaponDef(defId);
  if (def.class !== "melee") return false;
  return def.burn === true;
}
