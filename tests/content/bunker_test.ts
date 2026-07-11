// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BUNKER — the secret cow level's wiring. The ritual is never explained
// in-game, so these tests are the contract: RASPUTIN (the rift's doorman)
// drops the SEVERED HAND, the rift's latent gate opens with it and leads to
// the bunker, the bunker has no boss (its exit door is the objective, its
// outro the where-was-it mystery), and the way back is the rift.

import { describe, expect, it } from "vitest";

import {
  ENEMY_DEFS,
  gearDef,
  LEVEL_ORDER,
  LEVELS,
  SECRET_LEVEL_ORDER,
  enemyDef,
} from "@game/core";

const bunker = LEVELS.the_bunker!;
const rift = LEVELS.the_rift!;

describe("the bunker", () => {
  it("is a secret venue: registered, but outside the campaign order", () => {
    expect(SECRET_LEVEL_ORDER).toContain("the_bunker");
    expect(LEVEL_ORDER).not.toContain("the_bunker");
    // Shares a campaign story index on purpose (the XP-cap axis must not
    // shift) — asserted structurally in catalog_test; pinned here too so a
    // re-index of the campaign revisits this choice deliberately.
    expect(LEVEL_ORDER.map((id) => LEVELS[id]!.index)).toContain(bunker.index);
  });

  it("opens from the rift: RASPUTIN's severed hand keys the latent gate", () => {
    const gate = (rift.gates ?? []).find((g) => g.to === "the_bunker");
    expect(gate).toBeDefined();
    expect(gate!.opensWith).toBe("severed_hand");
    expect(() => gearDef("severed_hand")).not.toThrow();
    // The key reads as junk on purpose: zero bonuses, base value.
    expect(gearDef("severed_hand").bonuses).toEqual({});

    // The doorman carries it — forced to the base tier so no affix roll ever
    // dresses it up. (Kill-only: sparing him keeps his equipment loot.)
    const rasputin = enemyDef("grigori_rasputin");
    expect(
      rasputin.loot?.items?.some(
        (i) => typeof i !== "string" && i.defId === "severed_hand",
      ),
    ).toBe(true);
  });

  it("has no boss: the exit door is the objective, the outro the mystery", () => {
    for (const spawn of bunker.spawns) {
      expect(enemyDef(spawn.enemy).role).not.toBe("boss");
    }
    expect(bunker.objective.type).toBe("reachExit");
    if (bunker.objective.type === "reachExit") {
      // The objective stands at the exit-door landmark.
      const exit = bunker.landmarks.find((l) => l.kind === "bunker_exit")!;
      expect(exit.pos).toEqual(bunker.objective.at);
    }
    // The closing monologue exists, and the way out leads back to the rift.
    expect(bunker.outro?.length ?? 0).toBeGreaterThan(0);
    expect(bunker.exitTo).toBe("the_rift");
  });

  it("fields the privatized security state as its horde", () => {
    const factions = [
      "cia_agent",
      "fbi_agent",
      "ice_agent",
      "soldier",
      "vacuum_bot",
    ];
    for (const id of factions) {
      expect(ENEMY_DEFS[id]?.role, id).toBe("minion");
      expect(
        bunker.waves?.budget.some((line) => line.enemy === id),
        id,
      ).toBe(true);
    }
  });
});
