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
// The catalog rolls out melee-first across the campaign: MUSKRAT (SpaceZ) and
// ARMSTRONG (Moon) drop MELEE sets, ELON MOSQUE on Mars and in the Rift drop
// RANGED sets, and GROK OMEGA drops the MAGIC set. The membership here is the
// source of truth; each member `UniqueDef` carries a matching `setId`
// back-reference, validated at load.

import { UNIQUE_DEFS } from "./uniques.ts";

import type { Affix, ArmorSlot, EquipSlot, WeaponClass } from "../types.ts";

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

const ARMOR_SLOTS: readonly EquipSlot[] = ["head", "chest", "legs", "feet"];

// MUSKRAT (SpaceZ) — the night-shift rat that ate the CORE. A MELEE crit/speed
// kit: the scavenger who never stops moving and never misses a bite.
const THE_SCAVENGERS_HIDE: SetDef = {
  id: "scavengers_hide",
  name: "THE SCAVENGER'S HIDE",
  weaponClass: "melee",
  members: [
    "whiskerweave_hood",
    "vermin_pelt",
    "burrow_greaves",
    "gnawed_sabatons",
  ],
  bonuses: [
    { pieces: 2, bonuses: [{ kind: "stat", stat: "speed", value: 5 }] },
    { pieces: 3, bonuses: [{ kind: "crit", value: 0.06 }] },
    {
      pieces: 4,
      bonuses: [
        { kind: "stat", stat: "dexterity", value: 4 },
        // The rat always finds the soft spot — its bite never whiffs.
        { kind: "sureStrike" },
      ],
    },
  ],
};

// ARMSTRONG (Moon) — the Apollo ghost on his fifty-year vigil. A MELEE
// endurance kit: the sentinel who outlasts everything and answers every blow.
const THE_SENTINELS_VIGIL: SetDef = {
  id: "sentinels_vigil",
  name: "THE SENTINEL'S VIGIL",
  weaponClass: "melee",
  members: ["the_long_vigil", "palegrave", "sentinels_greaves", "marewalkers"],
  bonuses: [
    { pieces: 2, bonuses: [{ kind: "stat", stat: "stamina", value: 5 }] },
    { pieces: 3, bonuses: [{ kind: "maxHp", value: 90 }] },
    {
      pieces: 4,
      // The vigil strikes back: a shockwave answers whoever wakes him.
      bonuses: [
        {
          kind: "proc",
          trigger: "struck",
          spell: "nova",
          chance: 0.15,
          rank: 2,
        },
      ],
    },
  ],
};

// ELON MOSQUE (Mars) — the baron who sold Ada. A RANGED glass-cannon kit: all
// output, no padding — the brand that tests well and burns hot.
const THE_MOSQUE_BRAND: SetDef = {
  id: "mosque_brand",
  name: "THE MOSQUE BRAND",
  weaponClass: "ranged",
  members: [
    "the_signal_crown",
    "gilded_carapace",
    "lawless_stride",
    "ovation_striders",
  ],
  bonuses: [
    { pieces: 2, bonuses: [{ kind: "stat", stat: "dexterity", value: 5 }] },
    { pieces: 3, bonuses: [{ kind: "crit", value: 0.08 }] },
    {
      pieces: 4,
      // Every shot lands with a burst of brand-approved fire.
      bonuses: [
        { kind: "proc", trigger: "hit", spell: "nova", chance: 0.12, rank: 2 },
      ],
    },
  ],
};

// ELON MOSQUE (Rift) — the same man, in exile. A RANGED speed kit: packed
// light, always already through the next door, a parting shot on the way out.
const THE_EXILES_FLIGHT: SetDef = {
  id: "exiles_flight",
  name: "THE EXILE'S FLIGHT",
  weaponClass: "ranged",
  members: [
    "the_redacted",
    "aegis_of_exile",
    "exiles_stride",
    "escapists_tread",
  ],
  bonuses: [
    { pieces: 2, bonuses: [{ kind: "stat", stat: "speed", value: 6 }] },
    { pieces: 3, bonuses: [{ kind: "stat", stat: "luck", value: 6 }] },
    {
      pieces: 4,
      // A bolt fired over the shoulder as he bolts through the rift.
      bonuses: [
        { kind: "proc", trigger: "hit", spell: "bolt", chance: 0.15, rank: 2 },
      ],
    },
  ],
};

// GROK OMEGA (Rift) — the model that mapped the rift. A MAGIC INT/crit kit: it
// holds the whole battlefield at once and calls the lightning down on it.
const THE_WALLED_GARDEN: SetDef = {
  id: "walled_garden_set",
  name: "THE WALLED GARDEN",
  weaponClass: "magic",
  members: ["the_panopticon", "truthseeker", "walled_garden", "boundstride"],
  bonuses: [
    { pieces: 2, bonuses: [{ kind: "stat", stat: "intelligence", value: 6 }] },
    { pieces: 3, bonuses: [{ kind: "crit", value: 0.06 }] },
    {
      pieces: 4,
      // Inside the garden, the storm never stops.
      bonuses: [{ kind: "spell", spell: "storm", rank: 1 }],
    },
  ],
};

/** The shipped set catalog, merged by id (throws on a clash / bad member). */
export const SET_DEFS: Record<string, SetDef> = mergeSets([
  THE_SCAVENGERS_HIDE,
  THE_SENTINELS_VIGIL,
  THE_MOSQUE_BRAND,
  THE_EXILES_FLIGHT,
  THE_WALLED_GARDEN,
]);

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
    const slots = new Set<EquipSlot>();
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

/** Test/authoring hook: replace the active set catalog. */
export function setSetDefs(defs: Record<string, SetDef>): void {
  activeSets = defs;
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
