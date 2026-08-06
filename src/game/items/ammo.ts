// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AMMUNITION: the pouch a RANGED weapon draws from, the trigger-pull spend,
// the banking of a found box (with its overflow remainder), and the APPETITE
// the drop ladder asks before minting one — how stocked the pouch is against
// how badly the weapon in hand wants that kind.
//
// Everything that touches `Player.ammo` goes through here. The record itself
// is a bare partial map and the rules that make it a game — the per-kind cap,
// the remainder a nearly-full pouch leaves behind, "can this weapon fire" —
// have to live in exactly one place or they will disagree.

import { clamp01 } from "@game/lib/vec.ts";
import { AMMO, AMMO_KINDS, AMMO_TYPES } from "../config/index.ts";
import { isWeaponDef, SIDEARM_DEF_ID, weaponDef } from "../defs/equipment.ts";
import type { AmmoType, Equipment, GameState, Player } from "../types/index.ts";
import { desperationRamp } from "./mercy.ts";

/**
 * WHAT THIS WEAPON EATS, or undefined for one that eats nothing — the single
 * question every ammunition rule starts from. Melee and magic weapons answer
 * undefined and are unaffected by the whole system; a ranged weapon answers
 * its kind.
 *
 * Reads the CATALOG def rather than the instance's frozen birth copy: an ammo
 * kind is a rule about the weapon rather than a rolled property of the copy,
 * so a catalog change re-aims an old find instead of stranding it on a kind
 * nothing drops any more.
 */
export function weaponAmmoType(piece: Equipment): AmmoType | undefined {
  // Anything that is not a weapon eats nothing, and asking the WEAPON catalog
  // about a charm would throw — this runs over whole bags (`ammoKindFor`), and
  // a bag is mostly armor.
  if (!isWeaponDef(piece.defId)) return undefined;
  return weaponDef(piece.defId).ammo;
}

/** How many rounds of `type` the hero is carrying (an untouched kind reads 0). */
export function ammoCount(player: Player, type: AmmoType): number {
  return player.ammo[type] ?? 0;
}

/**
 * How many rounds the weapon in `piece` has left to fire — its pouch stack, or
 * `Infinity` for a weapon that eats nothing. The number the HUD's gauge and
 * every "can he still fight" read go through, so a melee weapon never has to
 * be special-cased at the call site.
 */
export function weaponAmmoLeft(player: Player, piece: Equipment): number {
  const type = weaponAmmoType(piece);
  return type === undefined ? Infinity : ammoCount(player, type);
}

/** Whether this weapon can fire right now: it eats nothing, or its stack has
 * at least one round left. The gate `stepWeapon` checks before every pull. */
export function hasAmmoFor(player: Player, piece: Equipment): boolean {
  return weaponAmmoLeft(player, piece) > 0;
}

/**
 * Spend ONE round for a trigger pull. Returns false — and spends nothing —
 * when the stack is empty, which is what stays the shot; a weapon that eats
 * nothing always succeeds and touches no stack.
 *
 * ONE PER PULL, never per projectile: a shotgun's pellets and a VOLLEY
 * talent's extra arrows are all one loading, so the spread weapons stay worth
 * carrying instead of costing eight times as much to shoot.
 */
export function spendAmmo(player: Player, piece: Equipment): boolean {
  const type = weaponAmmoType(piece);
  if (type === undefined) return true;
  const left = ammoCount(player, type);
  if (left <= 0) return false;
  player.ammo[type] = left - 1;
  return true;
}

/**
 * Bank a found box into the pouch, capped at `AMMO.stackCap` per kind.
 * Returns how many rounds were actually TAKEN — which is the whole point of
 * the return value: a pouch with room for six of a twenty-round box takes six,
 * and the caller re-grounds the remaining fourteen as a smaller box rather
 * than destroying them or refusing the find outright. Zero means the stack was
 * already full and the box stays exactly as it was.
 */
export function bankAmmo(
  player: Player,
  type: AmmoType,
  count: number,
): number {
  const held = ammoCount(player, type);
  const taken = Math.max(0, Math.min(count, AMMO.stackCap - held));
  if (taken > 0) player.ammo[type] = held + taken;
  return taken;
}

/** Add rounds to the pouch ignoring where they came from — the seeding path
 * (a run's opening holster, a scenario, a mercy delivery). Capped like any
 * other bank; the overflow is simply dropped, since there is no box to
 * re-ground. */
export function grantAmmo(player: Player, type: AmmoType, count: number): void {
  bankAmmo(player, type, count);
}

/**
 * THE OPENING HOLSTER — the pouch a fresh run starts with. `AMMO.starting`
 * (100) rounds for the kind the hero's own weapon eats, which is the stock the
 * opening is actually about: a hundred shots is over a minute of steady fire,
 * and the first thing a new player learns about ammunition should be that it
 * exists, not that it is about to run out.
 *
 * THE BUILT-IN SIDEARM gets its kind too, but only `AMMO.sidearmReserve` of it
 * — and only when it is not already the kind in hand. It is the weapon the
 * engine draws when everything else has run dry (`swapOffDryWeapon`, which
 * refuses to draw a sidearm that cannot shoot), so an empty one is not a
 * setback, it is a run that cannot be finished. A full second stack overshot
 * that job badly: EASY opens with a SAWED-OFF SHOTGUN, so the pouch read "100
 * BULLETS, 100 CELLS" and the hundred rounds for a gun the hero does not carry
 * looked exactly as important as the ones he was firing.
 *
 * A MELEE OR MAGIC OPENING is the other case, and there the sidearm IS the
 * hero's only gun rather than his fallback — so it gets the full opening
 * stock, which is the hundred cells the game has always given a sword start.
 *
 * Both kinds are read off their defs rather than spelled out, so a game (or a
 * mod) that re-arms either with a bow gets a quiver.
 */
export function startingAmmo(
  heldWeapon?: string,
): Partial<Record<AmmoType, number>> {
  const pouch: Partial<Record<AmmoType, number>> = {};
  const held =
    heldWeapon !== undefined && isWeaponDef(heldWeapon)
      ? weaponDef(heldWeapon).ammo
      : undefined;
  const sidearm = weaponDef(SIDEARM_DEF_ID).ammo;
  if (sidearm !== undefined) {
    pouch[sidearm] = held === undefined ? AMMO.starting : AMMO.sidearmReserve;
  }
  // Last, so a hero whose own weapon eats the sidearm's kind gets the full
  // opening stock rather than the reserve written just above.
  if (held !== undefined) pouch[held] = AMMO.starting;
  return pouch;
}

/** A dropped box's pickup-card name ("BULLETS", …). */
export function ammoName(type: AmmoType): string {
  return AMMO_KINDS[type].name;
}

/**
 * How many rounds one dropped box of `type` carries — the kind's authored
 * band (`AMMO_KINDS[type].pickup`), rolled uniformly. Consumes exactly ONE
 * `state.rng()` draw, like every other drop-ladder roll.
 */
export function rollAmmoCount(state: GameState, type: AmmoType): number {
  const [min, max] = AMMO_KINDS[type].pickup;
  return min + Math.floor(state.rng() * (max - min + 1));
}

/**
 * WHICH KIND a drop for this hero should be: what the weapon in his hand eats,
 * failing that the kind he is deepest INVESTED in (the best ranged weapon in
 * the bag), failing that the kind he is holding least of — so a melee hero
 * still accumulates a usable reserve instead of a random scatter across three
 * stacks he will never fire.
 *
 * Deterministic — it draws no rng at all, because presentation and convenience
 * picks must never shift the seeded drop stream (the rule the whole loot
 * ladder is built on).
 */
export function ammoKindFor(state: GameState, player: Player): AmmoType {
  const held = weaponAmmoType(player.equipment.weapon);
  if (held !== undefined) return held;
  for (const piece of player.inventory) {
    if (!piece) continue;
    const type = weaponAmmoType(piece);
    if (type !== undefined) return type;
  }
  let leanest = AMMO_TYPES[0] as AmmoType;
  for (const type of AMMO_TYPES) {
    if (ammoCount(player, type) < ammoCount(player, leanest)) leanest = type;
  }
  return leanest;
}

/**
 * THE AMMUNITION SLICE'S APPETITE: how much of its authored share of the drop
 * ladder (`AMMO.dropShare`, `CRATES.drop.ammo`) the hero's current state
 * earns. Two factors multiply, the `CONSUMABLES` appetite shape retuned for a
 * resource spent continuously:
 *
 * SUPPLY — how full the stack that would actually drop already is, tapering
 * from `AMMO.appetiteStart` down to `AMMO.appetiteFloor`. The floor is low but
 * not zero: a box on the ground is still worth walking to for a hero who is
 * about to spend what he holds.
 *
 * NEED — a lean up to `AMMO.appetiteNeedBonus` as that stack empties, so the
 * hero down to his last dozen rounds finds boxes noticeably more often, long
 * before the mercy rope (below) is anywhere near being thrown.
 *
 * CLASS — and on top of both, a hero holding a melee or magic weapon earns
 * only `AMMO.offClassShare` of the slice. He still finds the odd box, because
 * the weapon he holds now is not the weapon he will hold in five minutes and
 * a pouch that only fills once you are already armed makes picking up a found
 * rifle a punishment.
 */
export function ammoAppetite(state: GameState, player: Player): number {
  const type = ammoKindFor(state, player);
  const fill = clamp01(ammoCount(player, type) / AMMO.stackCap);
  const supply =
    AMMO.appetiteFloor +
    (1 - AMMO.appetiteFloor) * desperationRamp(fill, 1, AMMO.appetiteStart);
  const need = 1 + AMMO.appetiteNeedBonus * (1 - fill);
  const onClass = weaponAmmoType(player.equipment.weapon) !== undefined;
  return supply * need * (onClass ? 1 : AMMO.offClassShare);
}

/**
 * HOW BADLY THE HERO IS STUCK for want of rounds, as a 0→1 mercy desperation
 * (`desperationRamp`) — zero unless he is holding a weapon that eats ammunition
 * AND is nearly out of it AND has nothing else in the bag he could fight with.
 *
 * That last clause is what keeps the rope honest. A hero with a dry rifle and
 * a sword in the bag is not in trouble, he has a decision to make; the engine
 * makes it for him anyway (`stepWeapon` draws the sword). Only a hero whose
 * every option is the same empty stack is in the one unrecoverable state
 * ammunition can create, and that is the state this answers.
 */
export function outOfAmmoDesperation(state: GameState, player: Player): number {
  const type = weaponAmmoType(player.equipment.weapon);
  if (type === undefined) return 0;
  for (const piece of player.inventory) {
    if (!piece) continue;
    if (!isWieldableWeapon(piece)) continue;
    // Anything in the bag he could actually shoot or swing right now means the
    // hand is a choice, not a dead end.
    if (hasAmmoFor(player, piece)) return 0;
  }
  return desperationRamp(
    clamp01(ammoCount(player, type) / AMMO.stackCap),
    AMMO.mercyStart,
    0,
  );
}

/** Whether a bag cell holds a weapon at all (rings, armor and charms are not
 * an answer to an empty pouch). The level requirement is deliberately NOT
 * checked here: `stepWeapon`'s swap does that, and a piece he cannot lift yet
 * should not silence the rope. */
function isWieldableWeapon(piece: Equipment): boolean {
  return piece.slot === "weapon";
}
