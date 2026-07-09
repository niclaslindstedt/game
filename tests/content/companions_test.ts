// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shipped companion roster: the rift's spareable uniques (history's
// missing plus LUCKY, folklore's) and the COMPANION_DEFS they join the party
// as. The engine rules live in tests/engine/companion_test.ts; this suite
// pins THIS game's content wiring — every spareable resolves to a registered
// companion, every companion's kit resolves to real defs, and LUCKY carries
// the +50% magic-find aura the rift's detour promises.

import { describe, expect, it } from "vitest";

import { COMPANION_DEFS, ENEMY_DEFS, LEVELS, WEAPON_DEFS } from "@game/core";

const SPAREABLE_IDS = Object.values(ENEMY_DEFS)
  .filter((def) => def.spareable)
  .map((def) => def.id)
  .sort();

describe("the rift's spareable uniques", () => {
  it("offers the verdict on history's missing — and on LUCKY", () => {
    expect(SPAREABLE_IDS).toEqual([
      "amelia_earhart",
      "grigori_rasputin",
      "lucky",
      "nikola_tesla",
    ]);
  });

  it("resolves every spareable to a registered companion twin", () => {
    for (const id of SPAREABLE_IDS) {
      const spareable = ENEMY_DEFS[id]!.spareable!;
      const companion = COMPANION_DEFS[spareable.companion];
      expect(companion, id).toBeDefined();
      // The twin wears the same face on the board and in the portrait box.
      expect(companion!.sprite).toBe(ENEMY_DEFS[id]!.sprite);
    }
  });

  it("never marks an apparition or a fleeing unique spareable", () => {
    for (const id of SPAREABLE_IDS) {
      expect(ENEMY_DEFS[id]!.apparition).toBeUndefined();
      expect(ENEMY_DEFS[id]!.flees).toBeUndefined();
    }
  });

  it("spawns LUCKY off the rift's main road, clover in pocket", () => {
    const spawn = LEVELS.the_rift!.spawns.find(
      (s) => "at" in s && s.enemy === "lucky",
    );
    expect(spawn).toBeDefined();
    const items = (ENEMY_DEFS.lucky!.loot?.items ?? []).map((entry) =>
      typeof entry === "string" ? entry : entry.defId,
    );
    expect(items).toContain("lucky_clover");
    // The clover is HIS: no level's random pool also rains it.
    for (const level of Object.values(LEVELS)) {
      expect(level.loot.gearPool).not.toContain("lucky_clover");
    }
  });
});

describe("the companion catalog", () => {
  it("arms every companion with a real weapon def", () => {
    for (const def of Object.values(COMPANION_DEFS)) {
      expect(WEAPON_DEFS[def.weapon], def.id).toBeDefined();
    }
  });

  it("gives every companion a joining scene and kill-quote banter", () => {
    for (const def of Object.values(COMPANION_DEFS)) {
      expect(def.joinWords?.length ?? 0, def.id).toBeGreaterThan(0);
      expect(def.killQuotes.length, def.id).toBeGreaterThan(0);
    }
  });

  it("hangs the +50% magic-find aura of luck on LUCKY", () => {
    expect(COMPANION_DEFS.lucky!.aura?.magicFind).toBeCloseTo(0.5);
    // Nobody else radiates it — the aura is his whole sales pitch.
    for (const def of Object.values(COMPANION_DEFS)) {
      if (def.id === "lucky") continue;
      expect(def.aura?.magicFind ?? 0, def.id).toBe(0);
    }
  });
});
