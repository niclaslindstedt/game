// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The POWERUP LADDER — this game's own rule for how the dock's vocabulary
// grows: SPACEZ HQ opens with the classics, and every map after it introduces
// exactly TWO powers that could only have come from there while keeping
// everything the player already learned. A shipped-content suite (it names
// levels and powers by id), so a sequel deletes it wholesale.

import { describe, expect, it } from "vitest";

import { ABILITY_DEFS, LEVEL_ORDER, LEVELS, levelDef } from "@game/core";

/** The powers each map is supposed to be the debut of (see
 * content/powerups.yaml's header). */
const DEBUTS: Record<string, string[]> = {
  moon: ["moonfall", "pale_shroud"],
  mars: ["dust_devil", "reactor_surge"],
  the_rift: ["event_horizon", "the_unmaking"],
  eastworld: ["dead_mans_hand", "iron_stampede"],
  the_bunker: ["continuity_protocol", "sentry_grid"],
};

describe("the powerup ladder", () => {
  it("names only powers that exist", () => {
    for (const level of Object.values(LEVELS)) {
      for (const id of level.loot.abilityPool) {
        expect(ABILITY_DEFS[id], `${level.id} names "${id}"`).toBeDefined();
      }
    }
  });

  it("introduces exactly two new powers per campaign map, and takes none away", () => {
    let seen = new Set<string>();
    for (const [i, id] of LEVEL_ORDER.entries()) {
      const pool = levelDef(id).loot.abilityPool;
      const fresh = pool.filter((p) => !seen.has(p));
      if (i > 0) {
        expect(fresh, `${id} debuts ${fresh.join(", ")}`).toHaveLength(2);
        expect(fresh.sort()).toEqual([...(DEBUTS[id] ?? [])].sort());
      }
      for (const power of seen) {
        expect(pool, `${id} dropped "${power}"`).toContain(power);
      }
      seen = new Set([...seen, ...pool]);
    }
  });

  it("gives the secret bunker the rift's vocabulary plus its own two", () => {
    // The bunker is entered FROM the rift, so that is the pool it inherits.
    const rift = new Set(levelDef("the_rift").loot.abilityPool);
    const bunker = levelDef("the_bunker").loot.abilityPool;
    for (const power of rift) expect(bunker).toContain(power);
    expect(bunker.filter((p) => !rift.has(p)).sort()).toEqual(
      [...DEBUTS.the_bunker!].sort(),
    );
  });

  it("every shipped power is reachable from some level's pool", () => {
    const pooled = new Set(
      Object.values(LEVELS).flatMap((l) => l.loot.abilityPool),
    );
    for (const id of Object.keys(ABILITY_DEFS)) {
      // The NUKE is the one power no pool names — it arrives as a mercy drop
      // for a hero being overrun (see `canDropNuke`).
      if (id === "screen_nuke") continue;
      expect(pooled, `"${id}" can never drop`).toContain(id);
    }
  });

  it("weights every power on the authored rarity ladder", () => {
    // The rungs `content/powerups.yaml` documents. A new power picks one of
    // these (or leaves `rarity` off, which IS the 100 rung) rather than
    // inventing a number nobody can compare against.
    const RUNGS = [10, 15, 30, 40, 70, 80, 100];
    for (const [id, def] of Object.entries(ABILITY_DEFS)) {
      if (def.rarity === undefined) continue;
      expect(RUNGS, `"${id}" is weighted ${def.rarity}`).toContain(def.rarity);
    }
  });

  it("keeps the run-savers rarer than the classics", () => {
    // The whole point of the weights: a power that hands a run back must not
    // turn up as often as three orbiting fireballs. Pinned by NAME rather than
    // by number so a rebalance is free to move the rungs and this still bites.
    const weight = (id: string) => ABILITY_DEFS[id]?.rarity ?? 100;
    const classics = ["fire_orbs", "storm_cell", "item_magnet", "ion_wake"];
    for (const classic of classics) expect(weight(classic)).toBe(100);
    // The death ward is the rarest thing in the dock; the anchored black hole
    // is next. Every "heavy" sits under every classic.
    expect(weight("continuity_protocol")).toBeLessThan(weight("event_horizon"));
    for (const heavy of [
      "event_horizon",
      "reactor_surge",
      "iron_stampede",
      "blast_shield",
    ]) {
      expect(weight(heavy), `"${heavy}"`).toBeLessThan(100);
    }
  });
});
