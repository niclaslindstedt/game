// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SET items — the D2 GREEN tier. A SET is a boss's hand-authored armor kit
// (defs/uniques.ts pieces tagged `tier: "set"`), themed to ONE weapon class so
// the pieces read as a coherent build (a melee bruiser's plate, a ranged
// gunslinger's leathers, a mage's regalia). Wearing several pieces of the same
// set at once grants SET BONUSES on top of each piece's own bonuses — small
// attribute lifts at the low thresholds, then a thematic CAPSTONE power at the
// full set (a granted spell, a proc, or sure-strike) — so a boss is worth
// farming to complete its set. Sets sit BELOW uniques on the ladder and, like a
// named unique, are AUTHORED, never rolled: a set piece drops only from its boss
// (`EnemyDef.uniquesByDifficulty`).
//
// The catalog rolls out melee-first across the campaign: PAYLOAD-1 (GOODCO) and
// ARMSTRONG (Moon) drop MELEE sets, THE FOUNDER on Mars and in the Rift drop
// RANGED sets, and BRO OMEGA drops the MAGIC set. The membership here is the
// source of truth; each member `UniqueDef` carries a matching `setId`
// back-reference, validated at load.

import { GENERATED_SETS } from "../../generated/sets.ts";
import { UNIQUE_DEFS } from "./uniques.ts";

import type {
  Affix,
  ArmorSlot,
  ItemSlot,
  WeaponClass,
} from "../types/index.ts";

/** One threshold of a set's bonuses: the extra `bonuses` granted once at least
 * `pieces` members are worn. Thresholds are cumulative (D2-style) — the bonuses
 * of every threshold at or below the worn count all apply — so the full set
 * carries every tier's bonuses at once. */
export type SetBonusTier = {
  /** Worn-piece count this tier unlocks at (≥ 2, ≤ the set's size). */
  pieces: number;
  /** Bonuses granted at this threshold (folded into the loadout's affixes). */
  bonuses: Affix[];
};

/** A hand-authored SET: a themed group of armor pieces with tiered bonuses. */
export type SetDef = {
  /** Stable id (member `UniqueDef.setId` references this). */
  id: string;
  /** Display name shown on the item card's set block (THE WALLED GARDEN). */
  name: string;
  /** The weapon class the kit is built to support — read for validation and
   * for the boss's on-theme signature weapon; the pieces themselves are armor. */
  weaponClass: WeaponClass;
  /** The member `UniqueDef` ids (3–5), one per armor slot. */
  members: string[];
  /** The tiered bonuses, authored in ascending `pieces` order. */
  bonuses: SetBonusTier[];
};

const ARMOR_SLOTS: readonly ItemSlot[] = ["head", "chest", "legs", "feet"];

/** The shipped set catalog, merged by id (throws on a clash / bad member). */
export const SET_DEFS: Record<string, SetDef> = mergeSets(
  Object.values(GENERATED_SETS),
);

function mergeSets(defs: SetDef[]): Record<string, SetDef> {
  const merged: Record<string, SetDef> = {};
  const claimed = new Map<string, string>(); // member id → owning set id
  for (const def of defs) {
    if (def.id in merged) throw new Error(`duplicate set id "${def.id}"`);
    if (def.members.length < 3 || def.members.length > 5) {
      throw new Error(
        `set "${def.id}" has ${def.members.length} members (want 3–5)`,
      );
    }
    const slots = new Set<ItemSlot>();
    for (const memberId of def.members) {
      const member = UNIQUE_DEFS[memberId];
      if (!member)
        throw new Error(`set "${def.id}" unknown member "${memberId}"`);
      if (member.tier !== "set") {
        throw new Error(
          `set "${def.id}" member "${memberId}" tier ${member.tier ?? "unique"} != set`,
        );
      }
      if (!ARMOR_SLOTS.includes(member.slot)) {
        throw new Error(
          `set "${def.id}" member "${memberId}" slot ${member.slot} is not armor`,
        );
      }
      if (member.setId !== def.id) {
        throw new Error(
          `set "${def.id}" member "${memberId}" setId ${member.setId ?? "(none)"} mismatched`,
        );
      }
      if (slots.has(member.slot)) {
        throw new Error(`set "${def.id}" has two "${member.slot}" pieces`);
      }
      slots.add(member.slot);
      const owner = claimed.get(memberId);
      if (owner) {
        throw new Error(
          `member "${memberId}" claimed by both "${owner}" and "${def.id}"`,
        );
      }
      claimed.set(memberId, def.id);
    }
    // Thresholds ascend, sit in [2, size], and never repeat.
    let prev = 1;
    for (const tier of def.bonuses) {
      if (tier.pieces <= prev || tier.pieces > def.members.length) {
        throw new Error(
          `set "${def.id}" bonus threshold ${tier.pieces} out of order/range`,
        );
      }
      prev = tier.pieces;
    }
    merged[def.id] = def;
  }
  // Every tier:"set" unique must belong to exactly one set — a green piece with
  // no home would grant nothing and read as a bug.
  for (const [id, u] of Object.entries(UNIQUE_DEFS)) {
    if (u.tier === "set" && !claimed.has(id)) {
      throw new Error(`set unique "${id}" belongs to no set`);
    }
  }
  return merged;
}

let activeSets: Record<string, SetDef> = SET_DEFS;

// Bumped on every catalog swap so caches keyed on the set registry (the
// hero-loadout memo in items/derived.ts) can invalidate without comparing
// catalogs structurally.
let setsEpochCounter = 0;

/** Test/authoring hook: replace the active set catalog. */
export function setSetDefs(defs: Record<string, SetDef>): void {
  activeSets = defs;
  setsEpochCounter++;
}

/** Monotonic epoch of the active set catalog (see `setSetDefs`). */
export function setsEpoch(): number {
  return setsEpochCounter;
}

/** Look up a set def; throws on a broken id so bugs surface loudly. */
export function setDef(id: string): SetDef {
  const def = activeSets[id];
  if (!def) throw new Error(`unknown set "${id}"`);
  return def;
}

/** Every shipped set id. */
export const SET_IDS: string[] = Object.keys(SET_DEFS);

/** The ACTIVE set catalog as a list (honors `setSetDefs`). */
export function activeSetDefs(): SetDef[] {
  return Object.values(activeSets);
}

/** The set a member unique belongs to, or null — reads the active catalog so
 * fixture sets answer for themselves. */
export function setForItem(uniqueId: string): SetDef | null {
  for (const def of activeSetDefs()) {
    if (def.members.includes(uniqueId)) return def;
  }
  return null;
}

/** A member's armor slot in its set (for the item card's piece list). */
export function setMemberSlots(def: SetDef): ArmorSlot[] {
  return def.members.map((id) => UNIQUE_DEFS[id]?.slot as ArmorSlot);
}
