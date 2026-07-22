// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The weapon-class ↔ attribute wiring: which stat scales each class's damage,
// speed, and crit, which attribute gates wielding it, and the lane the hero's
// allocation commits him to.

import { weaponDef } from "../defs/equipment.ts";
import type { ArmorSlot, GameState, StatName, WeaponClass } from "../types.ts";

/** The four body slots armor is worn in, in paperdoll order. */
export const ARMOR_SLOTS: readonly ArmorSlot[] = [
  "head",
  "chest",
  "legs",
  "feet",
];

/**
 * The stat that scales each weapon class's DAMAGE: STRENGTH powers physical
 * weapons (melee and ranged), INTELLIGENCE powers magic ones.
 */
export const DAMAGE_STAT: Record<WeaponClass, StatName> = {
  melee: "strength",
  ranged: "strength",
  magic: "intelligence",
};

/**
 * The stat that scales each weapon class's ATTACK SPEED: DEXTERITY quickens
 * physical weapons (melee and ranged), INTELLIGENCE quickens magic ones.
 */
export const SPEED_STAT: Record<WeaponClass, StatName> = {
  melee: "dexterity",
  ranged: "dexterity",
  magic: "intelligence",
};

/**
 * The stat that sharpens each weapon class's CRIT chance: DEXTERITY for
 * physical weapons (melee and ranged), INTELLIGENCE for magic ones. LUCK adds
 * a marginal crit on top of whichever of these governs the swing (see
 * `playerCritChance`).
 */
export const CRIT_STAT: Record<WeaponClass, StatName> = {
  melee: "dexterity",
  ranged: "dexterity",
  magic: "intelligence",
};

/**
 * The attribute a weapon class REQUIRES to wield it — the Diablo stat gate that
 * forces a build to pick a lane: STRENGTH hefts melee, DEXTERITY steadies
 * ranged, INTELLIGENCE channels magic. Deliberately DISTINCT from `DAMAGE_STAT`
 * (which scales ranged off STRENGTH): the requirement gives each class its own
 * primary attribute so a hero cannot wield every class at once, while damage
 * scaling stays its own concern. The size of the requirement is derived from
 * the weapon's `levelReq` (see `statRequirement`), never authored per item.
 */
export const REQ_STAT: Record<WeaponClass, StatName> = {
  melee: "strength",
  ranged: "dexterity",
  magic: "intelligence",
};

/**
 * The weapon LANE the hero has committed to: the class whose REQUIRED attribute
 * he has the most of, with a tie (a bare starter, nothing invested) falling
 * back to the class in hand. A pure read of the hero's SPEC — so the auto-equip
 * (`weaponScore`) can PREFER on-lane weapons: a STR-deep melee build keeps its
 * blades instead of thrashing onto a marginally higher-DPS gun, and a hero
 * stranded on an off-lane starter upgrades to his lane the moment one drops.
 * This is the single source of truth the autopilot's `botLane` also reads.
 */
export function committedLane(state: GameState): WeaponClass {
  const stats = state.player.stats;
  const held = weaponDef(state.player.equipment.weapon.defId).class;
  let lane: WeaponClass = held;
  let best = stats[REQ_STAT[held]];
  for (const c of ["melee", "ranged", "magic"] as const) {
    if (stats[REQ_STAT[c]] > best) {
      best = stats[REQ_STAT[c]];
      lane = c;
    }
  }
  return lane;
}
