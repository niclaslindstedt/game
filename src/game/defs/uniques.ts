// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// UNIQUE items — hand-authored named drops, the top of the loot ladder above
// rolled rares. Unlike magic/rare items (which ROLL random affixes), a unique
// carries a FIXED bonus block on a chosen base type, so its identity is
// authored, not generated. Each drop still rolls a small ±band on the base
// damage/armor (`UNIQUE.baseRollBand`, applied in `mintUnique`), so two copies
// differ and a better-rolled one is worth chasing; the bonuses stay identical.
//
// Bonus classes:
//   - FLAT (`stat`/`crit`/`maxHp`/`armor`/`damagePct`): best in slot for ~10
//     levels, then a rolled rare overtakes them.
//   - SCALING (`statPct`/`maxHpPct`, at most ONE per item, ≤2%): a fraction of
//     the hero's own value that grows with them — the "keeper" pieces.
// Authoring budget: a DOWNSIDE (a small negative) buys extra/bigger upside, so
// the situational pieces (glass-cannon legs, all-brain helms) hit harder for
// the build that can carry them and read as dead weight otherwise.
//
// The five bosses each own a GREEN SET (defs/sets.ts): four armor pieces —
// tagged `tier: "set"` + a `setId` here — themed to one weapon class, plus one
// on-theme SIGNATURE weapon kept as a plain unique. Which boss drops which is
// wired on the enemy defs (`EnemyDef.uniquesByDifficulty`); the whole set is
// farmable from its boss on the endgame rungs. DOGE-1 also drops a BAG and GROK
// a CHARM on each rung (a separate accessory axis, ordinary uniques). Bases are
// all existing catalog items for now — dedicated art (a fang dagger, a
// flagstaff, a roomy bag) is a later polish pass.

import { gearDef, isWeaponDef } from "./equipment.ts";
import { GENERATED_UNIQUES } from "../../generated/items.ts";

import type { Affix, EquipSlot, Tier } from "../types.ts";

/** A hand-authored unique: a fixed bonus block on a base type. */
export type UniqueDef = {
  /** Stable id (drop tables reference this). */
  id: string;
  /** The fixed display name. */
  name: string;
  /** The base weapon/gear def this unique is built on. */
  base: string;
  /** The slot it occupies (must match the base). */
  slot: EquipSlot;
  /** The rarity tier this mints at — the hand-authored chase climbs
   * `"unique"` (default) → `"legendary"` → `"artifact"` (the super-epic
   * level-99 endgame roster): each rung a rarer card color, a denser pickup
   * blaze, and the same unbreakable/keepsake treatment. Omit for an ordinary
   * unique. Legendary/artifact drop from HARD up via the global rarity roll,
   * gated by the base's level requirement and spread by the power-law
   * `uniqueDropWeight`; the checkers hold the same ilvl/armor rules for all. */
  tier?: Extract<Tier, "set" | "unique" | "legendary" | "artifact">;
  /** SET pieces only (`tier: "set"`): the `SetDef` id this piece belongs to
   * (defs/sets.ts). The set's `members` list is the source of truth for
   * membership; this back-reference is validated against it at load. */
  setId?: string;
  /** The static item level — scales the unique's POWER/feel, not its equip
   * requirement (which is the base item's `levelReq`, like any tier), so a
   * unique is often wearable well below its ilvl. */
  ilvl: number;
  /**
   * D2's per-item `rarity` weight — the RELATIVE odds this named item is the
   * one chosen once a rarity roll lands its tier for its slot (see
   * `pickUniqueForDrop` in items/rolling.ts). Higher = commoner. Omitted defaults to
   * `UNIQUE.defaultRarity`, so the whole catalog works un-annotated and the
   * chase items can be hand-weighted DOWN later. This is the "every item has
   * its own drop %" lever, folded into the rarity roll rather than a bolt-on
   * channel.
   */
  rarity?: number;
  /** The fixed bonuses (authored, not rolled). At most one scaling `*Pct`. */
  bonuses: Affix[];
  /** BAG uniques only: the extra inventory cells this bag grants, overriding
   * the base bag's capacity (applied in `mintUnique`). */
  bagSlots?: number;
  /** Authoring metadata (the engine ignores it): mark an INTENTIONAL over-budget
   * keeper — a scaling `statPct`/`maxHpPct` piece that's deliberately weak at its
   * early equip level but compounds into best-in-slot as the hero grows. It
   * suppresses `scripts/weapon-ilvl.mjs`'s over-budget warning, which otherwise
   * flags "power too high for the equip gate". Only set this when the deviation
   * is a deliberate keeper design, not an accident. */
  keeper?: boolean;
  /** Marks a LEVEL-LOCKED world-drop relic — scattered by a level's
   * `worldUniques` list rather than a boss's difficulty table. See the
   * `WORLD_UNIQUES` export below. */
  world?: boolean;
  /** One-line flavor for the item card. */
  lore: string;
};

// The named catalog itself is AUTHORED IN YAML — one file per item under
// content/items/<rarity>/ (set/unique/legendary/artifact), compiled by
// scripts/generate-items.mjs into src/generated/items.ts. This module wraps
// it with the UniqueDef type, the merge-time validation, and the lookups.

/** The shipped unique catalog, merged by id (throws on a clash / bad base). */
export const UNIQUE_DEFS: Record<string, UniqueDef> =
  mergeUniques(GENERATED_UNIQUES);

/**
 * The LEVEL-LOCKED world-drop relics (`world: true` in the item YAML) — the
 * named items scattered per level via `LevelDef.worldUniques` rather than a
 * boss's difficulty table. A grouping, not a tier: most are plain uniques,
 * a few legendary. The level pipeline validates worldUniques ids against it.
 */
export const WORLD_UNIQUES: UniqueDef[] = GENERATED_UNIQUES.filter(
  (u) => u.world,
);

function mergeUniques(defs: UniqueDef[]): Record<string, UniqueDef> {
  const merged: Record<string, UniqueDef> = {};
  for (const def of defs) {
    if (def.id in merged) throw new Error(`duplicate unique id "${def.id}"`);
    const weapon = isWeaponDef(def.base);
    if (weapon !== (def.slot === "weapon")) {
      throw new Error(
        `unique "${def.id}" slot ${def.slot} does not match base ${def.base}`,
      );
    }
    // Gear uniques must sit in the base's own slot (a head unique on a head
    // base), so it equips and draws where it belongs.
    if (!weapon && gearDef(def.base).slot !== def.slot) {
      throw new Error(
        `unique "${def.id}" slot ${def.slot} != base ${def.base} slot ${gearDef(def.base).slot}`,
      );
    }
    // At most one scaling bonus, and small.
    const scaling = def.bonuses.filter(
      (b) => b.kind === "statPct" || b.kind === "maxHpPct",
    );
    if (scaling.length > 1) {
      throw new Error(
        `unique "${def.id}" has ${scaling.length} scaling bonuses`,
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

/** The ACTIVE unique catalog as a list (honors `setUniqueDefs`, so tests that
 * swap in a fixture catalog see only their own). Used by the rarity-roll fold
 * (`pickUniqueForDrop`) to enumerate the named items eligible for a drop. */
export function activeUniqueDefs(): UniqueDef[] {
  return Object.values(activeUniques);
}
