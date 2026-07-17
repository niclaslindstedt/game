// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level schema validator (website/scripts/asset-tools/level-schema.mjs) is
// the build-time guard that fails `npm run levels` on a malformed or
// dangling-reference YAML level. These tests lock its contract so a future edit
// can't quietly stop catching a bad id.

import { describe, expect, it } from "vitest";

// @ts-expect-error — build-tooling .mjs, no types; exercised as a plain module.
import { validateLevel } from "../../website/scripts/asset-tools/level-schema.mjs";

const refs = {
  enemies: new Set(["grunt"]),
  weapons: new Set(["pistol"]),
  gear: new Set(["vest"]),
  abilities: new Set(["orbs"]),
  thoughts: new Set(["first_blood"]),
  storyItems: new Set(["keycard"]),
  uniques: new Set(["relic"]),
  worldUniques: new Set(["worldrelic"]),
  doorKeys: new Set(["vault"]),
};

/** A minimal, fully-valid level for the reference case. */
const goodLevel = () => ({
  id: "x",
  index: 1,
  name: "X",
  width: 1000,
  height: 800,
  gravity: 300,
  biome: "b",
  foes: "FOES",
  tiles: { ground: { common: "g" } },
  playerSpawn: { x: 100, y: 100 },
  objective: { type: "killBoss" },
  mobLevels: [1, [2, 3], 5, 40],
  spawns: [{ enemy: "grunt", band: [0, 0.6] }],
  obstacles: [],
  decor: [],
  decorClearance: 40,
  intro: [["HELLO."]],
  loot: { weaponPool: ["pistol"], gearPool: ["vest"], abilityPool: ["orbs"] },
});

describe("validateLevel", () => {
  it("passes a well-formed level with resolvable references", () => {
    const { errors } = validateLevel(goodLevel(), refs, "a real description");
    expect(errors).toEqual([]);
  });

  it("rejects an unknown enemy id", () => {
    const def = goodLevel();
    def.spawns = [{ enemy: "ghost", band: [0, 0.5] }];
    const { errors } = validateLevel(def, refs, "desc");
    expect(errors.some((e: string) => e.includes("ghost"))).toBe(true);
  });

  it("rejects a missing required field", () => {
    const def = goodLevel();
    delete (def as Record<string, unknown>).loot;
    const { errors } = validateLevel(def, refs, "desc");
    expect(errors.some((e: string) => e.includes("loot"))).toBe(true);
  });

  it("rejects a locked door with no matching key", () => {
    const def = goodLevel();
    (def as Record<string, unknown>).doors = [
      { id: "nokey", from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, radius: 8 },
    ];
    const { errors } = validateLevel(def, refs, "desc");
    expect(errors.some((e: string) => e.includes("nokey"))).toBe(true);
  });

  it("rejects an off-map safe zone and a non-ascending tempo curve", () => {
    const def = goodLevel();
    (def as Record<string, unknown>).safeZones = [
      { shape: "rect", rect: { x: 900, y: 0, width: 400, height: 100 } },
    ];
    (def as Record<string, unknown>).tempo = [
      { at: 0.5, intensity: 1 },
      { at: 0.2, intensity: 1 },
    ];
    const { errors } = validateLevel(def, refs, "desc");
    expect(errors.some((e: string) => e.includes("safeZones"))).toBe(true);
    expect(errors.some((e: string) => e.includes("ascend"))).toBe(true);
  });

  it("warns on a placeholder description", () => {
    const { warnings } = validateLevel(goodLevel(), refs, "TODO: fill in");
    expect(warnings.length).toBeGreaterThan(0);
  });
});
