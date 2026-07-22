// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Breakable crates: the hero's weapon smashes a crate open for GUARANTEED loot
// (mostly healing/stamina, sometimes gear, a unique likelier than a plain
// kill's). Covers the break/loot rules directly (crates.ts) and end-to-end
// through the autonomous auto-attack (step/).

import { describe, expect, it } from "vitest";

import { CHESTS, CRATES } from "@game/core";
import type { GameState, Obstacle } from "@game/core";

import {
  crateHitByCircle,
  crateMaxHp,
  cratesInCone,
  damageCrate,
  nearestCrate,
} from "../../src/game/crates.ts";
import {
  clearStage,
  equipBlaster,
  idle,
  run,
  SEED,
  startGame,
} from "./helpers.ts";

/** Drop a fresh breakable crate onto the field (replacing the obstacle array
 * so the spatial grid rebuilds, the same way create.ts and doors do). */
function addCrate(
  state: GameState,
  pos: { x: number; y: number },
  hp = 100,
): Obstacle {
  const crate: Obstacle = {
    id: state.nextId++,
    kind: "crate",
    sprite: "crate",
    pos: { ...pos },
    radius: 7,
    jumpable: true,
    breakable: true,
    hp,
    maxHp: hp,
  };
  state.obstacles = [...state.obstacles, crate];
  return crate;
}

describe("crate break hp scaling", () => {
  it("floors at the minimum and grows with the run's level", () => {
    expect(crateMaxHp(1, "medium")).toBeGreaterThanOrEqual(CRATES.minHp);
    // Deeper into the campaign a crate carries more hp (its blows-to-smash
    // stays flat only because the hero's damage grows in lockstep).
    expect(crateMaxHp(40, "medium")).toBeGreaterThan(crateMaxHp(1, "medium"));
  });
});

describe("damageCrate", () => {
  it("a survivor spits a chip and keeps its hp and its place on the field", () => {
    const state = startGame(SEED);
    const before = state.obstacles.length;
    const crate = addCrate(state, { x: 500, y: 500 }, 100);
    state.events = [];

    damageCrate(state, crate, 30);

    expect(crate.hp).toBe(70);
    expect(state.obstacles).toContain(crate);
    expect(state.obstacles.length).toBe(before + 1);
    expect(state.events.filter((e) => e.type === "crateHit")).toHaveLength(1);
    expect(state.events.some((e) => e.type === "crateBroken")).toBe(false);
  });

  it("a lethal blow smashes it: off the field, loot spilled, event fired", () => {
    const state = startGame(SEED);
    clearStage(state);
    const crate = addCrate(state, { x: 500, y: 500 }, 20);
    const itemsBefore = state.items.length;
    state.events = [];

    damageCrate(state, crate, 25);

    expect(state.obstacles).not.toContain(crate);
    // ALWAYS drops something — the guaranteed spill.
    expect(state.items.length).toBeGreaterThan(itemsBefore);
    const broken = state.events.filter((e) => e.type === "crateBroken");
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ sprite: "crate" });
  });
});

describe("crate loot", () => {
  it("every break drops loot, leaning on health/stamina with gear the rarer prize", () => {
    const state = startGame(SEED);
    clearStage(state);
    // A leveled hero so the gear roll clears the tier gates it would early on.
    state.player.level = 30;

    let consumables = 0;
    let gear = 0;
    const breaks = 400;
    for (let i = 0; i < breaks; i++) {
      const crate = addCrate(state, { x: 500, y: 500 }, 10);
      const before = state.items.length;
      damageCrate(state, crate, 20);
      // GUARANTEED: a break never comes up empty.
      const dropped = state.items.splice(before); // take just this break's spill
      expect(dropped.length).toBeGreaterThanOrEqual(1);
      for (const item of dropped) {
        if (item.kind === "medkit" || item.kind === "drink") consumables++;
        else if (item.kind === "equipment") gear++;
      }
    }

    // Health/stamina dominate the haul…
    expect(consumables).toBeGreaterThan(gear);
    // …but gear is a real, if rarer, prize (the crate's whole draw over a
    // plain consumable pickup).
    expect(gear).toBeGreaterThan(0);
  });
});

/** Drop a fresh CHEST (a SpaceZ locker) onto the field — a breakable that
 * carries the `chest` flag so it spills the richer D2-style haul. */
function addChest(
  state: GameState,
  pos: { x: number; y: number },
  hp = 10,
): Obstacle {
  const chest: Obstacle = {
    id: state.nextId++,
    kind: "chest",
    sprite: CHESTS.sprite,
    pos: { ...pos },
    radius: CHESTS.radius,
    jumpable: false,
    breakable: true,
    chest: true,
    hp,
    maxHp: hp,
  };
  state.obstacles = [...state.obstacles, chest];
  return chest;
}

describe("locker (chest) loot", () => {
  it("spills a marquee item ~80% of the time plus its guaranteed supplies", () => {
    const state = startGame(SEED);
    clearStage(state);
    // A leveled hero so the gear roll clears the tier gates it would early on.
    state.player.level = 30;

    let gearBreaks = 0;
    let consumables = 0;
    const breaks = 600;
    for (let i = 0; i < breaks; i++) {
      const chest = addChest(state, { x: 500, y: 500 }, 10);
      const before = state.items.length;
      damageCrate(state, chest, 20);
      const dropped = state.items.splice(before); // take just this break's spill
      // A locker ALWAYS gives up its guaranteed consumables ("some other items").
      const cons = dropped.filter(
        (it) => it.kind === "medkit" || it.kind === "drink",
      ).length;
      expect(cons).toBe(CHESTS.consumables);
      consumables += cons;
      if (dropped.some((it) => it.kind === "equipment")) gearBreaks++;
    }

    // The marquee item lands about 80% of the time — a real find, not a
    // guarantee (D2 chest feel). Wide bounds so the RNG never flakes.
    const rate = gearBreaks / breaks;
    expect(rate).toBeGreaterThan(0.7);
    expect(rate).toBeLessThan(0.9);
    // Every break paid out its supplies.
    expect(consumables).toBe(breaks * CHESTS.consumables);
  });

  it("is a richer haul than a plain crate — a break can spill two gear pieces", () => {
    const state = startGame(SEED);
    clearStage(state);
    state.player.level = 30;

    let twoGearBreaks = 0;
    for (let i = 0; i < 400; i++) {
      const chest = addChest(state, { x: 500, y: 500 }, 10);
      const before = state.items.length;
      damageCrate(state, chest, 20);
      const dropped = state.items.splice(before);
      const gear = dropped.filter((it) => it.kind === "equipment").length;
      if (gear >= 2) twoGearBreaks++;
    }
    // The bonus second item fires often enough to see across 400 breaks.
    expect(twoGearBreaks).toBeGreaterThan(0);
  });
});

describe("crate targeting helpers", () => {
  it("nearestCrate finds a breakable in range and ignores plain obstacles", () => {
    const state = startGame(SEED);
    clearStage(state);
    state.obstacles = []; // a clean field so the pick is unambiguous
    addCrate(state, { x: 560, y: 500 }, 50); // in range
    addCrate(state, { x: 5000, y: 5000 }, 50); // far away
    // A plain solid obstacle sitting even closer (but off the line to the
    // crate, so it never blocks the sight test) must never be picked — only
    // breakables are crate targets.
    state.obstacles = [
      ...state.obstacles,
      {
        id: state.nextId++,
        kind: "test_block",
        sprite: "test_block",
        pos: { x: 500, y: 520 },
        radius: 13,
        jumpable: false,
      },
    ];

    const from = { x: 500, y: 500 };
    const hit = nearestCrate(state, from, 120);
    expect(hit).toBeDefined();
    expect(hit?.breakable).toBe(true);
    expect(hit?.pos.x).toBe(560);
  });

  it("cratesInCone gathers crates the swing faces and crateHitByCircle finds an overlap", () => {
    const state = startGame(SEED);
    state.obstacles = [];
    const front = addCrate(state, { x: 560, y: 500 }, 50); // dead ahead
    addCrate(state, { x: 440, y: 500 }, 50); // behind — outside the cone

    const inCone = cratesInCone(
      state,
      { x: 500, y: 500 },
      { x: 1, y: 0 },
      120,
      Math.PI / 4,
    );
    expect(inCone).toEqual([front]);

    expect(crateHitByCircle(state, { x: 558, y: 500 }, 4)).toBe(front);
    expect(crateHitByCircle(state, { x: 500, y: 500 }, 4)).toBeUndefined();
  });
});

describe("the hero smashes crates autonomously", () => {
  it("a melee swing breaks a lone crate in reach when no foe is near", () => {
    const state = startGame(SEED); // medium starts on the melee crude_sword
    clearStage(state); // only the far-off boss remains, out of reach
    const hero = state.player.pos;
    const crate = addCrate(state, { x: hero.x + 30, y: hero.y }, 10);
    const itemsBefore = state.items.length;

    run(state, idle, 80, (s) => !s.obstacles.includes(crate));

    expect(state.obstacles).not.toContain(crate);
    expect(state.items.length).toBeGreaterThan(itemsBefore);
  });

  it("a hero's SHOT smashes a crate it would otherwise sail over", () => {
    const state = startGame(SEED);
    clearStage(state);
    equipBlaster(state); // a ranged bolt — a jumpable crate is normally flown over
    const hero = state.player.pos;
    const crate = addCrate(state, { x: hero.x + 70, y: hero.y }, 10);
    const itemsBefore = state.items.length;

    run(state, idle, 120, (s) => !s.obstacles.includes(crate));

    expect(state.obstacles).not.toContain(crate);
    expect(state.items.length).toBeGreaterThan(itemsBefore);
  });
});
