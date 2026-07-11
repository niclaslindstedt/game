// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Test-scenario support (src/game/scenario.ts): `applyScenario` mutates a
// fresh run into an exact situation — hero position, vitals, build, gear,
// the field's population — so bug repros and performance probes start from
// a described state instead of being played into. Fed by the app's
// `?scenario=` URL param and used directly here.

import { describe, expect, it } from "vitest";

import {
  applyScenario,
  createGame,
  HELD_ITEMS,
  isExplored,
  weaponDef,
  xpToLevelUp,
  type GameState,
} from "@game/core";
import { DT, idle, run, SEED, startGame } from "./helpers.ts";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const boss = (state: GameState) =>
  state.enemies.find((e) => e.defId === "test_boss");

describe("scenario / opening", () => {
  it("skips the opening into the playing phase by default", () => {
    const state = createGame(SEED, "test_level");
    expect(state.phase).toBe("intro");
    applyScenario(state, {});
    expect(state.phase).toBe("playing");
    expect(state.player.disarmed).toBe(false);
  });

  it("skips a prelude cutscene too", () => {
    const state = createGame(SEED, "test_prelude_level");
    expect(state.phase).toBe("cutscene");
    applyScenario(state, {});
    expect(state.phase).toBe("playing");
  });

  it("keeps the authored opening with skipOpening false", () => {
    const state = createGame(SEED, "test_level");
    applyScenario(state, { skipOpening: false, hp: 5 });
    expect(state.phase).toBe("intro");
    expect(state.player.hp).toBe(5);
  });
});

describe("scenario / the hero", () => {
  it("sets hp last, clamped into [1, maxHp]", () => {
    const state = startGame();
    applyScenario(state, { hp: 2 });
    expect(state.player.hp).toBe(2);
    applyScenario(state, { hp: 99_999 });
    expect(state.player.hp).toBe(state.player.maxHp);
    applyScenario(state, { hp: -5 });
    expect(state.player.hp).toBe(1);
  });

  it("survives the gear-driven maxHp recompute (2 hp stays 2 hp)", () => {
    const state = startGame();
    applyScenario(state, { hp: 2, gear: { chest: "test_vest" } });
    // The vest grants +20 maxHp; the explicit hp still lands after it.
    expect(state.player.hp).toBe(2);
  });

  it("sets level and re-derives the xp curve", () => {
    const state = startGame();
    applyScenario(state, { level: 7 });
    expect(state.player.level).toBe(7);
    expect(state.player.xp).toBe(0);
    expect(state.player.xpToNext).toBe(xpToLevelUp(7));
  });

  it("sets absolute stat allocations, stamina, and coins", () => {
    const state = startGame();
    applyScenario(state, {
      stats: { strength: 4, luck: 2 },
      stamina: 0,
      coins: 123,
    });
    expect(state.player.stats.strength).toBe(4);
    expect(state.player.stats.luck).toBe(2);
    expect(state.player.stamina).toBe(0);
    expect(state.player.coins).toBe(123);
  });

  it("fills the powerup dock, capped at its size", () => {
    const state = startGame();
    applyScenario(state, {
      abilities: [
        "test_orbit",
        "test_storm",
        "test_stasis",
        "test_magnet",
        "test_nuke",
      ],
    });
    expect(state.player.heldAbilities.length).toBe(HELD_ITEMS.cap);
    expect(state.player.heldAbilities[0]).toBe("test_orbit");
  });
});

describe("scenario / equipment", () => {
  it("mints a named weapon plain at catalog durability", () => {
    const state = startGame();
    applyScenario(state, { weapon: "test_hammer" });
    const weapon = state.player.equipment.weapon;
    expect(weapon.defId).toBe("test_hammer");
    expect(weapon.durability).toBe(weaponDef("test_hammer").durability);
  });

  it("weapon null hands over the unbreakable fallback sidearm", () => {
    const state = startGame();
    applyScenario(state, { weapon: null });
    expect(state.player.equipment.weapon.defId).toBe("blaster");
    expect(state.player.equipment.weapon.durability).toBeUndefined();
  });

  it("an unknown weapon id keeps the held weapon", () => {
    const state = startGame();
    const before = state.player.equipment.weapon.defId;
    applyScenario(state, { weapon: "no_such_weapon" });
    expect(state.player.equipment.weapon.defId).toBe(before);
  });

  it("dresses and strips gear slots", () => {
    const state = startGame();
    applyScenario(state, { gear: { chest: "test_vest" } });
    expect(state.player.equipment.chest?.defId).toBe("test_vest");
    const dressedMax = state.player.maxHp;
    applyScenario(state, { gear: { chest: null } });
    expect(state.player.equipment.chest).toBeNull();
    expect(state.player.maxHp).toBe(dressedMax - 20);
  });

  it("refuses a piece minted into the wrong slot", () => {
    const state = startGame();
    applyScenario(state, { gear: { head: "test_vest" } });
    expect(state.player.equipment.head).toBeNull();
  });

  it("disarmed holsters the hero", () => {
    const state = startGame();
    applyScenario(state, { disarmed: true });
    expect(state.player.disarmed).toBe(true);
  });
});

describe("scenario / placement", () => {
  it("places the hero a stand-off from the boss, map revealed", () => {
    const state = startGame();
    applyScenario(state, { place: "boss" });
    const b = boss(state);
    expect(b).toBeDefined();
    const away = dist(state.player.pos, b!.pos);
    expect(away).toBeGreaterThan(60);
    expect(away).toBeLessThan(160);
    expect(isExplored(state, state.player.pos)).toBe(true);
  });

  it("places the hero at exact coordinates, clamped into the level", () => {
    const state = startGame();
    applyScenario(state, { place: { x: 1200, y: 800 } });
    expect(state.player.pos).toEqual({ x: 1200, y: 800 });
    applyScenario(state, { place: { x: -500, y: 99_999 } });
    expect(state.player.pos.x).toBeGreaterThan(0);
    expect(state.player.pos.y).toBeLessThan(state.level.height);
  });
});

describe("scenario / the field", () => {
  it("clearEnemies empties the field but keeps the objective boss", () => {
    const state = startGame();
    applyScenario(state, { clearEnemies: true });
    expect(state.enemies.length).toBe(1);
    expect(state.enemies[0]?.defId).toBe("test_boss");
    // The level must not read as cleared: no victory countdown after a step.
    run(state, idle, 5);
    expect(state.victoryCountdownMs).toBeNull();
  });

  it("stopWaves silences the horde spawner", () => {
    const state = startGame();
    applyScenario(state, { clearEnemies: true, stopWaves: true });
    // The HUD total collapses to what actually stands on the field.
    expect(state.stats.totalEnemies).toBe(1);
    // The wave spawner's floor (minAlive) would otherwise repopulate within
    // a few seconds of sim time.
    run(state, idle, Math.ceil(5000 / DT));
    expect(state.enemies.length).toBe(1);
  });

  it("spawns a ring of mobs at least minDistance out", () => {
    const state = startGame();
    applyScenario(state, {
      clearEnemies: true,
      stopWaves: true,
      spawns: [
        { enemy: "test_fodder", count: 60, minDistance: 100, maxDistance: 220 },
      ],
    });
    const fodder = state.enemies.filter((e) => e.defId === "test_fodder");
    expect(fodder.length).toBe(60);
    for (const mob of fodder) {
      expect(dist(mob.pos, state.player.pos)).toBeGreaterThanOrEqual(100);
    }
    expect(state.stats.totalEnemies).toBe(61);
  });

  it("spawns at an exact spot with `at`", () => {
    const state = startGame();
    applyScenario(state, {
      spawns: [{ enemy: "test_brute", at: { x: 500, y: 500 } }],
    });
    const brute = state.enemies.find(
      (e) => e.defId === "test_brute" && e.pos.x === 500 && e.pos.y === 500,
    );
    expect(brute).toBeDefined();
  });

  it("an unknown enemy id skips the spawn line without throwing", () => {
    const state = startGame();
    const before = state.enemies.length;
    applyScenario(state, { spawns: [{ enemy: "no_such_mob", count: 3 }] });
    expect(state.enemies.length).toBe(before);
  });

  it("is deterministic: same seed + same spec, same ring", () => {
    const build = () => {
      const state = startGame(123);
      applyScenario(state, {
        clearEnemies: true,
        spawns: [{ enemy: "test_fodder", count: 20, minDistance: 80 }],
      });
      return state.enemies.map(
        (e) => `${e.pos.x.toFixed(3)},${e.pos.y.toFixed(3)}`,
      );
    };
    expect(build()).toEqual(build());
  });
});
