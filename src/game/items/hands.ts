// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE HERO'S TWO ARMS CAN HOLD AT ONCE — the two-handed rule, and the
// weapon-slot's never-empty contract it leans on.
//
// A hero has a weapon hand and a SECOND ARM (`EquipSlot.offhand`), and every
// build spends the second arm on one of three things: a SHIELD (armor, behind
// a STRENGTH floor), a BAG (cells, and the light build's stats), or NOTHING,
// because the weapon in the first hand needs both (`WeaponDef.twoHanded`). The
// whole point is that they are exclusive — a greatsword that could be swung
// from behind a tower shield would make the choice free, and a choice that is
// free is not one.
//
// So the conflict has to be resolved somewhere, and it is resolved HERE rather
// than at each of the half-dozen doors a piece can come through (the bag's tap,
// a drag onto a named slot, the auto-equip sweep, the pickup sweep, a shop
// purchase, a loadout arriving from the last level). Each of those calls
// `freeHandsFor` and gets one answer: either the hands are clear and the equip
// may proceed, or the bag has nowhere to put what would have to come off and
// the equip is refused whole.
//
// The awkward half is that the WEAPON SLOT IS NEVER EMPTY — the character
// always fights with something. So taking a two-hander off is not "remove it",
// it is "replace it", which needs the same best-remaining-weapon pick the
// on-break swap makes. That pick (`takeBestBagWeapon`) and the last-resort
// sidearm (`drawSidearm`) therefore live here rather than in durability.ts,
// which is downstream of the bag and cannot be reached from it.

import { isWeaponDef, SIDEARM_DEF_ID, weaponDef } from "../defs/equipment.ts";
import type { Equipment, GameState } from "../types/index.ts";
import { canEquip } from "./requirements.ts";
import { isOffhandItem } from "./slots.ts";
import { weaponScore } from "./weapon-math.ts";

/**
 * Does this piece claim BOTH arms? True only for a weapon whose def carries
 * `twoHanded` — the greatswords, mauls, polearms, rifles, bows and staves.
 * Reads the FROZEN def when the instance carries one (a re-homed save, a
 * unique's own snapshot), so a piece minted before a catalog change keeps
 * answering the way it was minted.
 */
export function isTwoHandedWeapon(
  piece: Equipment | null | undefined,
): boolean {
  if (!piece || piece.slot !== "weapon") return false;
  const frozen = piece.def;
  if (frozen && "twoHanded" in frozen) return frozen.twoHanded === true;
  if (!isWeaponDef(piece.defId)) return false;
  return weaponDef(piece.defId).twoHanded === true;
}

/**
 * Pull the best WIELDABLE weapon out of the bag and return it (removing it from
 * its cell), or null when the bag holds none the hero can draw. "Wieldable"
 * routes through `canEquip`, so an under-leveled, under-statted, or BROKEN
 * (durability 0) bag weapon is passed over — a broken spare stays put until a
 * repair kit wakes it. Ranked by the build-aware `weaponScore` so a STRENGTH
 * hero draws the heavier melee and an INTELLIGENCE hero the stronger spell.
 *
 * `skipTwoHanded` is what the offhand equip asks for: the arm it is about to
 * fill must stay free, so another greatsword is not a legal answer.
 */
export function takeBestBagWeapon(
  state: GameState,
  opts: { skipTwoHanded?: boolean } = {},
): Equipment | null {
  const inv = state.players[0].inventory;
  let bestIndex = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < inv.length; i++) {
    const item = inv[i];
    if (!item || item.slot !== "weapon") continue;
    if (opts.skipTwoHanded && isTwoHandedWeapon(item)) continue;
    if (!canEquip(state, item)) continue;
    const score = weaponScore(state, item);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) return null;
  const weapon = inv[bestIndex] as Equipment;
  inv[bestIndex] = null;
  return weapon;
}

/** A fresh, unbreakable sidearm — the last-resort weapon drawn when the bag
 * holds nothing wieldable, so the weapon slot honors its never-empty contract. */
export function drawSidearm(state: GameState): Equipment {
  return {
    id: state.nextId++,
    defId: SIDEARM_DEF_ID,
    slot: "weapon",
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
}

/** The first free bag cell, ignoring `except` (the cell the incoming piece is
 * being lifted out of — it is about to be free, but is not yet). */
function freeCell(state: GameState, except: number): number {
  const inv = state.players[0].inventory;
  for (let i = 0; i < inv.length; i++) {
    if (i !== except && inv[i] === null) return i;
  }
  return -1;
}

/**
 * Clear the arms `piece` needs, IN PLACE, and say whether it worked.
 *
 * Two conflicts, and only two:
 *
 *  • A TWO-HANDED weapon coming in with something in the second arm — the
 *    shield or bag is banked to the bag.
 *  • A SHIELD or BAG coming in while a two-hander is held — the two-hander is
 *    banked and the hero draws the best one-handed weapon left to him, falling
 *    back to the sidearm. He is never left empty-handed.
 *
 * Returns FALSE, having changed nothing, when the bag has no free cell for what
 * would have to come off; every caller treats that as "the equip did not
 * happen", which is the same answer a full bag already gives everywhere else.
 * `cell` is the bag cell the incoming piece occupies (−1 when it is arriving
 * from the ground or a shop), which is excluded from the free-cell hunt: it is
 * about to receive whatever the slot displaces.
 *
 * Note the deliberate asymmetry with `unequipToInventory`: banking a bag can
 * SHRINK the carry, but `syncInventoryCapacity` is grow-only, so nothing is
 * ever stranded by it.
 */
export function freeHandsFor(
  state: GameState,
  piece: Equipment,
  cell: number,
): boolean {
  const player = state.players[0];
  const equipment = player.equipment;
  if (isTwoHandedWeapon(piece)) {
    const held = equipment.offhand;
    if (!held) return true;
    const free = freeCell(state, cell);
    if (free < 0) return false;
    player.inventory[free] = held;
    equipment.offhand = null;
    return true;
  }
  if (isOffhandItem(piece.slot) && isTwoHandedWeapon(equipment.weapon)) {
    const free = freeCell(state, cell);
    if (free < 0) return false;
    const shed = equipment.weapon;
    // Pick the replacement BEFORE the two-hander is banked, so it can't pick
    // the very weapon it is replacing — and never another two-hander, which
    // would take the arm straight back off him.
    const replacement =
      takeBestBagWeapon(state, { skipTwoHanded: true }) ?? drawSidearm(state);
    player.inventory[free] = shed;
    equipment.weapon = replacement;
    player.weaponCooldownMs = 0;
    return true;
  }
  return true;
}
