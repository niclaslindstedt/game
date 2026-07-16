// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sim-only arrival helpers (src/sim/arrival.ts): `synthesizeArrival` mints a
// realistic leveled + geared hero to drop straight into a rung (so a top
// difficulty is measured as it's actually played, not as a fresh rookie), and
// `reviveHero` stands the immortal calibration hero back up AWAY from the swarm
// so a spawn-camp loop can't inflate the death count. Engine-rule smoke tests
// on the fixture catalog.

import { describe, expect, it } from "vitest";

import { createGame } from "@game/core";
import { reviveHero, synthesizeArrival } from "../../src/sim/arrival.ts";
// Installs the fixture catalogs before any game is built.
import { makeEnemy, startGame } from "./helpers.ts";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("synthesizeArrival", () => {
  it("mints a hero at the requested level, stronger than a fresh rookie", () => {
    const loadout = synthesizeArrival({
      difficulty: "medium",
      level: 20,
      levelId: "test_level",
      seed: 1,
    });
    expect(loadout.level).toBe(20);

    // Dressed into a run, the arrival hero is spun up: more hp than the
    // authored level-1 start, and his combat stats carry the spent points.
    const geared = createGame(1, "test_level", "medium", loadout);
    const fresh = createGame(1, "test_level", "medium");
    expect(geared.player.level).toBe(20);
    expect(geared.player.maxHp).toBeGreaterThan(fresh.player.maxHp);
    const spent =
      geared.player.stats.strength +
      geared.player.stats.dexterity +
      geared.player.stats.intelligence +
      geared.player.stats.stamina;
    expect(spent).toBeGreaterThan(
      fresh.player.stats.strength +
        fresh.player.stats.dexterity +
        fresh.player.stats.intelligence +
        fresh.player.stats.stamina,
    );
    // The bag is left empty — only the worn kit rides along (no fortune of
    // spare rares for the auto-shop to bank).
    expect(loadout.inventory.every((cell) => cell === null)).toBe(true);
  });

  it("is deterministic per options", () => {
    const opts = {
      difficulty: "medium" as const,
      level: 15,
      levelId: "test_level",
      seed: 3,
    };
    const a = synthesizeArrival(opts);
    const b = synthesizeArrival(opts);
    expect(a.equipment.weapon.defId).toBe(b.equipment.weapon.defId);
    expect(a.stats).toEqual(b.stats);
  });

  it("spends the arrival hero's points by the requested build", () => {
    const base = {
      difficulty: "medium" as const,
      level: 30,
      levelId: "test_level",
      seed: 5,
    };
    // A melee arrival banks its points into STRENGTH; a magic arrival into
    // INTELLIGENCE — so a --start-level class comparison drops in a hero who
    // actually represents the build being measured.
    const melee = synthesizeArrival({ ...base, build: "melee" });
    const magic = synthesizeArrival({ ...base, build: "magic" });
    expect(melee.stats.strength).toBeGreaterThan(magic.stats.strength);
    expect(magic.stats.intelligence).toBeGreaterThan(melee.stats.intelligence);
  });
});

describe("reviveHero", () => {
  it("stands the hero up away from the swarm, at full bars", () => {
    const state = startGame();
    // Pin a tight pack right on the spawn, then knock the hero down there.
    const spawn = { ...state.playerSpawn };
    for (let i = 0; i < 6; i++) {
      state.enemies.push(
        makeEnemy({
          pos: { x: spawn.x + i * 8, y: spawn.y },
          hp: 999,
          maxHp: 999,
        }),
      );
    }
    state.player.pos = { ...spawn };
    state.player.hp = 0;
    state.phase = "defeat";
    const nearestBefore = Math.min(
      ...state.enemies.map((e) => dist(e.pos, state.player.pos)),
    );

    reviveHero(state);

    expect(state.phase).toBe("playing");
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(state.player.z).toBe(0);
    // He no longer stands inside the pack — the safest open point is further
    // from the nearest body than the spawn was.
    const nearestAfter = Math.min(
      ...state.enemies.map((e) => dist(e.pos, state.player.pos)),
    );
    expect(nearestAfter).toBeGreaterThan(nearestBefore);
  });
});
