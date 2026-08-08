// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DOES THIS BLOW KILL BY DAMAGE, OR DOES IT SIMPLY TAKE THE BODY — the question
// an EXECUTIONER asks that no other weapon in the game has to.
//
// Its own leaf beside `edge.ts` for exactly the same reason: it is a rule over
// the catalogs and nothing else, so the hit path can read it without owning it
// and a test can ask it without building a run.
//
// A weapon with `execute` (see `WeaponDef.execute`) does not deal its authored
// `damage` to anything it can take. The blow is priced in the VICTIM'S OWN
// HEALTH — `bars` × whatever that body was holding — so it kills a fresh minion
// and a leveled one identically, on the first rung and on the last. That is the
// whole gimmick: nothing about the horde's numbers is an answer to it.
//
// FOUR RULES HOLD IT UP, and each is the reason it can exist at all:
//
//  0. IT ONLY TAKES WHAT IT IS TOUCHING. An execution is not something that
//     happens across a room, it is something that happens to a body pressed
//     against the hero — so `contactRange` is the bar's own reach, and anything
//     the swing catches beyond it takes the weapon's ORDINARY rolled blow like
//     any other weapon's cleave would. That is what makes the thing a horror to
//     use rather than a lawnmower: to take a body you have to be inside its
//     reach, in a crowd, with a tool that only kills what it can touch.
//  1. A BOSS IS IMMUNE. It eats the weapon's ordinary rolled damage instead —
//     which is why an executioner is still authored on the damage-budget line
//     like every other weapon, and why one can never delete the campaign's
//     spine. The rule is the same shape the gore already takes (a boss never
//     comes apart either): a boss is a set piece, not a body.
//  2. IT IS NOT DAMAGE, SO ARMOR AND CRIT DO NOT APPLY. Mob armor shaves a
//     physical blow by up to half at depth, which would quietly drop the blow
//     under the app's burst ladder on exactly the rungs the weapon is meant
//     for; a crit multiplying an already-certain kill means nothing. The hit
//     funnel passes both by when it is handed `executeBars` (see `hitEnemy`).
//     The hero's own MISS and the foe's DODGE still stand — an execution is a
//     blow that has to land, and DEXTERITY still says whether it did.
//
//     It is also priced against the body's FULL health rather than what is left
//     of it. The gore ladder reads the OVERKILL (the health spent past zero —
//     `game-screen/overkill.ts`), so a body already down to a sliver spends
//     almost none of an execution getting to zero and nearly all of it past —
//     which is right, and which is why `bars` must clear that ladder with a
//     whole bar to spare for the full-health case. A fixed, legible thing done
//     to a body must not quietly become a plain corpse because the hero shot it
//     first.
//  3. THE PRICE IS ALREADY IN THE GAME. A blow at several times a body's health
//     is overkill, and `overkillEfficiency` already cuts the xp and the drop
//     roll by exactly that ratio. So an executioner pays for itself out of the
//     toll the game levies on every one-shot, and this module adds no second
//     economy of its own.

import { PLAYER } from "../config/index.ts";
import type { EnemyDef } from "../defs/enemies/types.ts";
import { isWeaponDef, weaponDef } from "../defs/equipment.ts";

/**
 * The healthbars `defId`'s blow lands at, or undefined for every ordinary
 * weapon in the game (which is all but one of them). Melee only: a shot, a
 * bolt and a bomb travel, and a thing that travels is caught by armor.
 */
export function weaponExecuteBars(defId: string): number | undefined {
  if (!isWeaponDef(defId)) return undefined;
  const def = weaponDef(defId);
  if (def.class !== "melee") return undefined;
  return def.execute?.bars;
}

/**
 * Whether an execution may take THIS KIND of body. A boss never — see the
 * header — and everything else always: a minion, an elite, a summoned add and a
 * structure all come apart the same way in the teeth of one.
 */
export function canExecute(def: EnemyDef): boolean {
  return def.role !== "boss";
}

/**
 * How close a body has to be for an executioner to TAKE it rather than merely
 * hit it — the two collision radii touching, plus a hair of slack so a body
 * grinding against the hero isn't spared by a rounding error.
 *
 * Deliberately NOT the weapon's `range`: the weapon reaches as far as it
 * reaches (that is who the swing HITS), and the execution is the strictly
 * smaller thing that happens where the teeth actually meet a body. Keeping them
 * separate is what lets the saw be authored with a wide arc — it can shred a
 * whole press of bodies leaning on the hero without becoming a weapon that
 * deletes everything inside a 30px disc from a step away.
 */
export function contactRange(enemyRadius: number): number {
  return PLAYER.radius + enemyRadius + CONTACT_SLACK;
}

/** The hair of slack on the touch test (world px). Small on purpose: a couple
 * of pixels covers the gap a mob's own push-out leaves between it and the hero,
 * and nothing more. */
const CONTACT_SLACK = 3;
