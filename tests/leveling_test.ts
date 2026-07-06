// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// XP, level-ups, and the six stats: kills grant XP proportional to the
// victim's max hp, each level banks a stat point, spending points changes
// derived numbers (hp, damage, crits, drops) the way the design says.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  closeInventory,
  LEVELING,
  openInventory,
  PLAYER,
  playerCritChance,
  STATS,
  step,
  WEAPON_DEFS,
  weaponDamage,
} from "@game/core";
import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  run,
  startGame,
  steerTo,
} from "./helpers.ts";

/** Kill one hand-placed ghost of the given max hp and return the state. */
function killGhostWorth(maxHp: number) {
  const state = startGame();
  state.player.stats.luck = 0;
  clearStage(state); // keep the parked boss so the objective stays open
  state.enemies.push(
    makeEnemy({
      pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
      hp: maxHp,
      maxHp,
    }),
  );
  run(state, idle, 8000, (s) => s.enemies.length === 1);
  return state;
}

describe("xp", () => {
  it("is proportional to the killed monster's max hp", () => {
    const small = killGhostWorth(20);
    expect(small.stats.xpGained).toBe(Math.round(20 * LEVELING.xpPerHp));
    expect(small.player.xp).toBe(small.stats.xpGained); // below the threshold

    const big = killGhostWorth(50);
    expect(big.stats.xpGained).toBe(Math.round(50 * LEVELING.xpPerHp));
  });

  it("levels up at the threshold, pauses, and banks a stat point", () => {
    const state = killGhostWorth(LEVELING.baseXpToLevel);
    expect(state.player.level).toBe(2);
    expect(state.player.pendingStatPoints).toBe(1);
    expect(state.phase).toBe("levelup");
    expect(state.events).toContainEqual({ type: "levelUp", level: 2 });
    // The next level costs more.
    expect(state.player.xpToNext).toBe(
      Math.round(LEVELING.baseXpToLevel * LEVELING.xpGrowth),
    );

    // The pause is real: time stands still until the point is spent.
    const time = state.stats.timeMs;
    step(state, idle, DT);
    expect(state.stats.timeMs).toBe(time);

    allocateStat(state, "luck");
    expect(state.phase).toBe("playing");
    expect(state.player.stats.luck).toBe(1);
    expect(state.player.pendingStatPoints).toBe(0);
  });

  it("banks multiple points when one kill crosses several thresholds", () => {
    const toLevel2 = LEVELING.baseXpToLevel;
    const toLevel3 = Math.round(LEVELING.baseXpToLevel * LEVELING.xpGrowth);
    const state = killGhostWorth(toLevel2 + toLevel3 + 10); // 10 into level 3
    expect(state.player.level).toBe(3);
    expect(state.player.pendingStatPoints).toBe(2);
    allocateStat(state, "health");
    expect(state.phase).toBe("levelup"); // one point still pending
    allocateStat(state, "dexterity");
    expect(state.phase).toBe("playing");
  });
});

describe("stats", () => {
  it("HEALTH raises max hp and current hp together", () => {
    const state = startGame();
    state.player.pendingStatPoints = 1;
    const before = state.player.maxHp;
    allocateStat(state, "health");
    expect(state.player.maxHp).toBe(before + STATS.healthPerPoint);
    expect(state.player.hp).toBe(before + STATS.healthPerPoint);
  });

  it("DEXTERITY scales ranged damage; STRENGTH and INTELLIGENCE do not", () => {
    const state = startGame(); // blaster equipped: ranged
    const base = weaponDamage(state);
    expect(base).toBe(WEAPON_DEFS.blaster!.damage);

    state.player.stats.strength = 5;
    state.player.stats.intelligence = 5;
    expect(weaponDamage(state)).toBe(base);

    state.player.stats.dexterity = 2;
    expect(weaponDamage(state)).toBeCloseTo(
      base * (1 + 2 * STATS.damageBonusPerPoint),
    );
  });

  it("SPEED quickens the walk", () => {
    const state = startGame();
    clearStage(state);
    const start = state.player.pos.x;
    step(state, steerTo(start + 1000, state.player.pos.y), DT);
    expect(state.player.pos.x - start).toBeCloseTo(
      PLAYER.speed * (DT / 1000),
      5,
    );

    state.player.stats.speed = 5;
    const mid = state.player.pos.x;
    step(state, steerTo(mid + 1000, state.player.pos.y), DT);
    expect(state.player.pos.x - mid).toBeCloseTo(
      PLAYER.speed * (1 + 5 * STATS.speedPerPoint) * (DT / 1000),
      5,
    );
  });

  it("LUCK raises the player's crit chance", () => {
    const state = startGame();
    const base = playerCritChance(state);
    expect(base).toBeCloseTo(STATS.baseCritChance);
    state.player.stats.luck = 3;
    expect(playerCritChance(state)).toBeCloseTo(
      STATS.baseCritChance + 3 * STATS.critChancePerLuck,
    );
  });

  it("a guaranteed crit doubles the damage dealt", () => {
    const state = startGame();
    state.player.stats.luck = 30; // crit chance > 1 → every hit crits
    clearStage(state);
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
      }),
    );
    run(state, idle, 400, (s) => s.stats.damageDealt > 0);
    expect(state.stats.damageDealt).toBe(
      Math.round(WEAPON_DEFS.blaster!.damage * STATS.critMultiplier),
    );
  });

  it("LUCK shrugs off the ghosts' critical grips", () => {
    const state = startGame();
    state.player.stats.luck = 5; // 0.1 ghost crit − 5×0.02 → 0
    state.enemies = [makeEnemy({ pos: { ...state.player.pos } })];
    step(state, idle, DT);
    expect(state.stats.damageTaken).toBe(12); // ghost's touch, never doubled
  });
});

describe("pauses", () => {
  it("the inventory pauses the run and resumes on close", () => {
    const state = startGame();
    openInventory(state);
    expect(state.phase).toBe("inventory");
    const time = state.stats.timeMs;
    step(state, idle, DT);
    expect(state.stats.timeMs).toBe(time);
    closeInventory(state);
    expect(state.phase).toBe("playing");
  });

  it("closing the inventory with banked points returns to the level-up choice", () => {
    const state = startGame();
    state.player.pendingStatPoints = 1;
    openInventory(state);
    closeInventory(state);
    expect(state.phase).toBe("levelup");
  });

  it("base hp starts at the configured value", () => {
    const state = startGame();
    expect(state.player.maxHp).toBe(PLAYER.maxHp);
  });
});
