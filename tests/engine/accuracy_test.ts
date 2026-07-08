// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Accuracy: a weapon blow can come to nothing two ways — the hero's own MISS
// or the foe's DODGE — and DEXTERITY (hit rate) trims both. Conjured abilities
// bypass the roll and always connect. The tuning lives in `ACCURACY`
// (config.ts); the rolls in `playerMissChance` / `enemyDodgeChance` (items.ts)
// fire from the weapon paths in `hitEnemy` (loot.ts).

import { describe, expect, it } from "vitest";

import {
  ACCURACY,
  effectiveStat,
  enemyDodgeChance,
  playerMissChance,
  step,
  type GameEvent,
  type GameState,
} from "@game/core";

import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  run,
  startGame,
  stopWaves,
} from "./helpers.ts";

/** Drive the run for `steps`, gathering every event emitted. */
function swingAndCollect(state: GameState, steps: number): GameEvent[] {
  const collected: GameEvent[] = [];
  for (let i = 0; i < steps; i++) {
    step(state, idle, DT);
    collected.push(...state.events);
  }
  return collected;
}

describe("player miss chance", () => {
  it("starts at the innate whiff and DEXTERITY trims it to the floor", () => {
    const state = startGame();
    expect(effectiveStat(state, "dexterity")).toBe(0);
    expect(playerMissChance(state)).toBeCloseTo(ACCURACY.baseMiss);

    state.player.stats.dexterity = 1;
    expect(playerMissChance(state)).toBeCloseTo(
      ACCURACY.baseMiss - ACCURACY.perDex,
    );

    // Enough DEX zeroes the whiff — it never goes below the floor.
    state.player.stats.dexterity = 100;
    expect(playerMissChance(state)).toBe(ACCURACY.minMiss);
  });
});

describe("enemy dodge chance", () => {
  it("is the enemy's base evasion, trimmed by DEXTERITY toward zero", () => {
    const state = startGame();
    expect(enemyDodgeChance(state, 0.4)).toBeCloseTo(0.4);

    state.player.stats.dexterity = 5;
    expect(enemyDodgeChance(state, 0.4)).toBeCloseTo(0.4 - 5 * ACCURACY.perDex);

    // Never negative: a nimble hero against a clumsy foe simply never misses.
    state.player.stats.dexterity = 100;
    expect(enemyDodgeChance(state, 0.4)).toBe(0);
  });
});

describe("weapon accuracy in combat", () => {
  /** Place one stationary target of the given def at the player's flank. */
  function placeTarget(state: GameState, defId = "test_minion") {
    const target = makeEnemy(
      { pos: { x: state.player.pos.x + 30, y: state.player.pos.y }, speed: 0 },
      defId,
    );
    state.enemies = [target];
    state.items = [];
    return target;
  }

  it("lands the blow when the accuracy roll passes", () => {
    const state = startGame(); // default crude sword: melee, keep it close
    stopWaves(state);
    const target = placeTarget(state);
    state.rng = () => 0.99; // never miss, never dodge, never crit

    const events = swingAndCollect(state, 40);
    expect(events.some((e) => e.type === "enemyHit")).toBe(true);
    expect(state.stats.damageDealt).toBeGreaterThan(0);
    expect(target.hp).toBeLessThan(target.maxHp);
  });

  it("whiffs on a MISS: no damage, an enemyMiss tag instead", () => {
    const state = startGame();
    stopWaves(state);
    const target = placeTarget(state);
    state.rng = () => 0; // the miss roll always fires

    const events = swingAndCollect(state, 40);
    expect(events.some((e) => e.type === "enemyMiss")).toBe(true);
    expect(events.some((e) => e.type === "enemyHit")).toBe(false);
    expect(state.stats.damageDealt).toBe(0);
    expect(target.hp).toBe(target.maxHp);
  });

  it("a nimble foe DODGES the blow the hero would otherwise land", () => {
    const state = startGame();
    stopWaves(state);
    // DEX high enough to zero the hero's own whiff, so the only way the blow
    // comes to nothing is the dodger's own evasion.
    state.player.stats.dexterity = 3;
    expect(playerMissChance(state)).toBe(0);
    const target = placeTarget(state, "test_dodger");
    expect(enemyDodgeChance(state, 0.9)).toBeGreaterThan(0.5);
    state.rng = () => 0.5; // clears the (zeroed) miss, trips the dodge

    const events = swingAndCollect(state, 40);
    expect(events.some((e) => e.type === "enemyDodge")).toBe(true);
    expect(events.some((e) => e.type === "enemyHit")).toBe(false);
    expect(target.hp).toBe(target.maxHp);
  });

  it("DEXTERITY buys through a dodger: the same swing now connects", () => {
    const state = startGame();
    stopWaves(state);
    // Enough hit rate to trim even a 0.9 base dodge to nothing.
    state.player.stats.dexterity = 100;
    expect(enemyDodgeChance(state, 0.9)).toBe(0);
    const target = placeTarget(state, "test_dodger");
    state.rng = () => 0.5; // same roll as the dodge case, now a clean hit

    const events = swingAndCollect(state, 40);
    expect(events.some((e) => e.type === "enemyHit")).toBe(true);
    expect(target.hp).toBeLessThan(target.maxHp);
  });

  it("abilities bypass accuracy: a conjured hit never whiffs", () => {
    const state = startGame();
    stopWaves(state);
    clearStage(state);
    // On the orbit ring (radius 38) so a sweeping orb passes through it.
    const target = makeEnemy(
      { pos: { x: state.player.pos.x + 38, y: state.player.pos.y }, speed: 0 },
      "test_minion",
    );
    state.enemies = [target];
    state.rng = () => 0; // would force a weapon MISS on every swing
    // Orbit orbs sweep on the sim clock and route through hitEnemy WITHOUT the
    // accuracy roll — so despite the always-miss rng the orbs still bite.
    state.player.abilities = [
      {
        defId: "test_orbit",
        remainingMs: 5000,
        cooldownMs: 0,
        angle: 0,
      },
    ];

    run(state, idle, 120, (s) => s.enemies.length === 0 || s.stats.kills > 0);
    expect(state.stats.damageDealt).toBeGreaterThan(0);
  });
});
