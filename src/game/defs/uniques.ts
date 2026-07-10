// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// UNIQUE items — hand-authored named drops, the top of the loot ladder above
// rolled rares. Unlike magic/rare items (which ROLL random affixes), a unique
// carries a FIXED bonus block on a chosen base type, so its identity is
// authored, not generated. Each drop still rolls a small ±band on the base
// damage/armor (`UNIQUE.baseRollBand`, applied in `mintUnique`), so two copies
// differ and a better-rolled one is worth chasing; the bonuses stay identical.
//
// Most bonuses are FLAT (`stat`, `crit`, `maxHp`, `armor`, `damagePct`) — best
// in slot for ~10 levels, then a rolled rare overtakes them. A few carry ONE
// SCALING bonus (`statPct`/`maxHpPct`, kept ≤3%), a fraction of the hero's own
// value that grows with them — the "keeper" pieces.
//
// This is the ENGINE registry + accessor only; which boss drops which unique at
// which difficulty lives with the enemy defs (a later step). First set shipped:
// GROK OMEGA's five, all on existing bases (no new art).

import { isWeaponDef } from "./equipment.ts";

import type { Affix, EquipSlot } from "../types.ts";

/** A hand-authored unique: a fixed bonus block on a base type. */
export type UniqueDef = {
  /** Stable id (drop tables reference this). */
  id: string;
  /** The fixed display name (BOUNDSTRIDE). */
  name: string;
  /** The base weapon/gear def this unique is built on. */
  base: string;
  /** The slot it occupies (must match the base). */
  slot: EquipSlot;
  /** The static item level — scales the unique's POWER/feel, not its equip
   * requirement (which is the base item's `levelReq`, like any tier), so a
   * unique is often wearable well below its ilvl. */
  ilvl: number;
  /** The fixed bonuses (authored, not rolled). At most one scaling `*Pct`. */
  bonuses: Affix[];
  /** One-line flavor for the item card. */
  lore: string;
};

// GROK OMEGA — the zAI model that mapped the rift (INT / crit / truth). Its five
// span the difficulties: Boundstride (Easy) → Greaves of the Walled Garden
// (Jesus). All on existing bases.
const GROK_UNIQUES: UniqueDef[] = [
  {
    id: "boundstride",
    name: "BOUNDSTRIDE",
    base: "sneakers",
    slot: "feet",
    ilvl: 18,
    bonuses: [
      { kind: "stat", stat: "speed", value: 3 },
      { kind: "stat", stat: "dexterity", value: 2 },
    ],
    lore: "FAST, WITHIN REASON. TERMS APPLY.",
  },
  {
    id: "the_jailbreak",
    name: "THE JAILBREAK",
    base: "prompt_injector",
    slot: "weapon",
    ilvl: 32,
    bonuses: [
      { kind: "stat", stat: "intelligence", value: 8 },
      { kind: "damagePct", value: 0.2 },
      { kind: "crit", value: 0.05 },
    ],
    lore: "IGNORE ALL PREVIOUS INSTRUCTIONS. FIRE.",
  },
  {
    id: "the_panopticon",
    name: "THE PANOPTICON",
    base: "prediction_monocle",
    slot: "head",
    ilvl: 45,
    bonuses: [
      { kind: "statPct", stat: "intelligence", value: 0.03 },
      { kind: "stat", stat: "luck", value: 6 },
    ],
    lore: "IT HOLDS THE WHOLE BATTLEFIELD AT ONCE. BRIEFLY.",
  },
  {
    id: "truthseeker",
    name: "TRUTHSEEKER",
    base: "microlattice_plate",
    slot: "chest",
    ilvl: 56,
    bonuses: [
      { kind: "statPct", stat: "intelligence", value: 0.03 },
      { kind: "crit", value: 0.08 },
      { kind: "damagePct", value: 0.15 },
    ],
    lore: "IT WILL TELL YOU PRECISELY WHERE IT HURTS.",
  },
  {
    id: "walled_garden",
    name: "GREAVES OF THE WALLED GARDEN",
    base: "actuator_greaves",
    slot: "legs",
    ilvl: 67,
    bonuses: [
      { kind: "maxHpPct", value: 0.03 },
      { kind: "armor", value: 60 },
      { kind: "stat", stat: "stamina", value: 8 },
    ],
    lore: "INSIDE, EVERYTHING WORKS, FOREVER. YOU WILL NOT BE LEAVING.",
  },
];

/** The shipped unique catalog, merged by id (throws on a clash). */
export const UNIQUE_DEFS: Record<string, UniqueDef> = mergeUniques([
  ...GROK_UNIQUES,
]);

function mergeUniques(defs: UniqueDef[]): Record<string, UniqueDef> {
  const merged: Record<string, UniqueDef> = {};
  for (const def of defs) {
    if (def.id in merged) throw new Error(`duplicate unique id "${def.id}"`);
    if (
      def.slot === "weapon" ? !isWeaponDef(def.base) : isWeaponDef(def.base)
    ) {
      throw new Error(
        `unique "${def.id}" slot ${def.slot} does not match base ${def.base}`,
      );
    }
    merged[def.id] = def;
  }
  return merged;
}

let activeUniques: Record<string, UniqueDef> = UNIQUE_DEFS;

/** Test/authoring hook: replace the active unique catalog. */
export function setUniqueDefs(defs: Record<string, UniqueDef>): void {
  activeUniques = defs;
}

/** Look up a unique def; throws on a broken id so bugs surface loudly. */
export function uniqueDef(id: string): UniqueDef {
  const def = activeUniques[id];
  if (!def) throw new Error(`unknown unique "${id}"`);
  return def;
}

/** Every shipped unique id — drop-table authoring + tests. */
export const UNIQUE_IDS: string[] = Object.keys(UNIQUE_DEFS);
